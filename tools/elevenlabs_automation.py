#!/usr/bin/env python3
"""ElevenLabs 웹 TTS에 대사를 안전하게 입력하는 Playwright 보조 도구다.

기본 동작은 입력창을 채우는 데서 멈춘다. ``--generate``를 명시하고
대화형 확인까지 마쳐야 크레딧을 쓰는 생성 단추를 누른다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import urlparse


TTS_URL = "https://elevenlabs.io/app/speech-synthesis/text-to-speech"
GENERATE_NAME = re.compile(
    r"^\s*((?:re)?generate(?:\s+speech)?|create\s+speech|"
    r"음성(?:을)?\s*생성(?:하기)?|생성(?:하기)?)\b",
    re.IGNORECASE,
)
EDITOR_NAME = re.compile(
    r"(text\s*to\s*speech|text\s*input|speech\s*text|script|"
    r"enter\s+text|type\s+text|paste\s+text|텍스트|대본|음성)",
    re.IGNORECASE,
)
DOWNLOAD_NAME = re.compile(r"(download|내려받기|다운로드)", re.IGNORECASE)
PLAY_NAME = re.compile(r"^(play|재생)\b", re.IGNORECASE)
VOICE_TRIGGER_NAME = re.compile(
    r"(select|choose|change).*(voice)|(voice).*(select|choose|change)|"
    r"(목소리|음성).*(선택|바꾸기|변경)",
    re.IGNORECASE,
)
VOICE_SEARCH_NAME = re.compile(
    r"(search|find).*(voice)|(voice).*(search|find)|"
    r"(목소리|음성).*(검색|찾기)|start\s+typing\s+to\s+search",
    re.IGNORECASE,
)
USE_VOICE_NAME = re.compile(
    r"^(use|select|choose).*(voice)|^(이 목소리 사용|목소리 선택|음성 선택)",
    re.IGNORECASE,
)
MP3_NAME = re.compile(r"MP3(?:\s*\(?128\s*kbps\)?)?", re.IGNORECASE)
VOICE_SCRIPT_ITEM = re.compile(
    r"^####\s+\d+\.\s+`(?P<name>[^`]+)`\s*$"
    r"(?:(?!^####\s).)*?^```text\s*$\s*"
    r"(?P<text>.*?)\s*^```\s*$",
    re.MULTILINE | re.DOTALL,
)

DYNAMIC_AUDIO_TEXT: dict[tuple[str, str], str] = {
    (
        "fail.RULE-C-03",
        "easy",
    ): "문이 하나도 없는 방을 찾았어. 왼쪽에서 문을 고르고 이 방의 벽을 눌러 놓아 주자.",
    (
        "fail.RULE-C-03",
        "normal",
    ): "문이 없는 방이 있습니다. 왼쪽 팔레트에서 문을 고르고 이 방의 벽을 누르세요.",
    (
        "pass.RULE-F-05",
        "easy",
    ): "다른 피난 길로 가는 길이구나. 잘 골랐어.",
    (
        "pass.RULE-F-05",
        "normal",
    ): "보조 경로가 피난설비에서 끝납니다.",
}


@dataclass(frozen=True)
class SpeechItem:
    """한 번 생성할 대사와 사람이 알아볼 항목 이름이다."""

    text: str
    name: str


class AutomationError(RuntimeError):
    """이용자가 조치할 수 있는 자동화 오류다."""


def repository_root() -> Path:
    return Path(__file__).resolve().parents[1]


def private_state_root() -> Path:
    """쿠키와 진단 자료를 저장소 밖의 사용자 전용 경로에 둔다."""

    if os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "ElevenLabsPlaywright"
    if os.environ.get("XDG_STATE_HOME"):
        return Path(os.environ["XDG_STATE_HOME"]) / "elevenlabs-playwright"
    return Path.home() / ".local" / "state" / "elevenlabs-playwright"


def is_inside(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def require_outside_repository(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if is_inside(resolved, repository_root()):
        raise AutomationError(
            f"{label}은 저장소 안에 둘 수 없다: {resolved}\n"
            "로그인 정보나 화면 내용이 커밋되지 않도록 저장소 밖 경로를 지정한다."
        )
    return resolved


def clean_text(value: Any, item_name: str) -> str:
    if not isinstance(value, str):
        raise AutomationError(f"{item_name}의 text는 문자열이어야 한다.")
    text = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        raise AutomationError(f"{item_name}의 대사가 비어 있다.")
    return text


def parse_json_items(raw: str) -> list[SpeechItem]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AutomationError(
            f"JSON 입력을 읽을 수 없다: {exc.msg} (줄 {exc.lineno})"
        ) from exc

    if isinstance(data, dict) and "items" in data:
        data = data["items"]
    elif isinstance(data, dict):
        data = [{"name": key, "text": value} for key, value in data.items()]

    if not isinstance(data, list):
        raise AutomationError("JSON은 문자열 배열, 항목 배열, 또는 items 배열이어야 한다.")

    items: list[SpeechItem] = []
    for index, value in enumerate(data, start=1):
        default_name = f"항목 {index}"
        if isinstance(value, str):
            items.append(SpeechItem(clean_text(value, default_name), default_name))
            continue
        if not isinstance(value, dict):
            raise AutomationError(f"{default_name}은 문자열 또는 객체여야 한다.")
        if value.get("generate") is False:
            continue
        name_value = value.get("name") or value.get("filename") or value.get("id")
        name = str(name_value).strip() if name_value is not None else default_name
        items.append(SpeechItem(clean_text(value.get("text"), name), name))
    return items


def parse_voice_script(raw: str) -> list[SpeechItem]:
    items = [
        SpeechItem(clean_text(match.group("text"), match.group("name")), match.group("name"))
        for match in VOICE_SCRIPT_ITEM.finditer(raw)
    ]
    if not items:
        raise AutomationError(
            "VOICE-SCRIPT 형식의 `#### 번호. `파일명``과 바로 뒤 text 코드 블록을 찾지 못했다."
        )
    return items


def parse_input_file(path: Path, input_format: str) -> list[SpeechItem]:
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise AutomationError(f"입력 파일을 읽을 수 없다: {path} ({exc})") from exc

    selected = input_format
    if selected == "auto":
        selected = "json" if path.suffix.lower() == ".json" else "voice-script" if path.suffix.lower() == ".md" else "lines"

    if selected == "json":
        return parse_json_items(raw)
    if selected == "voice-script":
        return parse_voice_script(raw)
    if selected == "lines":
        return [
            SpeechItem(clean_text(line, f"줄 {index}"), f"줄 {index}")
            for index, line in enumerate(raw.splitlines(), start=1)
            if line.strip()
        ]
    if selected == "blocks":
        blocks = re.split(r"\n[ \t]*\n+", raw.strip()) if raw.strip() else []
        return [
            SpeechItem(clean_text(block, f"문단 {index}"), f"문단 {index}")
            for index, block in enumerate(blocks, start=1)
        ]
    raise AutomationError(f"지원하지 않는 입력 형식이다: {selected}")


def filename_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    if not slug:
        raise AutomationError(f"파일 이름으로 바꿀 수 없는 id다: {value}")
    return slug


def project_voice_lines(root: Path) -> list[tuple[str, str]]:
    source = (root / "src" / "content" / "voice.ts").read_text(encoding="utf-8")
    match = re.search(
        r"export const VOICE_LINES:[^=]+\s*=\s*\{(?P<body>[\s\S]*?)\n\};",
        source,
    )
    if match is None:
        raise AutomationError("src/content/voice.ts에서 VOICE_LINES를 찾지 못했다.")
    entries = re.findall(r"^\s*'(v-[^']+)':\s*'([^']*)',\s*$", match.group("body"), re.MULTILINE)
    if not entries:
        raise AutomationError("VOICE_LINES에서 대사를 찾지 못했다.")
    return entries


def build_project_manifest(root: Path) -> dict[str, Any]:
    rules_path = root / "src" / "content" / "guide" / "rules.json"
    try:
        rules = json.loads(rules_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AutomationError(f"가이드 대사를 읽지 못했다: {rules_path} ({exc})") from exc
    if not isinstance(rules, list):
        raise AutomationError("가이드 규칙 JSON은 배열이어야 한다.")

    items: list[dict[str, Any]] = []
    guide_display_characters = 0
    guide_audio_characters = 0
    generalized_count = 0
    for rule in rules:
        if not isinstance(rule, dict) or not isinstance(rule.get("text"), dict):
            raise AutomationError("가이드 규칙에 id 또는 text가 없다.")
        rule_id = str(rule.get("id") or "").strip()
        if not rule_id:
            raise AutomationError("가이드 규칙 id가 비어 있다.")
        for grade_mode in ("easy", "normal"):
            display_text = clean_text(rule["text"].get(grade_mode), f"{rule_id}.{grade_mode}")
            guide_display_characters += len(display_text)
            placeholders = sorted(set(re.findall(r"\{(\w+)\}", display_text)))
            text_value = display_text
            if placeholders:
                text_value = DYNAMIC_AUDIO_TEXT.get((rule_id, grade_mode), "")
                if not text_value:
                    raise AutomationError(
                        f"동적 대사의 일반화 음성이 없다: {rule_id}.{grade_mode}"
                    )
                generalized_count += 1
            guide_audio_characters += len(text_value)
            item: dict[str, Any] = {
                "id": f"guide:{rule_id}:{grade_mode}",
                "filename": f"guide-{filename_slug(rule_id)}-{grade_mode}.mp3",
                "source": "guide/rules.json",
                "ruleId": rule_id,
                "gradeMode": grade_mode,
                "speaker": rule.get("speaker"),
                "text": text_value,
                "characters": len(text_value),
                "generate": True,
            }
            if placeholders:
                item["placeholders"] = placeholders
                item["displayTextTemplate"] = display_text
                item["generalizedAudio"] = True
            items.append(item)

    voice_lines = project_voice_lines(root)
    voice_characters = 0
    for voice_id, text_value in voice_lines:
        voice_characters += len(text_value)
        items.append(
            {
                "id": f"critical:{voice_id}",
                "filename": f"{voice_id}.mp3",
                "source": "src/content/voice.ts#VOICE_LINES",
                "voiceId": voice_id,
                "speaker": "guide",
                "text": text_value,
                "characters": len(text_value),
                "generate": True,
                "offlineEmbed": True,
            }
        )

    filenames = [str(item["filename"]) for item in items]
    if len(filenames) != len(set(filenames)):
        raise AutomationError("음성 매니페스트에 중복 파일명이 있다.")
    generated_count = sum(1 for item in items if item["generate"])
    return {
        "schemaVersion": 1,
        "voice": "Juwonmom",
        "speed": 1.0,
        "sources": [
            "src/content/guide/rules.json",
            "src/content/voice.ts#VOICE_LINES",
        ],
        "strategy": {
            "web": "현재 가이드 이벤트에 대응하는 Juwonmom 정적 MP3만 재생하며 브라우저 TTS는 사용하지 않는다.",
            "standalone": "public/voice 전체를 dist/voice에 복사하고 상대 경로 MP3만 재생하며 브라우저 TTS는 사용하지 않는다.",
            "dynamic": "치환값이 있는 4개 변형은 화면은 개인화하고 음성은 일반화된 고정 MP3를 쓴다.",
        },
        "summary": {
            "guideRules": len(rules),
            "guideVariants": len(rules) * 2,
            "criticalClips": len(voice_lines),
            "logicalItems": len(items),
            "generatedItems": generated_count,
            "generalizedDynamicItems": generalized_count,
            "guideDisplayCharacters": guide_display_characters,
            "guideAudioCharacters": guide_audio_characters,
            "criticalCharacters": voice_characters,
            "totalDisplayCharacters": guide_display_characters + voice_characters,
            "generationCharacters": guide_audio_characters + voice_characters,
        },
        "items": items,
    }


def write_project_manifest(path: Path) -> None:
    manifest = build_project_manifest(repository_root())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    summary = manifest["summary"]
    print(
        f"음성 매니페스트를 썼다: {path}, 논리 {summary['logicalItems']}개, "
        f"생성 {summary['generatedItems']}개, 일반화 {summary['generalizedDynamicItems']}개"
    )


def load_items(args: argparse.Namespace) -> list[SpeechItem]:
    if args.text is not None:
        return [SpeechItem(clean_text(args.text, "직접 입력"), "직접 입력")]
    if args.input_file is not None:
        items = parse_input_file(args.input_file, args.input_format)
        if not items:
            raise AutomationError("입력 파일에 생성할 대사가 없다.")
        return items
    return []


def visible_count(locator: Any, limit: int = 30) -> int:
    try:
        count = min(locator.count(), limit)
    except Exception:
        return 0
    result = 0
    for index in range(count):
        try:
            if locator.nth(index).is_visible():
                result += 1
        except Exception:
            continue
    return result


def choose_visible(
    locator: Any,
    *,
    editable: bool = False,
    minimum_width: float = 1,
    minimum_height: float = 1,
) -> Any | None:
    """같은 선택자 중 보이는 가장 큰 요소를 고른다."""

    best: tuple[float, Any] | None = None
    try:
        count = min(locator.count(), 30)
    except Exception:
        return None
    for index in range(count):
        candidate = locator.nth(index)
        try:
            if not candidate.is_visible():
                continue
            if editable and not candidate.is_editable():
                continue
            attributes = " ".join(
                candidate.get_attribute(name) or ""
                for name in ("aria-label", "placeholder", "name", "type")
            ).lower()
            if editable and ("search" in attributes or "검색" in attributes):
                continue
            box = candidate.bounding_box()
            if box is None:
                continue
            if box["width"] < minimum_width or box["height"] < minimum_height:
                continue
            area = box["width"] * box["height"]
            if best is None or area > best[0]:
                best = (area, candidate)
        except Exception:
            continue
    return best[1] if best else None


def find_speech_editor(page: Any, timeout_ms: int) -> Any:
    """접근성 이름을 우선하고, 마지막에만 일반 편집 요소를 찾는다."""

    candidate_factories = [
        lambda: page.get_by_role("textbox", name=EDITOR_NAME),
        lambda: page.get_by_label(EDITOR_NAME),
        lambda: page.get_by_placeholder(EDITOR_NAME),
        lambda: page.locator("textarea"),
        lambda: page.locator('[contenteditable="true"][role="textbox"]'),
        lambda: page.locator('[contenteditable="true"]'),
    ]
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        for factory in candidate_factories:
            editor = choose_visible(
                factory(), editable=True, minimum_width=180, minimum_height=55
            )
            if editor is not None:
                return editor
        page.wait_for_timeout(250)
    raise AutomationError(
        "TTS 대사 입력창을 찾지 못했다. 로그인 여부와 Text to Speech 화면을 확인한다."
    )


def find_generate_button(page: Any, timeout_ms: int) -> Any:
    candidate_factories = [
        lambda: page.get_by_role("button", name=GENERATE_NAME),
        lambda: page.locator("button").filter(has_text=GENERATE_NAME),
    ]
    deadline = time.monotonic() + timeout_ms / 1000
    last_button: Any | None = None
    while time.monotonic() < deadline:
        for factory in candidate_factories:
            button = choose_visible(
                factory(), minimum_width=60, minimum_height=28
            )
            if button is None:
                continue
            last_button = button
            try:
                if button.is_enabled():
                    return button
            except Exception:
                continue
        page.wait_for_timeout(250)
    if last_button is not None:
        raise AutomationError(
            "음성 생성 단추가 비활성 상태다. 대사, 모델, 목소리, 남은 크레딧을 확인한다."
        )
    raise AutomationError(
        "음성 생성 단추를 찾지 못했다. ElevenLabs 화면 언어나 UI가 바뀌었는지 확인한다."
    )


def exact_text_pattern(value: str) -> re.Pattern[str]:
    return re.compile(rf"^\s*{re.escape(value)}\s*$", re.IGNORECASE)


def visible_exact_voice(page: Any, voice_name: str) -> Any | None:
    pattern = exact_text_pattern(voice_name)
    factories = [
        lambda: page.get_by_role("button", name=pattern),
        lambda: page.get_by_text(pattern, exact=True),
    ]
    for factory in factories:
        match = choose_visible(factory(), minimum_width=20, minimum_height=15)
        if match is not None:
            return match
    return None


def find_voice_trigger(page: Any, timeout_ms: int) -> Any:
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        factories = [
            lambda: page.get_by_role("button", name=VOICE_TRIGGER_NAME),
            lambda: page.locator("button").filter(has_text=VOICE_TRIGGER_NAME),
            lambda: page.get_by_text(
                re.compile(r"^\s*(voice|목소리|음성)\s*$", re.IGNORECASE)
            ).locator("xpath=following::button[1]"),
        ]
        for factory in factories:
            trigger = choose_visible(factory(), minimum_width=55, minimum_height=25)
            if trigger is not None:
                return trigger
        page.wait_for_timeout(250)
    raise AutomationError(
        "목소리 선택 단추를 찾지 못했다. TTS 화면에서 목소리 선택 영역을 확인한다."
    )


def select_voice(page: Any, voice_name: str, timeout_ms: int) -> None:
    """목소리 선택기를 열고 계정에 있는 정확한 이름을 고른다."""

    if visible_exact_voice(page, voice_name) is not None:
        print(f"목소리 `{voice_name}`이 이미 화면에 선택되어 있다.")
        return

    trigger = find_voice_trigger(page, timeout_ms)
    trigger.click()
    deadline = time.monotonic() + timeout_ms / 1000

    # 검색 입력창이 있으면 계정의 긴 목소리 목록을 먼저 좁힌다.
    while time.monotonic() < deadline:
        search_factories = [
            lambda: page.get_by_role("searchbox", name=VOICE_SEARCH_NAME),
            lambda: page.get_by_role("textbox", name=VOICE_SEARCH_NAME),
            lambda: page.get_by_placeholder(VOICE_SEARCH_NAME),
            lambda: page.locator(
                'input[placeholder*="voice" i], input[placeholder*="목소리" i], '
                'input[placeholder*="음성" i]'
            ),
        ]
        search_box = None
        for factory in search_factories:
            search_box = choose_visible(
                factory(), editable=True, minimum_width=120, minimum_height=25
            )
            if search_box is not None:
                break
        if search_box is not None:
            search_box.fill(voice_name)
            page.wait_for_timeout(700)
            break
        if visible_exact_voice(page, voice_name) is not None:
            break
        page.wait_for_timeout(250)

    target = visible_exact_voice(page, voice_name)
    if target is None:
        raise AutomationError(
            f"계정의 목소리 선택 화면에서 `{voice_name}`을 찾지 못했다. "
            "My Voices에 해당 목소리가 있는지 확인한다."
        )
    target.click()
    page.wait_for_timeout(500)

    # 일부 UI는 목소리 상세 화면에서 한 번 더 사용 단추를 요구한다.
    use_button = choose_visible(
        page.get_by_role("button", name=USE_VOICE_NAME),
        minimum_width=55,
        minimum_height=25,
    )
    if use_button is not None:
        use_button.click()
        page.wait_for_timeout(500)

    if visible_exact_voice(page, voice_name) is None:
        raise AutomationError(
            f"`{voice_name}`을 눌렀지만 TTS 화면의 선택 상태를 확인하지 못했다."
        )
    print(f"목소리 `{voice_name}` 선택을 확인했다.")


def set_numeric_slider(page: Any, label: str, target: float, timeout_ms: int) -> None:
    """접근성 slider를 키보드로 움직여 정확한 소수 값으로 맞춘다."""

    slider = page.get_by_role("slider", name=exact_text_pattern(label))
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        candidate = choose_visible(slider, minimum_width=5, minimum_height=5)
        if candidate is not None:
            slider = candidate
            break
        page.wait_for_timeout(200)
    else:
        raise AutomationError(f"{label} 설정 슬라이더를 찾지 못했다.")

    try:
        minimum = float(slider.get_attribute("aria-valuemin") or "")
        maximum = float(slider.get_attribute("aria-valuemax") or "")
    except ValueError as exc:
        raise AutomationError(f"{label} 슬라이더 범위를 읽지 못했다.") from exc
    if target < minimum or target > maximum:
        raise AutomationError(
            f"{label} {target}은 화면 범위 {minimum}~{maximum} 밖이다."
        )

    slider.focus()
    slider.press("Home")
    # ElevenLabs Speed는 0.01 간격이다. 키보드 조작은 픽셀 클릭보다 재현 가능하고
    # aria-valuenow로 최종값도 확인할 수 있다.
    steps = round((target - minimum) * 100)
    for _ in range(steps):
        slider.press("ArrowRight")
    page.wait_for_timeout(300)
    try:
        actual = float(slider.get_attribute("aria-valuenow") or "")
    except ValueError as exc:
        raise AutomationError(f"{label} 최종값을 읽지 못했다.") from exc
    if abs(actual - target) > 0.001:
        raise AutomationError(
            f"{label} 설정이 {target}이 아니라 {actual}이다. 생성을 중단했다."
        )
    print(f"{label} 설정을 {actual:g}으로 확인했다.")


def normalized_editor_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u200b", "")).strip()


def read_editor_text(editor: Any) -> str:
    try:
        tag_name = editor.evaluate("element => element.tagName.toLowerCase()")
        if tag_name in {"textarea", "input"}:
            return editor.input_value()
        return editor.inner_text()
    except Exception as exc:
        raise AutomationError("입력창에 들어간 대사를 다시 확인할 수 없다.") from exc


def fill_editor(editor: Any, text: str) -> None:
    try:
        editor.fill(text)
    except Exception:
        try:
            editor.click()
            editor.press("ControlOrMeta+A")
            editor.press("Backspace")
            editor.insert_text(text)
        except Exception as exc:
            raise AutomationError("TTS 입력창에 대사를 넣지 못했다.") from exc

    if normalized_editor_text(read_editor_text(editor)) != normalized_editor_text(text):
        raise AutomationError("입력창의 대사가 원문과 같지 않아 생성을 중단했다.")


def detect_page_error(page: Any) -> str | None:
    alerts = page.get_by_role("alert")
    try:
        count = min(alerts.count(), 10)
    except Exception:
        return None
    for index in range(count):
        alert = alerts.nth(index)
        try:
            if not alert.is_visible():
                continue
            text = re.sub(r"\s+", " ", alert.inner_text()).strip()
            if text and re.search(
                r"error|failed|credit|limit|오류|실패|크레딧|한도", text, re.IGNORECASE
            ):
                return text[:300]
        except Exception:
            continue
    return None


def generation_result_state(page: Any) -> tuple[int, int, int]:
    return (
        visible_count(page.locator("audio")),
        visible_count(page.get_by_role("button", name=DOWNLOAD_NAME)),
        visible_count(page.get_by_role("button", name=PLAY_NAME)),
    )


def page_is_busy(page: Any, generate_button: Any) -> bool:
    try:
        if not generate_button.is_visible() or not generate_button.is_enabled():
            return True
        if (generate_button.get_attribute("aria-busy") or "").lower() == "true":
            return True
    except Exception:
        return True
    return visible_count(page.locator('[aria-busy="true"], [role="progressbar"]')) > 0


def wait_for_generation(
    page: Any,
    generate_button: Any,
    before_state: tuple[int, int, int],
    timeout_ms: int,
) -> None:
    """단추의 busy 상태와 결과 제어의 변화를 함께 살핀다."""

    started = time.monotonic()
    deadline = started + timeout_ms / 1000
    saw_busy = False
    while time.monotonic() < deadline:
        error_text = detect_page_error(page)
        if error_text:
            raise AutomationError(f"ElevenLabs가 생성 오류를 알렸다: {error_text}")

        busy = page_is_busy(page, generate_button)
        saw_busy = saw_busy or busy
        result_changed = generation_result_state(page) != before_state
        elapsed = time.monotonic() - started

        if not busy and (saw_busy or result_changed):
            page.wait_for_timeout(700)
            return
        # UI가 busy 상태를 노출하지 않는 변형도 있다. 짧은 대사에서 단추가 계속
        # 활성 상태라면 충분히 기다린 뒤 History 보존을 믿고 다음 항목으로 간다.
        if not busy and not saw_busy and elapsed >= 10:
            print("  생성 완료 신호가 없어 10초 대기 후 다음 항목으로 진행한다.")
            return
        page.wait_for_timeout(250)

    raise AutomationError(
        f"{timeout_ms / 1000:.0f}초 안에 생성 완료를 확인하지 못했다."
    )


def output_filename(item: SpeechItem, index: int) -> str:
    proposed = Path(item.name).name
    if proposed.lower().endswith(".mp3") and re.fullmatch(
        r"[A-Za-z0-9._-]+\.mp3", proposed, re.IGNORECASE
    ):
        return proposed
    return f"speech-{index:03d}.mp3"


def choose_latest_visible(locator: Any) -> Any | None:
    """보이는 후보 가운데 화면에서 가장 아래쪽 후보를 고른다."""

    best: tuple[float, Any] | None = None
    try:
        count = min(locator.count(), 40)
    except Exception:
        return None
    for index in range(count):
        candidate = locator.nth(index)
        try:
            if not candidate.is_visible():
                continue
            box = candidate.bounding_box()
            if box is None:
                continue
            position = box["y"] + box["height"]
            if best is None or position >= best[0]:
                best = (position, candidate)
        except Exception:
            continue
    return best[1] if best else None


def wait_for_download_event(page: Any, action: Any, timeout_ms: int) -> Any | None:
    captured: list[Any] = []
    page.once("download", lambda download: captured.append(download))
    action()
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline and not captured:
        page.wait_for_timeout(100)
    return captured[0] if captured else None


def validate_mp3(path: Path) -> int:
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise AutomationError(f"내려받은 파일을 읽을 수 없다: {path} ({exc})") from exc
    if len(data) < 1024:
        raise AutomationError(f"내려받은 MP3가 너무 작다: {path} ({len(data)}바이트)")
    has_id3 = data.startswith(b"ID3")
    has_frame_sync = any(
        data[index] == 0xFF and data[index + 1] & 0xE0 == 0xE0
        for index in range(min(len(data) - 1, 8192))
    )
    if not has_id3 and not has_frame_sync:
        raise AutomationError(f"내려받은 파일에 MP3 헤더를 찾지 못했다: {path}")
    return len(data)


def download_latest_audio(
    page: Any,
    item: SpeechItem,
    index: int,
    download_dir: Path,
    timeout_ms: int,
    overwrite: bool,
) -> Path:
    destination = download_dir / output_filename(item, index)
    if destination.exists() and not overwrite:
        raise AutomationError(
            f"기존 파일을 덮어쓰지 않았다: {destination}. "
            "교체하려면 --overwrite를 명시한다."
        )
    download_dir.mkdir(parents=True, exist_ok=True)

    # 생성 완료 표시와 다운로드 단추가 뜨는 때가 조금 어긋난다. 이미 크레딧을 쓴 뒤이므로 기다린다.
    button = None
    deadline = time.monotonic() + min(timeout_ms, 30_000) / 1000
    while button is None and time.monotonic() < deadline:
        button = choose_latest_visible(page.get_by_role("button", name=DOWNLOAD_NAME))
        if button is None:
            button = choose_latest_visible(
                page.locator(
                    'button[aria-label*="download" i], button[title*="download" i]'
                )
            )
        if button is None:
            page.wait_for_timeout(300)
    if button is None:
        raise AutomationError("생성 결과의 다운로드 단추를 찾지 못했다.")

    download = wait_for_download_event(page, button.click, min(timeout_ms, 5_000))
    if download is None:
        # 형식 메뉴가 열린 경우 MP3 128kbps를 우선하고, 없으면 보이는 MP3를 고른다.
        mp3 = choose_latest_visible(page.get_by_role("menuitem", name=MP3_NAME))
        if mp3 is None:
            mp3 = choose_latest_visible(page.get_by_text(MP3_NAME))
        if mp3 is None:
            raise AutomationError(
                "다운로드 형식 메뉴에서 MP3를 찾지 못했다. History에서 형식을 확인한다."
            )
        download = wait_for_download_event(page, mp3.click, timeout_ms)
    if download is None:
        raise AutomationError("MP3 다운로드 시작을 확인하지 못했다.")

    failure = download.failure()
    if failure:
        raise AutomationError(f"MP3 다운로드가 실패했다: {failure}")
    download.save_as(str(destination))
    byte_count = validate_mp3(destination)
    print(f"  {destination.name} 저장 완료 ({byte_count / 1024:.0f}KB).")
    return destination


def save_diagnostics(page: Any | None, diagnostics_root: Path, error: BaseException) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    target = diagnostics_root / stamp
    target.mkdir(parents=True, exist_ok=False)
    error_path = target / "error.txt"
    error_path.write_text(f"{type(error).__name__}: {error}\n", encoding="utf-8")
    try:
        error_path.chmod(0o600)
    except OSError:
        pass

    if page is not None:
        try:
            page.screenshot(path=str(target / "page.png"), full_page=True)
        except Exception:
            pass
        try:
            html_path = target / "page.html"
            html_path.write_text(page.content(), encoding="utf-8")
            try:
                html_path.chmod(0o600)
            except OSError:
                pass
        except Exception:
            pass
    return target


def confirm_generation(items: Sequence[SpeechItem], assume_yes: bool) -> bool:
    character_count = sum(len(item.text) for item in items)
    print(
        f"생성 예정: {len(items)}개, 공백 포함 약 {character_count}자. "
        "ElevenLabs 크레딧을 사용하고 계정 History를 변경한다."
    )
    if assume_yes:
        print("--yes가 지정되어 생성 작업을 승인한 것으로 처리한다.")
        return True
    if not sys.stdin.isatty():
        raise AutomationError(
            "대화형 확인을 할 수 없다. 내용을 검토한 뒤 --generate --yes를 함께 지정한다."
        )
    expected = f"GENERATE {len(items)}"
    answer = input(f"계속하려면 정확히 {expected} 를 입력한다: ").strip()
    return answer == expected


def wait_before_close(no_wait: bool, headless: bool) -> None:
    if no_wait or headless:
        return
    if sys.stdin.isatty():
        input("브라우저 확인을 마치면 Enter를 눌러 닫는다: ")


def open_tts_page(context: Any, timeout_ms: int, reuse_existing: bool = False) -> Any:
    """새 TTS 탭을 확실히 연 뒤 오래된 빈 탭만 정리한다."""

    if reuse_existing:
        tts_pages = [page for page in context.pages if page.url.startswith(TTS_URL)]
        if tts_pages:
            page = tts_pages[-1]
            page.set_default_timeout(timeout_ms)
            page.bring_to_front()
            for old_page in tts_pages[:-1]:
                try:
                    old_page.close()
                except Exception:
                    continue
            return page

    blank_pages = [page for page in context.pages if page.url == "about:blank"]
    page = context.new_page()
    page.set_default_timeout(timeout_ms)
    try:
        page.goto(TTS_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        page.bring_to_front()
    except Exception:
        try:
            page.close()
        except Exception:
            pass
        raise
    for blank_page in blank_pages:
        if blank_page == page or blank_page.is_closed():
            continue
        try:
            if blank_page.url == "about:blank":
                blank_page.close()
        except Exception:
            continue
    return page


def validate_cdp_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
        "127.0.0.1",
        "localhost",
        "::1",
    }:
        raise AutomationError(
            "--cdp-url은 자동화 전용 브라우저의 로컬 주소만 허용한다."
        )
    if parsed.port is None:
        raise AutomationError("--cdp-url에는 로컬 디버깅 포트가 있어야 한다.")
    return value


def run_browser(args: argparse.Namespace, items: Sequence[SpeechItem]) -> None:
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise AutomationError(
            "Python Playwright가 설치되지 않았다. "
            "`py -m pip install playwright`와 `py -m playwright install chromium`을 실행한다."
        ) from exc

    diagnostics_root = require_outside_repository(
        args.diagnostics_dir, "진단 자료 경로"
    )
    profile_dir: Path | None = None
    if args.cdp_url is None:
        profile_dir = require_outside_repository(
            args.profile_dir, "브라우저 프로필 경로"
        )
        profile_dir.mkdir(parents=True, exist_ok=True)
    page: Any | None = None

    try:
        with sync_playwright() as playwright:
            owns_context = args.cdp_url is None
            if args.cdp_url is not None:
                browser = playwright.chromium.connect_over_cdp(
                    validate_cdp_url(args.cdp_url), timeout=args.timeout_ms
                )
                if not browser.contexts:
                    raise AutomationError("CDP 브라우저에서 사용할 컨텍스트를 찾지 못했다.")
                context = browser.contexts[0]
            else:
                launch_options: dict[str, Any] = {
                    "headless": args.headless,
                    "accept_downloads": True,
                    "slow_mo": args.slow_mo,
                }
                if args.channel != "chromium":
                    launch_options["channel"] = args.channel
                context = playwright.chromium.launch_persistent_context(
                    str(profile_dir), **launch_options
                )
            try:
                page = open_tts_page(
                    context, args.timeout_ms, reuse_existing=args.cdp_url is not None
                )

                if args.login:
                    print(
                        "열린 자동화 전용 브라우저에서 직접 로그인한다. "
                        "비밀번호는 이 스크립트에 입력하지 않는다."
                    )
                    if not sys.stdin.isatty():
                        raise AutomationError("--login은 대화형 터미널에서 실행해야 한다.")
                    input("로그인과 TTS 화면 이동을 마쳤으면 Enter를 누른다: ")
                    page.goto(
                        TTS_URL,
                        wait_until="domcontentloaded",
                        timeout=args.timeout_ms,
                    )
                    page.bring_to_front()
                    find_speech_editor(page, args.timeout_ms)
                    if profile_dir is not None:
                        print(f"로그인 프로필을 저장했다: {profile_dir}")
                    else:
                        print("연결된 자동화 전용 Chrome에서 로그인을 확인했다.")
                    return

                if not items:
                    raise AutomationError("입력할 대사가 없다.")

                find_speech_editor(page, args.timeout_ms)
                if args.voice:
                    select_voice(page, args.voice, args.timeout_ms)
                if args.speed is not None:
                    set_numeric_slider(page, "Speed", args.speed, args.timeout_ms)

                indexed_items = list(enumerate(items, start=1))
                if args.generate and args.skip_existing and args.download_dir is not None:
                    pending_items: list[tuple[int, SpeechItem]] = []
                    for source_index, item in indexed_items:
                        existing = args.download_dir.resolve() / output_filename(
                            item, source_index
                        )
                        if not existing.exists():
                            pending_items.append((source_index, item))
                            continue
                        try:
                            byte_count = validate_mp3(existing)
                            print(
                                f"기존 유효 파일 건너뜀: {existing.name} "
                                f"({byte_count / 1024:.0f}KB)"
                            )
                        except AutomationError:
                            if not args.overwrite:
                                raise
                            pending_items.append((source_index, item))
                    indexed_items = pending_items

                if not indexed_items:
                    print("모든 MP3가 이미 유효해 생성할 항목이 없다.")
                    return
                if args.offset:
                    indexed_items = indexed_items[args.offset :]
                if not indexed_items:
                    print("--offset 뒤에 생성할 항목이 없다.")
                    return
                if args.limit is not None:
                    indexed_items = indexed_items[: args.limit]

                confirm_items = [item for _, item in indexed_items]
                if args.generate and not confirm_generation(confirm_items, args.yes):
                    print("확인 문구가 일치하지 않아 생성하지 않았다.")
                    return

                work_items = indexed_items if args.generate else indexed_items[:1]
                for progress_index, (source_index, item) in enumerate(work_items, start=1):
                    print(
                        f"[{progress_index}/{len(work_items)}] {item.name}: "
                        f"{len(item.text)}자를 입력한다."
                    )
                    editor = find_speech_editor(page, args.timeout_ms)
                    fill_editor(editor, item.text)

                    if not args.generate:
                        print("안전 모드: 대사만 입력했고 Generate 단추는 누르지 않았다.")
                        if len(items) > 1:
                            print(
                                f"입력 파일의 첫 항목만 미리 보였다. "
                                f"나머지 {len(items) - 1}개도 만들려면 --generate가 필요하다."
                            )
                        break

                    button = find_generate_button(page, args.timeout_ms)
                    before_state = generation_result_state(page)
                    button.click()
                    wait_for_generation(
                        page, button, before_state, args.generation_timeout_ms
                    )
                    print(f"  {item.name} 생성 완료를 확인했다.")
                    if args.download_dir is not None:
                        download_latest_audio(
                            page,
                            item,
                            source_index,
                            args.download_dir.resolve(),
                            args.timeout_ms,
                            args.overwrite,
                        )

                wait_before_close(args.no_wait, args.headless)
            finally:
                if owns_context:
                    context.close()
    except PlaywrightError as exc:
        diagnostic_dir = save_diagnostics(page, diagnostics_root, exc)
        raise AutomationError(
            f"브라우저 자동화가 실패했다: {exc}\n진단 자료: {diagnostic_dir}"
        ) from exc
    except Exception as exc:
        diagnostic_dir = save_diagnostics(page, diagnostics_root, exc)
        if isinstance(exc, AutomationError):
            raise AutomationError(f"{exc}\n진단 자료: {diagnostic_dir}") from exc
        raise AutomationError(
            f"예상하지 못한 오류가 발생했다: {exc}\n진단 자료: {diagnostic_dir}"
        ) from exc


def run_self_test() -> None:
    assert [item.text for item in parse_json_items('["하나", "둘"]')] == ["하나", "둘"]
    mapped = parse_json_items('{"a.mp3": "첫 문장", "b.mp3": "둘째 문장"}')
    assert [(item.name, item.text) for item in mapped] == [
        ("a.mp3", "첫 문장"),
        ("b.mp3", "둘째 문장"),
    ]
    sample = """#### 1. `v-one.mp3`

