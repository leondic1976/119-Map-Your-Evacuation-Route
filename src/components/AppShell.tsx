'use client';

/**
 * 화면 골격 — 상단 바 · 단계 스테퍼 · 3분할 작업 화면 · 상태 표시줄.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Canvas from './Canvas';
import Inspector from './Inspector';
import PrintSheet from './PrintSheet';
import { OptionBar, ToolRail } from './ToolRail';
import { store, useApp, useField, useModel } from './useStore';
import { LAYER_LABEL, LEVELS, Layers, STEPS, TOOLS, removeSelection, setMeta, stepDone } from '../lib/store';
import { downloadPlan, loadLocal, readPlanFile } from '../lib/storage';
import { Pt, planArea } from '../lib/types';
import { routeASET, safetyMargin } from '../lib/firesim';
import { rset } from '../lib/routing';
import {
  IconCheck,
  IconClose,
  IconEye,
  IconInfo,
  IconPrint,
  IconRedo,
  IconSave,
  IconUndo,
} from './Icons';

const LAYER_KEYS: (keyof Layers)[] = [
  'rooms',
  'walls',
  'labels',
  'dims',
  'doors',
  'windows',
  'facilities',
  'routes',
  'notes',
  'smoke',
  'grid',
  'background',
  'trace',
];

export default function AppShell() {
  const app = useApp();
  const { plan, step, view, layers, sim, drill, toast, cursor, selection, tool, level } = app;
  const { model, grid } = useModel(plan);
  const [showLayers, setShowLayers] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [preview, setPreview] = useState(false);
  const [help, setHelp] = useState(false);

  /* 브라우저 자동 저장 복원 */
  useEffect(() => {
    store.restoreLevel();
    const saved = loadLocal();
    if (saved && saved.rooms.length > 0) {
      store.replacePlan(saved);
      store.toast('이전에 작성하던 내용을 불러왔다.');
      window.dispatchEvent(new Event('evac:fit'));
    }
  }, []);

  /* 알림 자동 소멸 */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => store.clearToast(), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  /* 확산 해석 */
  const simField = useField(plan, grid, sim.origin, sim.cause);
  const drillActive = step === 6 && drill.state;
  const field = drillActive ? drill.state!.field : simField;
  const time = drillActive ? drill.state!.t : sim.time;

  const blocked = useMemo(() => {
    if (step !== 5 || !simField) return [];
    return plan.routes
      .map((r) => {
        const m = safetyMargin(routeASET(simField, grid, r), rset(r, plan.meta.walker));
        return m.verdict === 'fail' && m.at ? { x: m.at.x, y: m.at.y, label: r.label } : null;
      })
      .filter(Boolean) as { x: number; y: number; label: string }[];
  }, [step, simField, grid, plan.routes, plan.meta.walker]);

  /* 단축키 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadPlan(store.getState().plan);
        return;
      }
      if (meta && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
        return;
      }
      if (meta) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = store.getState().selection;
        if (sel) {
          e.preventDefault();
          store.update((p) => removeSelection(p, sel));
          store.select(null);
        }
        return;
      }
      if (e.key === '[') {
        store.setStep(store.getState().step - 1);
        return;
      }
      if (e.key === ']') {
        store.setStep(store.getState().step + 1);
        return;
      }
      if (e.key === '0') {
        window.dispatchEvent(new Event('evac:fit'));
        return;
      }
      if (e.key === '?') {
        setHelp(true);
        return;
      }
      const hit = TOOLS.find((x) => x.shortcut.toLowerCase() === e.key.toLowerCase());
      if (hit) store.setTool(hit.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPickIgnition = (p: Pt) => {
    store.setSim({ origin: p, time: Math.max(30, sim.time) });
    setPickMode(false);
    store.setLayers({ smoke: true });
  };

  const saved = app.savedAt ? new Date(app.savedAt).toLocaleTimeString('ko-KR', { hour12: false }) : null;
  const selLabel = selection
    ? {
        room: '실',
        door: '문',
        window: '창',
        facility: '설비',
        route: '동선',
        note: '주기',
      }[selection.kind]
    : null;

  return (
    <>
      <div className="app">
        {/* 상단 바 */}
        <div className="topbar">
          <div className="brand">
            <BrandMark />
            <span>
              우리 아파트 피난로 그리기 <small>공동주택 세대 피난계획</small>
            </span>
          </div>
          <input
            className="doc-title"
            value={plan.meta.title}
            aria-label="문서 제목"
            onChange={(e) => store.update((p) => setMeta(p, { title: e.target.value }))}
          />
          <div className="level-seg" role="group" aria-label="이용 수준">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={level === l.key}
                title={l.hint}
                onClick={() => store.setLevel(l.key)}
              >
                {l.short}
              </button>
            ))}
          </div>

          <span className={`save-chip${app.saveError ? ' err' : ''}`} title="브라우저 자동 저장 상태">
            <i className="save-dot" />
            {app.saveError ? '자동 저장 불가' : saved ? `자동 저장 ${saved}` : '자동 저장 대기'}
          </span>

          <span className="topbar-spacer" />

          <button type="button" className="tb" onClick={() => store.undo()} disabled={app.past.length === 0} title="실행 취소 (Ctrl+Z)">
            <IconUndo size={15} />
          </button>
          <button type="button" className="tb" onClick={() => store.redo()} disabled={app.future.length === 0} title="다시 실행 (Ctrl+Shift+Z)">
            <IconRedo size={15} />
          </button>
          <div style={{ position: 'relative' }}>
            <button type="button" className="tb" onClick={() => setShowLayers((v) => !v)} aria-expanded={showLayers}>
              <IconEye size={15} /> 보기
            </button>
            {showLayers && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 34,
                  background: 'var(--n0)',
                  color: 'var(--n9)',
                  border: '1px solid var(--n3)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-2)',
                  padding: 10,
                  width: 190,
                  zIndex: 30,
                }}
              >
                {LAYER_KEYS.map((k) => (
                  <label key={k} className="chk">
                    <input type="checkbox" checked={layers[k]} onChange={() => store.toggleLayer(k)} />
                    {LAYER_LABEL[k]}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="tb" onClick={() => downloadPlan(plan)} title="프로젝트 파일 저장 (Ctrl+S)">
            <IconSave size={15} /> 저장
          </button>
          <button type="button" className="tb" onClick={() => setHelp(true)} title="도움말 (?)">
            <IconInfo size={15} />
          </button>
          <button type="button" className="tb primary" onClick={() => window.print()} title="인쇄 (Ctrl+P)">
            <IconPrint size={15} /> 피난안내도 인쇄
          </button>
        </div>

        {/* 단계 스테퍼 */}
        <nav className="stepper" aria-label="작성 단계">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className="step"
              aria-current={i === step ? 'step' : undefined}
              onClick={() => store.setStep(i)}
            >
              <span className="no">{s.no}</span>
              <span className="ti">{s.title}</span>
              {stepDone(plan, i, drill) && (
                <span className="done" aria-label="완료">
                  <IconCheck size={13} />
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* 작업 영역 */}
        <div className="work">
          <ToolRail />
          <div className="center">
            <OptionBar />
            <Canvas
              field={layers.smoke ? field : null}
              grid={grid}
              time={time}
              drillPath={drillActive ? drill.state!.path : null}
              drillPos={drillActive ? drill.state!.pos : null}
              blocked={blocked}
              pickMode={pickMode}
              onPickIgnition={onPickIgnition}
            />
          </div>
          <Inspector grid={grid} field={field} pickMode={pickMode} setPickMode={setPickMode} onPreview={setPreview} />
        </div>

        {/* 상태 표시줄 */}
        <div className="statusbar">
          <span>
            좌표 <b>{cursor ? `${cursor.x}, ${cursor.y}` : '—'}</b> cm
          </span>
          <span>
            축척 <b>{Math.round(view.zoom * 100)}%</b>
          </span>
          <span>
            전용면적 <b>{planArea(plan).toFixed(1)}</b> ㎡
          </span>
          <span>
            실 <b>{plan.rooms.length}</b> · 개구부 <b>{plan.doors.length + plan.windows.length}</b> · 설비{' '}
            <b>{plan.facilities.length}</b> · 동선 <b>{plan.routes.length}</b>
          </span>
          <div className="right">
            {selLabel && <span>선택: {selLabel}</span>}
            <span>도구: {TOOLS.find((t) => t.key === tool)?.label}</span>
            <span>스냅 {app.snap ? `${app.snapSize}cm` : '끔'}</span>
            <span>이력 {app.past.length}/80</span>
          </div>
        </div>
      </div>

      {toast && <div className={`toast${toast.kind === 'warn' ? ' warn' : ''}`}>{toast.text}</div>}

      {/* A4 산출물 — 화면에서는 숨기고 인쇄 시 나온다 */}
      <PrintSheet plan={plan} model={model} />

      {preview && (
        <div className="modal-back" onClick={() => setPreview(false)}>
          <div
            className="modal"
            style={{ width: 'auto', maxWidth: '96vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header style={{ display: 'flex', alignItems: 'center' }}>
              A4 피난안내도 미리보기
              <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setPreview(false)}>
                <IconClose size={14} />
              </button>
            </header>
            <div className="body" style={{ padding: 12, background: 'var(--n3)' }}>
              <div style={{ width: 900, height: 622, overflow: 'hidden' }}>
                <div className="sheet-preview" style={{ padding: 0, background: 'transparent' }}>
                  <div style={{ transform: 'scale(0.845)', transformOrigin: 'top left' }}>
                    <PrintSheet plan={plan} model={model} />
                  </div>
                </div>
              </div>
            </div>
            <footer>
              <button type="button" className="btn" onClick={() => setPreview(false)}>
                닫기
              </button>
              <button type="button" className="btn pri" onClick={() => window.print()}>
                <IconPrint size={15} /> 인쇄
              </button>
            </footer>
          </div>
        </div>
      )}

      {help && <HelpModal onClose={() => setHelp(false)} />}
    </>
  );
}

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="5" fill="#ffffff" fillOpacity={0.12} stroke="#ffffff" strokeOpacity={0.5} />
      <path d="M7 24V10.5a1 1 0 0 1 1-1h7v14.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M17 24V14h8v10" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 24v-5h3v5" fill="none" stroke="#7ee2b8" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="21" cy="19" r="2.2" fill="#ff9aa8" />
    </svg>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>도움말 · 단축키</header>
        <div className="body">
          <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>도구</h3>
          <table className="tbl">
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.key}>
                  <td style={{ width: 46 }}>
                    <span className="kbd">{t.shortcut}</span>
                  </td>
                  <td style={{ width: 90 }}>{t.label}</td>
                  <td>{t.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ margin: '14px 0 6px', fontSize: 13 }}>편집</h3>
          <table className="tbl">
            <tbody>
              <tr>
                <td style={{ width: 110 }}>
                  <span className="kbd">Ctrl</span> + <span className="kbd">Z</span>
                </td>
                <td>실행 취소 (80단계)</td>
              </tr>
              <tr>
                <td>
                  <span className="kbd">Ctrl</span> + <span className="kbd">Shift</span> + <span className="kbd">Z</span>
                </td>
                <td>다시 실행</td>
              </tr>
              <tr>
                <td>
                  <span className="kbd">Delete</span>
                </td>
                <td>선택 요소 삭제</td>
              </tr>
              <tr>
                <td>
                  <span className="kbd">Ctrl</span> + <span className="kbd">S</span>
                </td>
                <td>프로젝트 파일(JSON) 저장</td>
              </tr>
              <tr>
                <td>
                  <span className="kbd">Ctrl</span> + <span className="kbd">P</span>
                </td>
                <td>A4 피난안내도 인쇄</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ margin: '14px 0 6px', fontSize: 13 }}>화면</h3>
          <table className="tbl">
            <tbody>
              <tr>
                <td style={{ width: 110 }}>
                  <span className="kbd">Space</span> + 드래그
                </td>
                <td>화면 이동 (휠 버튼도 같다)</td>
              </tr>
              <tr>
                <td>휠</td>
                <td>커서 기준 확대·축소</td>
              </tr>
              <tr>
                <td>
                  <span className="kbd">0</span>
                </td>
                <td>도면 전체 보기</td>
              </tr>
              <tr>
                <td>
                  <span className="kbd">[</span> <span className="kbd">]</span>
                </td>
                <td>이전·다음 단계</td>
              </tr>
              <tr>
                <td>
                  <span className="kbd">Esc</span>
                </td>
                <td>선택 해제 · 작도 취소</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ margin: '14px 0 6px', fontSize: 13 }}>이용 수준</h3>
          <table className="tbl">
            <tbody>
              {LEVELS.map((l) => (
                <tr key={l.key}>
                  <td style={{ width: 110 }}>{l.label}</td>
                  <td>
                    {l.hint} 눈금 {l.snap}cm.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            자유 그리기(<span className="kbd">S</span>)는 두 수준 모두에서 쓸 수 있다. 닫힌 모양은 방,
            방을 가로지른 선은 벽, 벽 위에 그은 선은 문·창이 된다.
          </p>

          <div className="callout warn" style={{ marginTop: 14 }}>
            <b>이 도구가 하지 않는 일</b>
            연기 확산 해석은 교육용 근사 모델이다. 성능위주설계(FDS 등) 해석을 대체하지 않으며, 법정
            피난안내도를 대체하지도 않는다. 입력한 내용은 서버로 보내지 않는다.
          </div>
        </div>
        <footer>
          <button type="button" className="btn pri" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}

export { readPlanFile };
