'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { TEMPLATES, templateName, type TemplateDef } from '../content';
import { bedroomCount, preparePlan, type PlanRotation } from '../core/plan/prepare';
import { type ShellShape } from '../core/plan/residual';
import { completeShellSketch, orthogonalVertex, preparedShellPlan, type ShellVertex } from '../core/plan/shellSketch';
import { useKids } from '../store/kidsStore';
import { PlanSvg } from './PlanSvg';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Page = 'paths' | 'gallery' | 'customize' | 'direct' | 'shell' | 'draw';
type BedroomFilter = 0 | 1 | 2 | 3 | 4;
type KitchenChoice = 'open' | 'closed' | 'unsure';

const ROTATIONS: { value: PlanRotation; label: string }[] = [
  { value: 0, label: '그대로' },
  { value: 90, label: '오른쪽으로' },
  { value: 180, label: '거꾸로' },
  { value: 270, label: '왼쪽으로' },
];

const SHELLS: { value: ShellShape; label: string; note: string }[] = [
  { value: 'wide', label: '넓은 네모', note: '가로로 넓은 집' },
  { value: 'long', label: '길쭉한 네모', note: '세로로 긴 집' },
  { value: 'compact', label: '도톰한 네모', note: '가로와 세로가 비슷한 집' },
  { value: 'bend-left', label: '왼쪽 ㄴ자', note: '왼쪽 아래가 이어진 집' },
  { value: 'bend-right', label: '오른쪽 ㄴ자', note: '오른쪽 아래가 이어진 집' },
  { value: 'step-left', label: '왼쪽 계단 모양', note: '아래쪽이 오른쪽으로 나온 집' },
  { value: 'step-right', label: '오른쪽 계단 모양', note: '아래쪽이 왼쪽으로 나온 집' },
  { value: 'notch', label: '가운데가 들어간 집', note: '위쪽 가운데가 들어간 집' },
];

const LAYOUT_NAME: Record<string, string> = {
  studio: '한 공간으로 이어진 작은 집',
  apt_2room: '방이 한쪽에 나란한 집',
  apt_tower: '거실 둘레에 방이 있는 집',
  house_1f: '거실과 마당이 이어진 집',
  apt_3room: '방 세 개가 나란한 집',
  apt_4room: '방이 네 개 있는 큰 집',
};

