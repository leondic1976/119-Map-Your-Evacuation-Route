'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { TEMPLATES, templateName, type TemplateDef } from '../content';
import { bedroomCount, preparePlan, rotatePlan, type PlanRotation } from '../core/plan/prepare';
import {
  generateResidualPlan,
  normalizeBedroomSides,
  type ShellShape,
  type Side8,
} from '../core/plan/residual';
import { useKids } from '../store/kidsStore';
import { PlanSvg } from './PlanSvg';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Page = 'paths' | 'rooms' | 'layout' | 'gallery' | 'starterRooms' | 'shell' | 'boxSides' | 'boxPreview' | 'customize';
type Flow = 'guided' | 'gallery' | 'starter';
type BedroomChoice = 1 | 2 | 3 | 4;
type KitchenChoice = 'open' | 'closed' | 'unsure';

const GUIDED_ORDER: Record<BedroomChoice, string[]> = {
  1: ['studio'],
  2: ['apt_2room', 'apt_tower', 'house_1f'],
  3: ['apt_3room'],
  4: ['apt_4room'],
};

const LAYOUT_NAME: Record<string, string> = {
  studio: '한 공간으로 이어진 작은 집',
  apt_2room: '방이 한쪽에 나란한 집',
  apt_tower: '거실 둘레에 방이 있는 집',
  house_1f: '거실과 마당이 이어진 집',
  apt_3room: '방 세 개가 나란한 집',
  apt_4room: '방이 네 개 있는 큰 집',
};

const ROTATIONS: { value: PlanRotation; label: string }[] = [
  { value: 0, label: '그대로' },
  { value: 90, label: '오른쪽으로' },
  { value: 180, label: '거꾸로' },
  { value: 270, label: '왼쪽으로' },
];

const SHELLS: { value: ShellShape; label: string; note: string }[] = [
  { value: 'wide', label: '넓은 네모', note: '가로로 넓은 집' },
  { value: 'long', label: '길쭉한 네모', note: '세로로 긴 집' },
  { value: 'compact', label: '도톰한 네모', note: '세로·가로가 비슷한 집' },
  { value: 'bend-left', label: '왼쪽이 꺾인 집', note: '왼쪽 아래가 이어진 집' },
  { value: 'bend-right', label: '오른쪽이 꺾인 집', note: '오른쪽 아래가 이어진 집' },
  { value: 'step-left', label: '왼쪽 계단 모양', note: '아래쪽이 오른쪽으로 나온 집' },
  { value: 'step-right', label: '오른쪽 계단 모양', note: '아래쪽이 왼쪽으로 나온 집' },
  { value: 'notch', label: '가운데가 들어간 집', note: '위쪽 가운데가 들어간 집' },
];

const SIDE_CELLS: { value: Side8; label: string; row: number; col: number }[] = [
  { value: 'NW', label: '왼쪽 위', row: 1, col: 1 },
  { value: 'N', label: '위 가운데', row: 1, col: 2 },
  { value: 'NE', label: '오른쪽 위', row: 1, col: 3 },
  { value: 'W', label: '왼쪽', row: 2, col: 1 },
  { value: 'E', label: '오른쪽', row: 2, col: 3 },
  { value: 'SW', label: '왼쪽 아래', row: 3, col: 1 },
  { value: 'S', label: '아래 가운데', row: 3, col: 2 },
  { value: 'SE', label: '오른쪽 아래', row: 3, col: 3 },
];

