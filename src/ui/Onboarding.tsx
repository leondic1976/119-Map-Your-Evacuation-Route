'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { TEMPLATES, templateName, type TemplateDef } from '../content';
import { bedroomCount, preparePlan, type PlanRotation } from '../core/plan/prepare';
import { useKids } from '../store/kidsStore';
import { PlanSvg } from './PlanSvg';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Page = 'paths' | 'rooms' | 'layout' | 'gallery' | 'starterRooms' | 'customize';
type Flow = 'guided' | 'gallery' | 'starter';
type BedroomChoice = 1 | 2 | 3 | 4;
type KitchenChoice = 'open' | 'closed' | 'unsure';

const STARTER_TEMPLATE: Record<BedroomChoice, string> = {
  1: 'studio',
  2: 'apt_2room',
  3: 'apt_3room',
  4: 'apt_4room',
};

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

export default function Onboarding({ open, onClose }: Props) {
  const profile = useKids((s) => s.profile);
  const loadTemplate = useKids((s) => s.loadTemplate);
  const [page, setPage] = useState<Page>('paths');
  const [flow, setFlow] = useState<Flow>('guided');
  const [bedrooms, setBedrooms] = useState<BedroomChoice>(2);
  const [galleryBedrooms, setGalleryBedrooms] = useState<0 | BedroomChoice>(0);
  const [selected, setSelected] = useState<TemplateDef | null>(null);
  const [kitchen, setKitchen] = useState<KitchenChoice>('open');
  const [rotation, setRotation] = useState<PlanRotation>(0);
  const easy = profile.gradeMode === 'easy';

  useEffect(() => {
    if (!open) return;
    setPage('paths');
    setFlow('guided');
    setBedrooms(2);
    setGalleryBedrooms(0);
    setSelected(null);
    setKitchen('open');
    setRotation(0);
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
      const template = TEMPLATES.find((item) => item.id === STARTER_TEMPLATE[count]);
      if (template) chooseTemplate(template, 'starter');
      return;
    }
    setPage('layout');
  };

  const start = () => {
    if (!selected) return;
    loadTemplate(selected.id, {
      roomsOnly,
      openKitchen: !roomsOnly && hasKitchen && kitchen !== 'closed',
      rotation,
    });
    onClose();
  };

  const goBack = () => {
    if (page === 'rooms' || page === 'gallery' || page === 'starterRooms') setPage('paths');
    else if (page === 'layout') setPage('rooms');
    else if (page === 'customize') {
      if (flow === 'guided') setPage('layout');
      else if (flow === 'gallery') setPage('gallery');
      else setPage('starterRooms');
    }
  };

  const title =
    page === 'paths'
      ? easy
        ? '너희 집을 쉽게 만들어 볼까?'
        : '우리 집과 비슷한 평면 만들기'
      : page === 'rooms' || page === 'starterRooms'
        ? easy
          ? '잠자는 방은 몇 개야?'
          : '침실은 몇 개인가요?'
        : page === 'layout'
          ? easy
            ? '어느 모양이 더 비슷해?'
            : '가까운 방 배치를 고르세요'
          : page === 'gallery'
            ? easy
              ? '눈으로 보고 골라 볼까?'
              : '전체 집 모양 보기'
            : easy
              ? '우리 집처럼 바꿔 보자!'
              : '방향과 주방 모양 정하기';

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
              <button type="button" className="k-start-path recommended" data-start-path="guided" onClick={() => { setFlow('guided'); setPage('rooms'); }}>
                <span className="k-recommend">가장 쉬워요</span>
                <span className="k-start-path-icon"><PathIcon kind="guided" /></span>
                <b>{easy ? '질문으로 쉽게 만들기' : '질문에 답해서 만들기'}</b>
                <small>{easy ? '방 개수만 알려 주면 비슷한 모양을 찾아 줄게.' : '침실 수부터 물어보고 가까운 구조를 추천합니다.'}</small>
              </button>
              <button type="button" className="k-start-path" data-start-path="gallery" onClick={() => { setFlow('gallery'); setPage('gallery'); }}>
                <span className="k-start-path-icon"><PathIcon kind="gallery" /></span>
                <b>{easy ? '집 모양을 보고 고르기' : '전체 모양에서 고르기'}</b>
                <small>{easy ? '여러 집 그림을 천천히 보고 골라 보자.' : '준비된 평면을 한눈에 비교합니다.'}</small>
              </button>
              <button type="button" className="k-start-path" data-start-path="starter" onClick={() => { setFlow('starter'); setPage('starterRooms'); }}>
                <span className="k-start-path-icon"><PathIcon kind="starter" /></span>
                <b>{easy ? '방부터 놓고 시작하기' : '방만 놓고 시작하기'}</b>
                <small>{easy ? '방은 미리 놓아 줄게. 문과 물건만 더하면 돼.' : '방 배치만 불러온 뒤 문과 물건을 직접 놓습니다.'}</small>
              </button>
            </div>
          </div>
        ) : null}

        {page === 'rooms' || page === 'starterRooms' ? (
          <div className="k-onboard-body k-question-page">
            <p className="k-start-note">
              {page === 'starterRooms'
                ? easy
                  ? '방은 내가 먼저 놓아 줄게. 너는 문과 가구를 붙이면 돼.'
                  : '선택한 개수에 맞춰 방만 먼저 배치합니다.'
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
