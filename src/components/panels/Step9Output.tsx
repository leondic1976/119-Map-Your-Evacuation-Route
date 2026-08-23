'use client';

/** 09 산출물 — A4 인쇄 · PNG · 프로젝트 파일 */
import React, { useRef, useState } from 'react';
import { store, useApp } from '../useStore';
import { PRINT_FIGURE_ID } from '../PrintSheet';
import {
  clearLocal,
  downloadBlob,
  downloadPlan,
  hasStorage,
  planFilename,
  readPlanFile,
  svgToPng,
} from '../../lib/storage';
import { setMeta } from '../../lib/store';
import { diagnose } from '../../lib/risk';
import { Callout, Field, Group, KV, Metric } from './ui';
import { IconDownload, IconImage, IconOpen, IconPrint, IconSave, IconTrash } from '../Icons';
import { planArea } from '../../lib/types';

export default function Step9Output({ onPreview }: { onPreview: (v: boolean) => void }) {
  const { plan, savedAt, saveError } = useApp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const d = diagnose(plan);

  const savePng = async (scale: number) => {
    const svg = document.getElementById(PRINT_FIGURE_ID) as SVGSVGElement | null;
    if (!svg) {
      store.toast('도면을 찾지 못했다.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const blob = await svgToPng(svg, scale);
      downloadBlob(blob, planFilename(plan, 'png'));
      store.toast('PNG 이미지를 저장했다.');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'PNG 저장에 실패했다.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const next = await readPlanFile(f);
      store.replacePlan(next);
      store.toast('피난계획 파일을 불러왔다.');
      window.dispatchEvent(new Event('evac:fit'));
    } catch (e) {
      store.toast(e instanceof Error ? e.message : '파일을 읽지 못했다.', 'warn');
    }
  };

  return (
    <div className="panel">
      <Group title="A4 피난안내도">
        <div className="metrics">
          <Metric v={plan.rooms.length} l="실" />
          <Metric v={plan.routes.length} l="동선" />
          <Metric v={`${d.score}점`} l="진단 점수" />
        </div>
        <Field label="문서 제목" wide>
          <input
            type="text"
            value={plan.meta.title}
            onChange={(e) => store.update((p) => setMeta(p, { title: e.target.value }))}
          />
        </Field>
        <Field label="작성일" wide>
          <input
            type="text"
            value={plan.meta.madeOn}
            placeholder="비워 두면 인쇄하는 날짜로 들어간다"
            onChange={(e) => store.update((p) => setMeta(p, { madeOn: e.target.value }))}
          />
        </Field>
        <div className="btn-row grow" style={{ marginTop: 8 }}>
          <button type="button" className="btn pri" onClick={() => window.print()}>
            <IconPrint size={15} /> 인쇄 (A4 가로)
          </button>
          <button type="button" className="btn" onClick={() => onPreview(true)}>
            미리보기
          </button>
        </div>
        <p className="note">
          인쇄 설정에서 <b>용지 A4 · 가로 방향 · 배경 그래픽 켜기</b>를 확인한다. 냉장고나 현관 안쪽에 붙여
          둔다.
        </p>
      </Group>

      <Group title="이미지로 저장">
        <div className="btn-row grow">
          <button type="button" className="btn" onClick={() => savePng(2)} disabled={busy}>
            <IconImage size={15} /> PNG (보통)
          </button>
          <button type="button" className="btn" onClick={() => savePng(4)} disabled={busy}>
            PNG (고해상도)
          </button>
        </div>
        <p className="note">도면 부분만 이미지로 저장한다. 학급 게시물이나 가정통신문에 붙일 때 쓴다.</p>
      </Group>

      <Group title="프로젝트 파일">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => openFile(e.target.files?.[0])}
        />
        <div className="btn-row grow">
          <button type="button" className="btn" onClick={() => downloadPlan(plan)}>
            <IconSave size={15} /> JSON 저장
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <IconOpen size={15} /> 불러오기
          </button>
        </div>
        <p className="note">
          나중에 이어서 고치려면 JSON 파일로 저장해 둔다. 브라우저 자동 저장은 같은 기기·같은 브라우저에서만
          남는다.
        </p>
        <KV k="자동 저장" v={savedAt ? new Date(savedAt).toLocaleTimeString('ko-KR') : '아직 없음'} />
        <KV k="브라우저 저장 가능" v={hasStorage() ? '가능' : '불가(시크릿 모드 등)'} />
        {saveError && (
          <Callout kind="warn" title="자동 저장이 되지 않는다">
            시크릿 모드이거나 저장 공간이 막혀 있다. 편집은 그대로 되지만, JSON 저장을 꼭 함께 한다.
          </Callout>
        )}
        <div style={{ height: 8 }} />
        <button
          type="button"
          className="btn wide"
          onClick={() => {
            clearLocal();
            store.toast('브라우저에 저장된 내용을 지웠다.');
          }}
        >
          <IconTrash size={15} /> 브라우저 저장 내용 지우기
        </button>
      </Group>

      <Group title="개인정보">
        <p className="note" style={{ marginTop: 0 }}>
          이 서비스는 어떤 정보도 서버로 보내지 않는다. 입력한 동·호수, 올린 도면 이미지, 작성한 계획은 모두
          이용자 기기 안에서만 처리된다. 공용 PC에서 작업했다면 위 단추로 저장 내용을 지운다.
        </p>
        <KV k="전용면적" v={`${plan.meta.area}㎡ (작도 ${planArea(plan).toFixed(1)}㎡)`} />
        <KV k="배경 도면" v={plan.background ? '포함됨 (파일 크기 증가)' : '없음'} />
      </Group>

      <Group title="수업에서 쓰기">
        <p className="note" style={{ marginTop: 0 }}>
          1차시 45분 기준 — 01~03단계 15분, 04~05단계 10분, 06~07단계 12분, 08~09단계 8분.
          모둠별로 서로 다른 발화 지점을 정해 훈련한 뒤, 결과 등급을 비교하면 토론 거리가 생긴다.
        </p>
        <button type="button" className="btn wide" onClick={() => downloadPlan(plan)}>
          <IconDownload size={15} /> 지금 상태 내려받기
        </button>
      </Group>
    </div>
  );
}