export default function Onboarding({ open, onClose }: Props) {
  const profile = useKids((s) => s.profile);
  const loadTemplate = useKids((s) => s.loadTemplate);
  const loadResidualPlan = useKids((s) => s.loadResidualPlan);
  const [page, setPage] = useState<Page>('paths');
  const [flow, setFlow] = useState<Flow>('gallery');
  const [bedrooms, setBedrooms] = useState<BedroomChoice>(2);
  const [galleryBedrooms, setGalleryBedrooms] = useState<0 | BedroomChoice>(0);
  const [selected, setSelected] = useState<TemplateDef | null>(null);
  const [kitchen, setKitchen] = useState<KitchenChoice>('open');
  const [rotation, setRotation] = useState<PlanRotation>(0);
  const [shell, setShell] = useState<ShellShape>('wide');
  const [bedroomSides, setBedroomSides] = useState<Side8[]>(normalizeBedroomSides(2, []));
  const [includeRefugeLobby, setIncludeRefugeLobby] = useState(false);
  const [includeAlphaRoom, setIncludeAlphaRoom] = useState(false);
  const easy = profile.gradeMode === 'easy';

  useEffect(() => {
    if (!open) return;
    setPage('paths');
    setFlow('gallery');
    setBedrooms(2);
    setGalleryBedrooms(0);
    setSelected(null);
    setKitchen('open');
    setRotation(0);
    setShell('wide');
    setBedroomSides(normalizeBedroomSides(2, []));
    setIncludeRefugeLobby(false);
    setIncludeAlphaRoom(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const guidedTemplates = useMemo(
    () => GUIDED_ORDER[bedrooms].map((id) => TEMPLATES.find((item) => item.id === id)).filter((item): item is TemplateDef => Boolean(item)),
    [bedrooms],
  );
  const galleryTemplates = useMemo(
    () => (galleryBedrooms === 0 ? TEMPLATES : TEMPLATES.filter((item) => bedroomCount(item.plan) === galleryBedrooms)),
    [galleryBedrooms],
  );
  const roomsOnly = flow === 'starter';
  const hasKitchen = Boolean(selected?.plan.blocks.some((block) => block.kind === 'room' && block.roomKind === 'kitchen'));
  const preview = useMemo(
    () =>
      selected
        ? preparePlan(selected.plan, {
            roomsOnly,
            openKitchen: !roomsOnly && hasKitchen && kitchen !== 'closed',
            rotation,
          })
        : null,
    [selected, roomsOnly, hasKitchen, kitchen, rotation],
  );
  const residualRequest = useMemo(
    () => ({
      bedrooms,
      shell,
      bedroomSides: normalizeBedroomSides(bedrooms, bedroomSides),
      kitchenClosed: kitchen === 'closed',
      includeRefugeLobby,
      includeAlphaRoom,
    } as const),
    [bedrooms, shell, bedroomSides, kitchen, includeRefugeLobby, includeAlphaRoom],
  );
  const residualPreview = useMemo(
    () => rotatePlan(generateResidualPlan(residualRequest).plan, rotation),
    [residualRequest, rotation],
  );

  if (!open) return null;

  const chooseTemplate = (template: TemplateDef, nextFlow = flow) => {
    setFlow(nextFlow);
    setSelected(template);
    setKitchen('open');
    setRotation(0);
    setPage('customize');
  };

  const chooseBedrooms = (count: BedroomChoice, nextFlow: Flow) => {
    setBedrooms(count);
    setFlow(nextFlow);
    if (nextFlow === 'starter') {
      setBedroomSides(normalizeBedroomSides(count, []));
      setKitchen('open');
      setRotation(0);
      setPage('boxSides');
      return;
    }
    setPage('layout');
  };

  const start = () => {
    if (flow === 'starter') {
      loadResidualPlan(residualRequest, rotation);
      onClose();
      return;
    }
    if (!selected) return;
    loadTemplate(selected.id, {
      roomsOnly,
      openKitchen: !roomsOnly && hasKitchen && kitchen !== 'closed',
      rotation,
    });
    onClose();
  };

  const goBack = () => {
    if (page === 'rooms' || page === 'gallery') setPage('paths');
    else if (page === 'starterRooms') setPage('shell');
    else if (page === 'layout') setPage('rooms');
    else if (page === 'shell') setPage('paths');
    else if (page === 'boxSides') setPage('starterRooms');
    else if (page === 'boxPreview') setPage('boxSides');
    else if (page === 'customize') {
      if (flow === 'guided') setPage('layout');
      else if (flow === 'gallery') setPage('gallery');
      else setPage('starterRooms');
    }
  };

  const toggleBedroomSide = (side: Side8) => {
    setBedroomSides((current) => {
      if (current.includes(side)) return current;
      if (current.length >= bedrooms) return current.slice(1).concat(side);
      return current.concat(side);
    });
  };

  const title = (() => {
    if (page === 'paths') return easy ? '너희 집을 쉽게 만들어 볼까?' : '우리 집과 비슷한 평면 만들기';
    if (page === 'rooms' || page === 'starterRooms') return easy ? '잠자는 방은 몇 개야?' : '침실은 몇 개인가요?';
    if (page === 'layout') return easy ? '어느 모양이 더 비슷해?' : '가까운 방 배치를 고르세요';
    if (page === 'gallery') return easy ? '눈으로 보고 골라 볼까?' : '전체 집 모양 보기';
    if (page === 'shell') return easy ? '집 바깥 모양은 어느 쪽이 비슷해?' : '집 테두리와 가까운 모양을 고르세요';
    if (page === 'boxSides') return easy ? '방이 있는 쪽을 눌러 봐!' : '침실이 놓인 쪽을 선택하세요';
    if (page === 'boxPreview') return easy ? '집 안에 방을 놓고 남은 곳을 이었어!' : '외곽과 독립실로 만든 평면';
    return easy ? '우리 집처럼 바꿔 보자!' : '방향과 주방 모양 정하기';
  })();

  return (
    <div className="k-modal-back" onClick={onClose} role="presentation">
      <div className="k-modal k-onboard" role="dialog" aria-modal="true" aria-labelledby="k-onboard-title" onClick={(event) => event.stopPropagation()}>
        <header>
          {page !== 'paths' ? (
            <button type="button" className="k-onboard-back" onClick={goBack} aria-label="이전으로">
              <BackIcon />
            </button>
          ) : null}
          <h2 id="k-onboard-title">{title}</h2>
          <button type="button" className="k-x" onClick={onClose} aria-label="닫기">
            <CloseIcon />
          </button>
        </header>

        {page === 'paths' ? (
          <div className="k-onboard-body">
            <p className="k-start-note">
              {easy ? '집이 똑같이 생기지 않아도 괜찮아. 쉬운 방법 하나를 고르면 같이 만들어 줄게!' : '완전히 같은 평면을 찾을 필요가 없습니다. 편한 시작 방법을 선택하세요.'}
            </p>
            <div className="k-start-paths">
              <button type="button" className="k-start-path recommended" data-start-path="template" onClick={() => { setFlow('gallery'); setPage('gallery'); }}>
                <span className="k-recommend">가장 쉬워요</span>
                <span className="k-start-path-icon"><PathIcon kind="gallery" /></span>
                <b>{easy ? '템플릿으로 빠르게 시작' : '템플릿에서 시작하기'}</b>
                <small>{easy ? '가구까지 그려진 여러 집을 보고 가까운 것을 골라.' : '완성된 예시 평면을 불러와 바로 수정합니다.'}</small>
              </button>
              <button type="button" className="k-start-path" data-start-path="starter" onClick={() => { setFlow('starter'); setPage('shell'); }}>
                <span className="k-start-path-icon"><PathIcon kind="starter" /></span>
                <b>{easy ? '직접 그리기' : '단계별로 직접 그리기'}</b>
                <small>{easy ? '집 모양부터 안전 물건까지 일곱 단계로 같이 만들어.' : '외곽부터 안전설비까지 7단계 길잡이를 따라 구성합니다.'}</small>
              </button>
            </div>
          </div>
        ) : null}

        {page === 'rooms' || page === 'starterRooms' ? (
          <div className="k-onboard-body k-question-page">
            <p className="k-start-note">
              {page === 'starterRooms'
                ? easy
                  ? '방 개수만 알려 줘. 거실 모양은 네가 그리지 않아도 돼.'
                  : '침실 상자를 놓고 남은 자리는 공용공간으로 자동 구성합니다.'
                : easy
                  ? '정확하지 않아도 괜찮아. 잠을 자는 방 개수만 골라 줘.'
                  : '침실 개수를 기준으로 가까운 구조를 추천합니다.'}
            </p>
            <div className="k-answer-grid">
              {([1, 2, 3, 4] as BedroomChoice[]).map((count) => (
                <button key={count} type="button" className="k-bedroom-answer" data-bedroom-count={count} onClick={() => chooseBedrooms(count, page === 'starterRooms' ? 'starter' : 'guided')}>
                  <span aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</span>
                  <b>{count}개</b>
                  <small>{count === 4 ? '4개 이상' : `잠자는 방 ${count}개`}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {page === 'shell' ? (
          <div className="k-onboard-body k-shell-page">
            <p className="k-start-note">
              {easy ? '똑같지 않아도 괜찮아. 바깥 테두리만 가까운 것을 골라 보자.' : '세부 벽은 다음 단계에서 자동으로 만들고 나중에 고칠 수 있습니다.'}
            </p>
            <div className="k-shell-grid">
              {SHELLS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={shell === item.value ? 'on' : ''}
                  data-shell={item.value}
                  aria-pressed={shell === item.value}
                  onClick={() => {
                    setShell(item.value);
                    setPage('starterRooms');
                  }}
                >
                  <ShellIcon shape={item.value} />
                  <b>{item.label}</b>
                  <small>{item.note}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {page === 'boxSides' ? (
          <div className="k-onboard-body k-box-side-page">
            <p className="k-start-note">
              {easy
                ? `집 테두리 안에서 파란 방 ${bedrooms}개가 있는 쪽을 눌러 봐. 다른 쪽을 누르면 먼저 고른 자리가 바뀌어.`
                : `침실 ${bedrooms}개의 대략적인 위치를 선택하세요. 새 위치를 누르면 오래된 선택을 교체합니다.`}
            </p>
            <div className="k-side-picker" aria-label="방이 있는 쪽 선택">
              <div className={`k-side-shell shell-${shell}`} aria-hidden="true"><ShellIcon shape={shell} /></div>
              {SIDE_CELLS.map((item) => {
                const order = bedroomSides.indexOf(item.value);
                const on = order >= 0;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={on ? 'on' : ''}
                    style={{ gridRow: item.row, gridColumn: item.col }}
                    data-bedroom-side={item.value}
                    aria-pressed={on}
                    onClick={() => toggleBedroomSide(item.value)}
                  >
                    <span aria-hidden="true">{on ? order + 1 : ''}</span>
                    <b>{item.label}</b>
                  </button>
                );
              })}
              <div className="k-side-center" style={{ gridRow: 2, gridColumn: 2 }} aria-hidden="true">
                <span>남은 자리</span>
                <b>거실</b>
              </div>
            </div>
            <div className="k-side-actions">
              <span>방 자리 {bedroomSides.length}/{bedrooms}</span>
              <button type="button" className="k-start-plan" data-box-sides-next onClick={() => setPage('boxPreview')}>
                독립실 놓고 남은 곳 잇기
              </button>
            </div>
          </div>
        ) : null}

        {page === 'boxPreview' ? (
          <div className="k-onboard-body k-customize-page k-box-preview-page">
            <section className="k-customize-preview" aria-label="외곽과 독립실로 만든 집 미리보기">
              <PlanSvg plan={residualPreview} routePair={undefined} showSlots={[]} style="kid" gradeMode={profile.gradeMode} showGrid={false} />
              <b>집 외곽 안의 독립실과 열린 바닥</b>
              <small>{easy ? '검은 선은 진짜 벽이야. 거실과 복도는 벽 틈 없이 한 바닥으로 이어져.' : '독립실만 내부 벽으로 닫고 공용공간은 끊김 없는 바닥으로 표시합니다.'}</small>
            </section>
            <section className="k-customize-options">
              <fieldset className="k-choice-field">
                <legend>{easy ? '문이 있는 방을 더 놓을까?' : '추가 독립실'}</legend>
                <p>{easy ? '집에 있으면 눌러 봐. 다시 누르면 뺄 수 있어.' : '실제 집에 있는 구획실만 선택하세요.'}</p>
                <div className="k-segmented k-extra-room-choices">
                  <button type="button" className={includeRefugeLobby ? 'on' : ''} data-extra-room="refuge-lobby" aria-pressed={includeRefugeLobby} onClick={() => setIncludeRefugeLobby((value) => !value)}>
                    피난전실
                  </button>
                  <button type="button" className={includeAlphaRoom ? 'on' : ''} data-extra-room="alpha" aria-pressed={includeAlphaRoom} onClick={() => setIncludeAlphaRoom((value) => !value)}>
                    알파룸
                  </button>
                </div>
                <small className="k-choice-help">욕실은 기본으로 문이 있는 방으로 만들어 둬.</small>
              </fieldset>
              <fieldset className="k-choice-field">
                <legend>{easy ? '주방에 문이 있어?' : '주방이 닫혀 있나요?'}</legend>
                <p>{easy ? '문이 없으면 거실과 이어진 트인 주방으로 만들게.' : '문이 없으면 잔여공간 안에 개방형 주방으로 배치합니다.'}</p>
                <div className="k-segmented k-kitchen-choices">
                  {([
                    ['open', '문이 없어'],
                    ['closed', '문이 있어'],
                    ['unsure', '잘 모르겠어'],
                  ] as [KitchenChoice, string][]).map(([value, label]) => (
                    <button key={value} type="button" className={kitchen === value ? 'on' : ''} data-box-kitchen={value} aria-pressed={kitchen === value} onClick={() => setKitchen(value)}>{label}</button>
                  ))}
                </div>
                {kitchen === 'unsure' ? <small className="k-choice-help">괜찮아. 문 없는 트인 주방으로 시작할게.</small> : null}
              </fieldset>
              <fieldset className="k-choice-field">
                <legend>{easy ? '현관 방향이 비슷하게 돌려 볼까?' : '평면 방향'}</legend>
                <div className="k-segmented k-rotation-choices">
                  {ROTATIONS.map((item) => (
                    <button key={item.value} type="button" className={rotation === item.value ? 'on' : ''} data-box-rotation={item.value} aria-pressed={rotation === item.value} onClick={() => setRotation(item.value)}>
                      <RotateIcon rotation={item.value} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <button type="button" className="k-start-plan" data-residual-plan-start onClick={start}>
                {easy ? '이 집으로 대피지도 만들기' : '이 평면으로 시작하기'}
              </button>
            </section>
          </div>
        ) : null}

        {page === 'layout' ? (
          <div className="k-onboard-body">
            <p className="k-start-note">{easy ? '완전히 같지 않아도 돼. 방이 놓인 방향만 비슷하면 골라도 좋아.' : '가구와 문의 위치는 다음 화면에서 바꿀 수 있습니다.'}</p>
            <div className="k-result-count">{easy ? `방 ${bedrooms}개인 모양 ${guidedTemplates.length}개` : `${guidedTemplates.length}개의 추천 평면`}</div>
            <div className="k-tmpl-grid k-guided-grid">
              {guidedTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} gradeMode={profile.gradeMode} onClick={() => chooseTemplate(template, 'guided')} />
              ))}
            </div>
          </div>
        ) : null}

        {page === 'gallery' ? (
          <div className="k-onboard-body">
            <div className="k-bedroom-filters" aria-label="잠자는 방 개수로 고르기">
              {([0, 1, 2, 3, 4] as const).map((count) => (
                <button key={count} type="button" className={galleryBedrooms === count ? 'on' : ''} data-bedroom-filter={count} aria-pressed={galleryBedrooms === count} onClick={() => setGalleryBedrooms(count)}>
                  {count === 0 ? '모두' : count === 4 ? '방 4개+' : `방 ${count}개`}
                </button>
              ))}
            </div>
            <div className="k-result-count">{easy ? `${galleryTemplates.length}개 모양을 찾았어` : `${galleryTemplates.length}개의 평면`}</div>
            <div className="k-tmpl-grid">
              {galleryTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} gradeMode={profile.gradeMode} onClick={() => chooseTemplate(template, 'gallery')} />
              ))}
            </div>
          </div>
        ) : null}

        {page === 'customize' && selected && preview ? (
          <div className="k-onboard-body k-customize-page">
            <section className="k-customize-preview" aria-label="고른 집 미리보기">
              <PlanSvg plan={preview} routePair={undefined} showSlots={[]} style="kid" gradeMode={profile.gradeMode} showGrid={false} />
              <b>{roomsOnly ? `${bedrooms}개 방부터 시작` : LAYOUT_NAME[selected.id] ?? templateName(selected, profile.gradeMode)}</b>
              <small>{roomsOnly ? '문과 가구는 다음 화면에서 붙여 보자.' : '다음 화면에서도 방과 문을 고칠 수 있어.'}</small>
            </section>
            <section className="k-customize-options">
              {!roomsOnly && hasKitchen ? (
                <fieldset className="k-choice-field">
                  <legend>{easy ? '주방은 거실 쪽이 트여 있어?' : '주방과 거실 사이 형태'}</legend>
                  <p>{easy ? '벽이 없어서 그냥 걸어갈 수 있으면 “트여 있어”야.' : '벽이 없는 개방형 주방이면 트인 구조를 선택하세요.'}</p>
                  <div className="k-segmented k-kitchen-choices">
                    {([
                      ['open', '트여 있어'],
                      ['closed', '벽과 문이 있어'],
                      ['unsure', '잘 모르겠어'],
                    ] as [KitchenChoice, string][]).map(([value, label]) => (
                      <button key={value} type="button" className={kitchen === value ? 'on' : ''} data-kitchen={value} aria-pressed={kitchen === value} onClick={() => setKitchen(value)}>{label}</button>
                    ))}
                  </div>
                  {kitchen === 'unsure' ? <small className="k-choice-help">괜찮아. 가장 흔한 트인 주방으로 만들어 줄게.</small> : null}
                </fieldset>
              ) : null}
              <fieldset className="k-choice-field">
                <legend>{easy ? '집 그림을 돌려 볼까?' : '평면 방향'}</legend>
                <p>{easy ? '현관이나 방이 있는 쪽이 비슷하도록 돌려 봐.' : '실제 집과 비슷한 방향을 선택하세요.'}</p>
                <div className="k-segmented k-rotation-choices">
                  {ROTATIONS.map((item) => (
                    <button key={item.value} type="button" className={rotation === item.value ? 'on' : ''} data-rotation={item.value} aria-pressed={rotation === item.value} onClick={() => setRotation(item.value)}>
                      <RotateIcon rotation={item.value} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <button type="button" className="k-start-plan" data-coach="kids-plan-start" onClick={start}>
                {easy ? '이 모양으로 지도 그리기' : '이 평면으로 시작하기'}
              </button>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TemplateCard({ template, gradeMode, onClick }: { template: TemplateDef; gradeMode: 'easy' | 'normal'; onClick: () => void }) {
  return (
    <button type="button" className="k-tmpl" data-template={template.id} onClick={onClick}>
      <span className="k-tmpl-art">
        <PlanSvg plan={template.plan} routePair={undefined} showSlots={[]} style="kid" gradeMode={gradeMode} showGrid={false} />
      </span>
      <b>{LAYOUT_NAME[template.id] ?? templateName(template, gradeMode)}</b>
      <small>{gradeMode === 'easy' ? `잠자는 방 ${bedroomCount(template.plan)}개` : template.hint}</small>
    </button>
  );
}

function PathIcon({ kind }: { kind: Flow }) {
  if (kind === 'guided') {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 14h32v36H16z" /><path d="M23 26h18M23 35h12" /><circle cx="23" cy="44" r="3" /></svg>;
  }
  if (kind === 'gallery') {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="13" width="44" height="38" rx="5" /><path d="M16 42l11-11 8 8 6-6 7 9M21 24h.1" /></svg>;
  }
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 30l21-17 21 17v21H11z" /><path d="M22 51V35h20v16M32 13v38" /></svg>;
}

function ShellIcon({ shape }: { shape: ShellShape }) {
  const path =
    shape === 'wide'
      ? 'M8 17h48v30H8z'
      : shape === 'long'
        ? 'M17 6h30v52H17z'
        : shape === 'compact'
          ? 'M13 6h38v52H13z'
        : shape === 'bend-left'
          ? 'M7 9h50v27H34v20H7z'
          : shape === 'bend-right'
            ? 'M7 9h50v47H30V36H7z'
            : shape === 'step-left'
              ? 'M6 9h44v23h8v23H14V32H6z'
              : shape === 'step-right'
                ? 'M14 9h44v23h-8v23H6V32h8z'
                : 'M6 9h20v13h12V9h20v46H6z';
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d={path} />
      <path d="M18 26h10v10H18zM36 17h11v11H36z" className="rooms" />
    </svg>
  );
}

function RotateIcon({ rotation }: { rotation: PlanRotation }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="M8 11a9 9 0 1 1-1 8" />
      <path d="M5 6v7h7" />
    </svg>
  );
}

function BackIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>;
}

export function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