입력창에 붙여넣을 내용:

```text
첫째 대사다.
```

#### 2. `v-two.mp3`

```text
둘째 대사다.
```
"""
    voice_items = parse_voice_script(sample)
    assert [(item.name, item.text) for item in voice_items] == [
        ("v-one.mp3", "첫째 대사다."),
        ("v-two.mp3", "둘째 대사다."),
    ]
    assert normalized_editor_text("첫째\n 둘째\u200b") == "첫째 둘째"
    assert is_inside(repository_root() / "tools", repository_root())
    assert not is_inside(private_state_root(), repository_root())
    print("자체 검사 6개를 통과했다. 브라우저를 열거나 크레딧을 사용하지 않았다.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "ElevenLabs 웹 TTS에 대사를 입력한다. 기본은 Generate를 누르지 않는 안전 모드다."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--text", help="입력창에 넣을 한 문장 또는 대사")
    source.add_argument(
        "--input-file", type=Path, help="여러 대사를 읽을 UTF-8 파일"
    )
    source.add_argument(
        "--login",
        action="store_true",
        help="자동화 전용 프로필을 열어 이용자가 직접 최초 로그인",
    )
    source.add_argument(
        "--self-test",
        action="store_true",
        help="입력 파서와 안전 경로만 검사하고 브라우저는 열지 않음",
    )
    source.add_argument(
        "--export-project-manifest",
        type=Path,
        help="앱의 가이드·핵심 대사를 전수 조사해 JSON 매니페스트로 저장",
    )
    parser.add_argument(
        "--input-format",
        choices=("auto", "lines", "blocks", "json", "voice-script"),
        default="auto",
        help="여러 항목 파일의 해석 방법",
    )
    action = parser.add_mutually_exclusive_group()
    action.add_argument(
        "--dry-run",
        action="store_true",
        help="첫 대사만 입력하고 Generate를 누르지 않음(기본 동작)",
    )
    action.add_argument(
        "--generate",
        action="store_true",
        help="확인 후 각 대사의 Generate 단추를 눌러 크레딧 사용",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="--generate의 대화형 확인을 생략하는 명시적 승인",
    )
    parser.add_argument(
        "--voice",
        help="TTS 화면에서 정확히 선택할 계정 목소리 이름(예: Juwonmom)",
    )
    parser.add_argument(
        "--speed",
        type=float,
        help="ElevenLabs Speed 슬라이더에 맞출 정확한 값(중간·기본은 1.0)",
    )
    parser.add_argument(
        "--download-dir",
        type=Path,
        help="생성 직후 MP3를 정확한 항목 이름으로 저장할 폴더",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="--download-dir에 같은 이름의 MP3가 있으면 교체",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="유효한 기존 MP3는 생성 전에 건너뛰어 중복 크레딧 사용을 막음",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="기존 파일을 건너뛴 뒤 이번 실행에서 생성할 최대 항목 수",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="매니페스트 앞에서 건너뛸 항목 수(전체 덮어쓰기 묶음 재생성용)",
    )
    parser.add_argument(
        "--profile-dir",
        type=Path,
        default=private_state_root() / "browser-profile",
        help="로그인을 재사용할 저장소 밖 브라우저 프로필",
    )
    parser.add_argument(
        "--cdp-url",
        help="이미 열린 자동화 전용 Chrome의 로컬 CDP 주소",
    )
    parser.add_argument(
        "--diagnostics-dir",
        type=Path,
        default=private_state_root() / "diagnostics",
        help="오류 화면과 HTML을 둘 저장소 밖 경로",
    )
    parser.add_argument(
        "--channel",
        choices=("chromium", "chrome", "msedge"),
        default="chromium",
        help="Playwright가 실행할 브라우저 채널",
    )
    parser.add_argument("--headless", action="store_true", help="브라우저 창을 숨김")
    parser.add_argument(
        "--no-wait", action="store_true", help="작업 뒤 Enter 입력을 기다리지 않고 닫음"
    )
    parser.add_argument(
        "--timeout-ms", type=int, default=30_000, help="화면 요소 대기 시간(ms)"
    )
    parser.add_argument(
        "--generation-timeout-ms",
        type=int,
        default=180_000,
        help="대사 한 건의 생성 완료 대기 시간(ms)",
    )
    parser.add_argument(
        "--slow-mo", type=int, default=0, help="Playwright 동작 사이 추가 지연(ms)"
    )
    return parser


def validate_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    if not (
        args.text is not None
        or args.input_file
        or args.login
        or args.self_test
        or args.export_project_manifest
    ):
        parser.error(
            "--text, --input-file, --login, --self-test, --export-project-manifest 중 하나가 필요하다."
        )
    if args.yes and not args.generate:
        parser.error("--yes는 --generate와 함께만 쓸 수 있다.")
    if args.download_dir is not None and not args.generate:
        parser.error("--download-dir은 --generate와 함께만 쓸 수 있다.")
    if args.overwrite and args.download_dir is None:
        parser.error("--overwrite는 --download-dir과 함께만 쓸 수 있다.")
    if args.skip_existing and args.download_dir is None:
        parser.error("--skip-existing은 --download-dir과 함께만 쓸 수 있다.")
    if args.limit is not None and (not args.generate or args.limit <= 0):
        parser.error("--limit은 --generate와 함께 1 이상의 값으로 지정한다.")
    if args.offset < 0 or (args.offset and not args.generate):
        parser.error("--offset은 --generate와 함께 0 이상의 값으로 지정한다.")
    if args.login and args.headless:
        parser.error("--login은 브라우저가 보여야 하므로 --headless와 함께 쓸 수 없다.")
    if args.timeout_ms <= 0 or args.generation_timeout_ms <= 0:
        parser.error("대기 시간은 0보다 커야 한다.")
    if args.slow_mo < 0:
        parser.error("--slow-mo는 0 이상이어야 한다.")
    if args.speed is not None and not 0.5 <= args.speed <= 2:
        parser.error("--speed 값이 비정상적이다.")


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    validate_args(parser, args)
    try:
        if args.self_test:
            run_self_test()
            return 0
        if args.export_project_manifest is not None:
            write_project_manifest(args.export_project_manifest)
            return 0
        items = load_items(args)
        run_browser(args, items)
        return 0
    except AutomationError as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n이용자가 중단했다. 크레딧 사용 여부는 ElevenLabs History에서 확인한다.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