export default function Onboarding({ open, onClose }: Props) {
  const profile = useKids((state) => state.profile);
  const loadTemplate = useKids((state) => state.loadTemplate);
  const loadShellPlan = useKids((state) => state.loadShellPlan);
  const [page, setPage] = useState<Page>('paths');
  const [filter, setFilter] = useState<BedroomFilter>(0);
  const [template, setTemplate] = useState<TemplateDef | null>(null);
  const [kitchen, setKitchen] = useState<KitchenChoice>('open');
  const [rotation, setRotation] = useState<PlanRotation>(0);
  const [shell, setShell] = useState<ShellShape>('wide');
  const [vertices, setVertices] = useState<ShellVertex[]>([]);
  const [drawMessage, setDrawMessage] = useState('격자에서 집의 모서리를 차례로 눌러 주세요.');

  useEffect(() => {
    if (!open) return;
    setPage('paths');
    setFilter(0);
    setTemplate(null);
    setKitchen('open');
    setRotation(0);
    setShell('wide');
    setVertices([]);
    setDrawMessage('격자에서 집의 모서리를 차례로 눌러 주세요.');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, open]);

  const templates = useMemo(() => filter === 0 ? TEMPLATES : TEMPLATES.filter((item) => bedroomCount(item.plan) === filter), [filter]);
  const hasKitchen = Boolean(template?.plan.blocks.some((block) => block.kind === 'room' && block.roomKind === 'kitchen'));
  const preview = useMemo(() => template ? preparePlan(template.plan, { openKitchen: hasKitchen && kitchen !== 'closed', rotation }) : null, [hasKitchen, kitchen, rotation, template]);
  const shellPreview = useMemo(() => preparedShellPlan(shell), [shell]);

  if (!open) return null;

  const back = () => {
    if (page === 'gallery' || page === 'direct') setPage('paths');
    else if (page === 'customize') setPage('gallery');
    else if (page === 'shell' || page === 'draw') setPage('direct');
  };

  const title = page === 'paths'
    ? '어떻게 시작할까?'
    : page === 'gallery'
      ? '우리 집과 가까운 템플릿을 골라 봐'
      : page === 'customize'
        ? '방향과 주방(부엌) 모양을 맞춰 보자'
        : page === 'direct'
          ? '집 바깥 모양부터 직접 만들어 보자'
          : page === 'shell'
            ? '집 바깥 모양은 어느 쪽이 비슷해?'
            : '선으로 우리 집 외곽을 그려 보자';

  const finishDrawing = () => {
    const result = completeShellSketch(vertices);
    setDrawMessage(result.message);
    if (!result.ok) return;
    loadShellPlan(result.cells);
    onClose();
  };

  return (
    <div className="k-modal-back" onClick={onClose} role="presentation">
      <div className="k-modal k-onboard" role="dialog" aria-modal="true" aria-labelledby="k-onboard-title" onClick={(event) => event.stopPropagation()}>
        <header>
          {page !== 'paths' && <button type="button" className="k-onboard-back" onClick={back} aria-label="이전으로"><BackIcon /></button>}
          <h2 id="k-onboard-title">{title}</h2>
          <button type="button" className="k-x" onClick={onClose} aria-label="닫기"><CloseIcon /></button>
        </header>

        {page === 'paths' && (
          <div className="k-onboard-body">
            <p className="k-start-note">똑같은 집을 찾지 못해도 괜찮아. 완성 예시를 고치거나, 집 외곽부터 여섯 단계로 직접 만들 수 있어.</p>
            <div className="k-start-paths">
              <button type="button" className="k-start-path recommended" data-start-path="template" onClick={() => setPage('gallery')}>
                <span className="k-recommend">가장 빨라요</span>
                <span className="k-start-path-icon"><PathIcon kind="template" /></span>
                <b>템플릿으로 시작</b>
                <small>가구까지 그려진 여러 집을 보고 가까운 것을 골라 바로 고쳐.</small>
              </button>
              <button type="button" className="k-start-path" data-start-path="starter" onClick={() => setPage('direct')}>
                <span className="k-start-path-icon"><PathIcon kind="direct" /></span>
                <b>직접 그리기</b>
                <small>집 모양, 실과 문·창, 가구, 소화기, 내 위치 순서로 같이 만들어.</small>
              </button>
            </div>
          </div>
        )}

        {page === 'gallery' && (
          <div className="k-onboard-body">
            <p className="k-start-note">집이 완전히 같지 않아도 방의 개수와 놓인 방향이 가까우면 골라도 좋아.</p>
            <div className="k-bedroom-filters" aria-label="잠자는 방 개수로 고르기">
              {([0, 1, 2, 3, 4] as const).map((count) => <button key={count} type="button" className={filter === count ? 'on' : ''} data-bedroom-filter={count} aria-pressed={filter === count} onClick={() => setFilter(count)}>{count === 0 ? '모두' : count === 4 ? '방 4개+' : `방 ${count}개`}</button>)}
            </div>
            <div className="k-result-count">서로 다른 평면 {templates.length}개</div>
            <div className="k-tmpl-grid">
              {templates.map((item) => <TemplateCard key={item.id} template={item} gradeMode={profile.gradeMode} onClick={() => { setTemplate(item); setKitchen('open'); setRotation(0); setPage('customize'); }} />)}
            </div>
          </div>
        )}

        {page === 'customize' && template && preview && (
          <div className="k-onboard-body k-customize-page">
            <section className="k-customize-preview" aria-label="고른 집 미리보기">
              <PlanSvg plan={preview} routePair={undefined} showSlots={[]} style="kid" gradeMode={profile.gradeMode} showGrid={false} />
              <b>{LAYOUT_NAME[template.id] ?? templateName(template, profile.gradeMode)}</b>
              <small>불러온 뒤에도 방, 문, 창문과 가구를 모두 옮길 수 있어.</small>
            </section>
            <section className="k-customize-options">
              {hasKitchen && <fieldset className="k-choice-field">
                <legend>주방(부엌)은 거실 쪽이 트여 있어?</legend>
                <p>벽이 없어서 그냥 걸어갈 수 있으면 “트여 있어”를 골라.</p>
                <div className="k-segmented k-kitchen-choices">
                  {([['open', '트여 있어'], ['closed', '벽과 문이 있어'], ['unsure', '잘 모르겠어']] as [KitchenChoice, string][]).map(([value, label]) => <button key={value} type="button" className={kitchen === value ? 'on' : ''} data-kitchen={value} aria-pressed={kitchen === value} onClick={() => setKitchen(value)}>{label}</button>)}
                </div>
                {kitchen === 'unsure' && <small className="k-choice-help">괜찮아. 가장 흔한 트인 주방(부엌)으로 시작할게.</small>}
              </fieldset>}
              <fieldset className="k-choice-field">
                <legend>현관과 방 방향이 비슷하게 돌려 볼까?</legend>
                <div className="k-segmented k-rotation-choices">
                  {ROTATIONS.map((item) => <button key={item.value} type="button" className={rotation === item.value ? 'on' : ''} data-rotation={item.value} aria-pressed={rotation === item.value} onClick={() => setRotation(item.value)}><RotateIcon rotation={item.value} /><span>{item.label}</span></button>)}
                </div>
              </fieldset>
              <button type="button" className="k-start-plan" data-coach="kids-plan-start" onClick={() => { loadTemplate(template.id, { openKitchen: hasKitchen && kitchen !== 'closed', rotation }); onClose(); }}>이 모양으로 지도 그리기</button>
            </section>
          </div>
        )}

        {page === 'direct' && (
          <div className="k-onboard-body">
            <p className="k-start-note">처음에는 바깥 테두리만 만들고, 다음 화면에서 벽이 있는 방과 문·창문을 하나씩 놓을 거야.</p>
            <div className="k-start-paths k-direct-methods">
              <button type="button" className="k-start-path recommended" data-direct-method="shape" onClick={() => setPage('shell')}>
                <span className="k-recommend">쉽게 시작</span>
                <span className="k-start-path-icon"><PathIcon kind="shape" /></span>
                <b>준비된 집 모양 고르기</b>
                <small>여덟 가지 외곽 중 가까운 것을 골라서 안쪽을 채워.</small>
              </button>
              <button type="button" className="k-start-path" data-direct-method="draw" onClick={() => setPage('draw')}>
                <span className="k-start-path-icon"><PathIcon kind="draw" /></span>
                <b>외곽선을 직접 그리기</b>
                <small>격자에 모서리를 찍으면 가로·세로 벽선이 반듯하게 이어져.</small>
              </button>
            </div>
          </div>
        )}

        {page === 'shell' && (
          <div className="k-onboard-body k-shell-page k-shell-select-page">
            <p className="k-start-note">방 배치는 아직 생각하지 않아도 돼. 우리 집의 바깥 모양과 가장 가까운 것만 골라 봐.</p>
            <div className="k-shell-choice-layout">
              <div className="k-shell-grid">
                {SHELLS.map((item) => <button key={item.value} type="button" className={shell === item.value ? 'on' : ''} data-shell={item.value} aria-pressed={shell === item.value} onClick={() => setShell(item.value)}><ShellIcon shape={item.value} /><b>{item.label}</b><small>{item.note}</small></button>)}
              </div>
              <section className="k-shell-preview" aria-label="선택한 집 외곽 미리보기">
                <PlanSvg plan={shellPreview} routePair={undefined} showSlots={[]} style="kid" gradeMode={profile.gradeMode} showGrid={false} />
                <b>{SHELLS.find((item) => item.value === shell)?.label}</b>
                <small>지금은 열린 바닥만 있어. 다음 단계에서 실제 방을 놓아.</small>
                <button type="button" className="k-start-plan" data-shell-plan-start onClick={() => { loadShellPlan(shellPreview.shell?.cells ?? []); onClose(); }}>이 집 모양으로 시작</button>
              </section>
            </div>
          </div>
        )}

        {page === 'draw' && (
          <div className="k-onboard-body k-shell-draw-page">
            <div className="k-draw-help"><b>1</b><span>모서리를 차례로 눌러요</span><i /><b>2</b><span>벽선은 자동으로 반듯해져요</span><i /><b>3</b><span>외곽 완성을 눌러요</span></div>
            <ShellDrawBoard vertices={vertices} onAdd={(point) => { setVertices((current) => current.concat(orthogonalVertex(current[current.length - 1], point))); setDrawMessage('계속해서 다음 모서리를 눌러 주세요.'); }} />
            <div className="k-draw-actions">
              <p role="status">{drawMessage}</p>
              <div>
                <button type="button" onClick={() => { setVertices((current) => current.slice(0, -1)); setDrawMessage('마지막 선을 되돌렸어요.'); }} disabled={!vertices.length}>한 선 되돌리기</button>
                <button type="button" onClick={() => { setVertices([]); setDrawMessage('처음 점부터 다시 찍어 주세요.'); }} disabled={!vertices.length}>처음부터</button>
                <button type="button" className="k-start-plan" data-shell-draw-finish onClick={finishDrawing}>외곽 완성</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShellDrawBoard({ vertices, onAdd }: { vertices: ShellVertex[]; onAdd: (point: ShellVertex) => void }) {
  const W = 720;
  const H = 480;
  const toPoint = (event: React.PointerEvent<SVGSVGElement>): ShellVertex => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * 24, y: ((event.clientY - rect.top) / rect.height) * 16 };
  };
  const points = vertices.map((point) => `${point.x * 30},${point.y * 30}`).join(' ');
  return (
    <svg className="k-shell-draw-board" data-shell-draw viewBox={`0 0 ${W} ${H}`} role="application" aria-label="집 외곽선 그리기 격자. 마우스로 모서리를 차례로 누르세요." onPointerDown={(event) => onAdd(toPoint(event))}>
      <rect width={W} height={H} className="draw-bg" />
      {Array.from({ length: 25 }, (_, index) => <line key={`v${index}`} x1={index * 30} y1="0" x2={index * 30} y2={H} className={index % 4 === 0 ? 'major' : ''} />)}
      {Array.from({ length: 17 }, (_, index) => <line key={`h${index}`} x1="0" y1={index * 30} x2={W} y2={index * 30} className={index % 4 === 0 ? 'major' : ''} />)}
      {vertices.length > 1 && <polyline points={points} className="draw-line" />}
      {vertices.map((point, index) => <g key={`${point.x}-${point.y}-${index}`} className="draw-point"><circle cx={point.x * 30} cy={point.y * 30} r={index === 0 ? 8 : 6} /><text x={point.x * 30} y={point.y * 30 - 13}>{index + 1}</text></g>)}
    </svg>
  );
}

function TemplateCard({ template, gradeMode, onClick }: { template: TemplateDef; gradeMode: 'easy' | 'normal'; onClick: () => void }) {
  return <button type="button" className="k-tmpl" data-template={template.id} onClick={onClick}><span className="k-tmpl-art"><PlanSvg plan={template.plan} routePair={undefined} showSlots={[]} style="kid" gradeMode={gradeMode} showGrid={false} /></span><b>{LAYOUT_NAME[template.id] ?? templateName(template, gradeMode)}</b><small>잠자는 방 {bedroomCount(template.plan)}개 · 불러온 뒤 수정 가능</small></button>;
}

function PathIcon({ kind }: { kind: 'template' | 'direct' | 'shape' | 'draw' }) {
  if (kind === 'template') return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="12" width="46" height="40" rx="5" /><path d="M15 31h16V18M31 42V31h18M22 42h9M41 18v13" /></svg>;
  if (kind === 'direct') return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 31 32 12l22 19v22H10z" /><path d="M22 53V36h20v17M18 25v28" /></svg>;
  if (kind === 'shape') return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 13h46v38H37V35H9z" /><path d="M15 20h14v9H15z" /></svg>;
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="m12 49 5-29 25-7 10 27-20 12z" /><circle cx="17" cy="20" r="3" /><circle cx="42" cy="13" r="3" /><circle cx="52" cy="40" r="3" /><circle cx="32" cy="52" r="3" /></svg>;
}

function ShellIcon({ shape }: { shape: ShellShape }) {
  const path = shape === 'wide' ? 'M8 17h48v30H8z' : shape === 'long' ? 'M17 6h30v52H17z' : shape === 'compact' ? 'M13 6h38v52H13z' : shape === 'bend-left' ? 'M7 9h50v27H34v20H7z' : shape === 'bend-right' ? 'M7 9h50v47H30V36H7z' : shape === 'step-left' ? 'M6 9h44v23h8v23H14V32H6z' : shape === 'step-right' ? 'M14 9h44v23h-8v23H6V32h8z' : 'M6 9h20v13h12V9h20v46H6z';
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d={path} /></svg>;
}

function RotateIcon({ rotation }: { rotation: PlanRotation }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }}><path d="M8 11a9 9 0 1 1-1 8" /><path d="M5 6v7h7" /></svg>;
}

function BackIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>;
}

export function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
