'use client';

/** 01 평면 작성 — 표준 평면 · 도면 이미지 자동 인식 · 직접 작도 */
import React, { useRef, useState } from 'react';
import { store, useApp } from '../useStore';
import { TEMPLATES, buildFromTemplate } from '../../lib/templates';
import { PlanTypeKey, ROOM_KIND_LABEL, nid, planArea, roomArea } from '../../lib/types';
import { imageDataFromSrc, readImageFile } from '../../lib/storage';
import { TraceResult, scaleFromArea, trace } from '../../lib/autotrace';
import { Callout, Field, Group, KV, Metric, NumField } from './ui';
import SelectionEditor from './SelectionEditor';
import { IconImage, IconRefresh, IconSketch, IconTrash } from '../Icons';

/** 자유 그리기 세 가지 몸짓을 그림으로 보여 준다 */
function GestureRoom() {
  return (
    <svg width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">
      <path
        d="M7 26c-1-7 0-14 1-17 4-1 22-2 30 0 1 4 1 12 0 17-8 2-27 1-31 0z"
        fill="#eaf1f8"
        stroke="#98a4b3"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="8" y="8" width="30" height="18" fill="none" stroke="#0e7c4f" strokeWidth="2" />
    </svg>
  );
}

function GestureWall() {
  return (
    <svg width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">
      <rect x="6" y="7" width="34" height="20" fill="#f5f1e8" stroke="#2a3038" strokeWidth="1.6" />
      <path d="M22 8c1.5 4-1.5 8 .5 12 .8 1.6.4 4 .4 6" fill="none" stroke="#98a4b3" strokeWidth="1.6" />
      <path d="M23 7v20" stroke="#0e7c4f" strokeWidth="2.4" />
    </svg>
  );
}

function GestureOpening() {
  return (
    <svg width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">
      <rect x="6" y="7" width="34" height="20" fill="#f1f3f5" stroke="#2a3038" strokeWidth="1.6" />
      <path d="M6 27h34" stroke="#2a3038" strokeWidth="3.4" />
      <path d="M16 27.5c3-1.2 8-1.2 12 0" fill="none" stroke="#98a4b3" strokeWidth="1.6" />
      <path d="M16 27h12" stroke="#c8102e" strokeWidth="3.4" />
    </svg>
  );
}

export default function Step1Plan() {
  const { plan, selection, level } = useApp();
  const [area, setArea] = useState(84);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [thr, setThr] = useState(0);
  const [gap, setGap] = useState(2);
  const [minArea, setMinArea] = useState(900);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadTemplate = (key: PlanTypeKey) => {
    const t = TEMPLATES.find((x) => x.key === key)!;
    const target = area > 0 ? area : t.defaultArea;
    const next = buildFromTemplate(key, target);
    next.meta = { ...plan.meta, area: target, template: key };
    store.replacePlan(next);
    store.toast(`${t.label} 평면을 ${target}㎡ 로 불러왔다.`);
    window.dispatchEvent(new Event('evac:fit'));
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const src = await readImageFile(file);
      const img = await imageDataFromSrc(src);
      const w = 1200;
      const h = Math.round((img.height / img.width) * w);
      store.update((p) => ({
        ...p,
        background: { src, x: 0, y: 0, w, h, opacity: 0.55, locked: true, visible: true },
      }));
      store.setLayers({ background: true });
      setResult(null);
      store.toast('도면 이미지를 배경으로 놓았다. 자동 인식을 눌러 본다.');
      window.dispatchEvent(new Event('evac:fit'));
    } catch (e) {
      store.toast(e instanceof Error ? e.message : '이미지를 읽지 못했다.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const runTrace = async () => {
    const bg = plan.background;
    if (!bg) return;
    setBusy(true);
    try {
      const img = await imageDataFromSrc(bg.src);
      const r = trace(img, { threshold: thr, closeGap: gap, minArea, minLine: 40 });
      setResult(r);
      const s = bg.w / r.width;
      store.update((p) => ({
        ...p,
        traceLines: r.lines.map((l) => ({
          x1: bg.x + l.x1 * s,
          y1: bg.y + l.y1 * s,
          x2: bg.x + l.x2 * s,
          y2: bg.y + l.y2 * s,
        })),
      }));
      store.toast(`실 후보 ${r.rooms.length}개를 찾았다.`);
    } catch (e) {
      store.toast(e instanceof Error ? e.message : '인식에 실패했다.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const applyTrace = () => {
    const bg = plan.background;
    if (!bg || !result) return;
    const s = bg.w / result.width;
    const rooms = result.rooms.map((r, i) => ({
      id: nid('r'),
      kind: 'room' as const,
      name: `실${i + 1}`,
      x: Math.round(bg.x + r.x * s),
      y: Math.round(bg.y + r.y * s),
      w: Math.round(r.w * s),
      h: Math.round(r.h * s),
    }));
    store.update((p) => ({ ...p, rooms: p.rooms.concat(rooms) }));
    store.toast(`실 ${rooms.length}개를 도면에 옮겼다. 이름과 용도를 고쳐 준다.`);
  };

  const fitToArea = () => {
    if (!result || !plan.background) return;
    const cmPerPx = scaleFromArea(result.rooms, plan.meta.area || area);
    const w = Math.round(result.width * cmPerPx);
    const h = Math.round(result.height * cmPerPx);
    store.update((p) => (p.background ? { ...p, background: { ...p.background, w, h } } : p));
    store.toast(`전용면적 ${plan.meta.area || area}㎡ 에 맞춰 배경 축척을 맞췄다.`);
  };

  const clearBg = () => {
    store.update((p) => ({ ...p, background: null, traceLines: [] }));
    setResult(null);
  };

  const total = planArea(plan);

  const sketchSection = (
    <Group title="자유 그리기">
      <p className="note" style={{ marginTop: 0 }}>
        도화지에 그리듯 마우스로 끌면 된다. 삐뚤빼뚤해도 손을 떼는 순간 반듯한 직선으로 펴진다.
      </p>
      <button type="button" className="btn pri wide" onClick={() => store.setTool('sketch')}>
        <IconSketch size={16} /> 자유 그리기 시작 (S)
      </button>
      <div style={{ height: 10 }} />
      <div className="sketch-guide">
        <GestureRoom />
        <div>
          <b>닫힌 모양 → 방</b>
          <span>집 모양을 한 바퀴 둘러 그린다. ㄱ자·ㄷ자로 그려도 알아서 나눠 받는다.</span>
        </div>
      </div>
      <div className="sketch-guide">
        <GestureWall />
        <div>
          <b>방을 가로질러 → 벽</b>
          <span>방 한가운데를 쭉 그으면 그 자리에 벽이 서고 방이 둘로 나뉜다.</span>
        </div>
      </div>
      <div className="sketch-guide">
        <GestureOpening />
        <div>
          <b>벽 위에 짧게 → 문·창</b>
          <span>벽을 따라 그으면 그 길이가 문 폭이 된다. 위 도구 막대에서 문·창을 고른다.</span>
        </div>
      </div>
      <p className="note">
        마음에 들지 않으면 <span className="kbd">Ctrl</span>+<span className="kbd">Z</span> 로 되돌린다.
      </p>
    </Group>
  );

  return (
    <div className="panel">
      {level === 'elementary' && sketchSection}

      <Group title="표준 평면 불러오기">
        <NumField label="전용면적" value={area} min={20} max={250} step={1} suffix="㎡" onChange={setArea} />
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="tmpl"
            aria-pressed={plan.meta.template === t.key}
            onClick={() => loadTemplate(t.key)}
          >
            <b>{t.label}</b>
            <span>{t.summary}</span>
          </button>
        ))}
        <p className="note">
          기준 평면을 입력한 전용면적에 맞추어 등비 축척한다. 불러온 뒤 실을 끌어 옮기거나 크기를 고칠 수 있다.
        </p>
      </Group>

      <Group title="도면 이미지로 시작">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => onPickImage(e.target.files?.[0])}
        />
        <div className="btn-row grow">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            <IconImage size={15} /> 도면 사진 올리기
          </button>
          {plan.background && (
            <button type="button" className="btn" onClick={clearBg} title="배경 지우기">
              <IconTrash size={15} />
            </button>
          )}
        </div>

        {plan.background && (
          <>
            <div style={{ height: 8 }} />
            <Field label="배경 진하기">
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={plan.background.opacity}
                onChange={(e) =>
                  store.update((p) =>
                    p.background ? { ...p, background: { ...p.background, opacity: Number(e.target.value) } } : p,
                  )
                }
              />
            </Field>
            <NumField
              label="배경 가로"
              value={plan.background.w}
              min={200}
              max={4000}
              step={10}
              suffix="cm"
              onChange={(v) =>
                store.update((p) =>
                  p.background
                    ? {
                        ...p,
                        background: { ...p.background, w: v, h: Math.round((p.background.h / p.background.w) * v) },
                      }
                    : p,
                )
              }
            />

            <h3 style={{ fontSize: 11.5, marginTop: 12 }}>자동 인식 보정</h3>
            <Field label="임계값">
              <input type="range" min={0} max={240} step={2} value={thr} onChange={(e) => setThr(Number(e.target.value))} />
            </Field>
            <p className="note" style={{ marginTop: -4 }}>
              {thr === 0 ? '자동(Otsu)' : `수동 ${thr}`} — 벽선이 끊기면 값을 올린다.
            </p>
            <Field label="선 잇기">
              <input type="range" min={0} max={6} step={1} value={gap} onChange={(e) => setGap(Number(e.target.value))} />
            </Field>
            <Field label="최소 면적">
              <input
                type="range"
                min={200}
                max={8000}
                step={100}
                value={minArea}
                onChange={(e) => setMinArea(Number(e.target.value))}
              />
            </Field>
            <div className="btn-row grow" style={{ marginTop: 6 }}>
              <button type="button" className="btn pri" onClick={runTrace} disabled={busy}>
                <IconRefresh size={15} /> 자동 인식
              </button>
              <button type="button" className="btn" onClick={applyTrace} disabled={!result || result.rooms.length === 0}>
                실로 옮기기
              </button>
            </div>

            {result && (
              <>
                <div className="metrics" style={{ marginTop: 10 }}>
                  <Metric v={result.rooms.length} l="실 후보" />
                  <Metric v={result.threshold} l="임계값" />
                  <Metric v={`${(result.inkRatio * 100).toFixed(0)}%`} l="벽 비율" />
                </div>
                <button type="button" className="btn wide" onClick={fitToArea}>
                  전용면적에 맞춰 축척 맞추기
                </button>
              </>
            )}

            <Callout kind="warn" title="인식이 잘 안 되면">
              보정 값을 바꿔도 잡히지 않는 도면이 있다. 그럴 때는 배경으로만 두고 실 작도 도구(R)로 위에 그대로
              그리면 된다.
            </Callout>
          </>
        )}
      </Group>

      {level === 'secondary' && sketchSection}

      {selection ? (
        <SelectionEditor />
      ) : (
        <Group title={`실 목록 (${plan.rooms.length})`}>
          {plan.rooms.length === 0 && <p className="note">아직 실이 없다.</p>}
          {plan.rooms.length > 0 && (
            <table className="tbl">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>용도</th>
                  <th className="n">면적</th>
                </tr>
              </thead>
              <tbody>
                {plan.rooms.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => {
                      store.setTool('select');
                      store.select({ kind: 'room', id: r.id });
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{r.name}</td>
                    <td>{ROOM_KIND_LABEL[r.kind]}</td>
                    <td className="n">{roomArea(r).toFixed(1)}㎡</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ height: 10 }} />
          <KV k="전용면적 합계 (발코니 제외)" v={`${total.toFixed(1)}㎡`} />
          <KV k="입력한 전용면적" v={`${plan.meta.area}㎡`} />
          {plan.rooms.length > 0 && Math.abs(total - plan.meta.area) / Math.max(1, plan.meta.area) > 0.05 && (
            <Callout kind="warn" title="면적이 입력값과 다르다">
              작도한 실 합계가 입력한 전용면적과 5% 넘게 차이 난다. 실 크기를 고치거나 세대 정보의 전용면적을
              고쳐 맞춘다.
            </Callout>
          )}
        </Group>
      )}
    </div>
  );
}
