'use client';

/**
 * 사용 설명서 레이어.
 *
 * 내용은 tutorial.ts 의 manualSections() 가 만든다. 단계와 도구 목록에서
 * 직접 뽑아 내므로 기능이 바뀌면 설명서도 함께 바뀐다.
 */
import React, { useState } from 'react';
import { store, useApp } from './useStore';
import { manualSections } from '../lib/tutorial';
import { FACILITY_EASY, FACILITY_WHY } from '../lib/words';
import { FACILITY_LABEL, FacilityType } from '../lib/types';
import { LegendMark } from './Symbols';
import { IconClose, IconSketch } from './Icons';

const SIGNS: FacilityType[] = ['extinguisher', 'refuge', 'partition', 'downladder', 'exit', 'assembly'];

export default function Manual({ onClose }: { onClose: () => void }) {
  const { level } = useApp();
  const easy = level === 'elementary';
  const sections = manualSections(level);
  const [open, setOpen] = useState(sections[1]?.id ?? '');

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal manual" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="사용 설명서">
        <header>
          {easy ? '사용 설명서 (학생용)' : '사용 설명서'}
          <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="닫기">
            <IconClose size={14} />
          </button>
        </header>

        <div className="body">
          <div className="manual-lead">
            <p>{sections[0].intro}</p>
            <button
              type="button"
              className="btn pri"
              onClick={() => {
                onClose();
                store.startTutorial();
              }}
            >
              <IconSketch size={15} /> 따라하기로 한 걸음씩 배우기
            </button>
          </div>

          {sections.slice(1).map((sec) => {
            const isOpen = open === sec.id;
            return (
              <section key={sec.id} className={`manual-sec${isOpen ? ' open' : ''}`}>
                <button type="button" className="manual-h" onClick={() => setOpen(isOpen ? '' : sec.id)}>
                  <span>{sec.title}</span>
                  <i aria-hidden="true">{isOpen ? '−' : '+'}</i>
                </button>
                {isOpen && (
                  <div className="manual-body">
                    {sec.intro && <p className="note" style={{ marginTop: 0 }}>{sec.intro}</p>}
                    <ul>
                      {sec.items.map((it) => (
                        <li key={it.label}>
                          <b>{it.label}</b>
                          {it.key && <span className="kbd">{it.key}</span>}
                          <span>{it.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}

          {/* 도면 기호 — 그림과 뜻을 함께 */}
          <section className={`manual-sec${open === 'signs' ? ' open' : ''}`}>
            <button type="button" className="manual-h" onClick={() => setOpen(open === 'signs' ? '' : 'signs')}>
              <span>도면 기호</span>
              <i aria-hidden="true">{open === 'signs' ? '−' : '+'}</i>
            </button>
            {open === 'signs' && (
              <div className="manual-body">
                <p className="note" style={{ marginTop: 0 }}>
                  {easy
                    ? '건물이나 지하철에서도 보게 될 진짜 기호다. 뜻을 알아 두면 밖에서도 쓸 수 있다.'
                    : '소방·피난 유도 표지에 쓰이는 기호 체계를 따른다.'}
                </p>
                <div className="sign-grid">
                  {SIGNS.map((t) => (
                    <div key={t} className="sign">
                      <LegendMark kind={t} />
                      <div>
                        <b>{easy ? FACILITY_EASY[t] : FACILITY_LABEL[t]}</b>
                        <span>{easy ? FACILITY_WHY[t] : FACILITY_LABEL[t]}</span>
                      </div>
                    </div>
                  ))}
                  <div className="sign">
                    <LegendMark kind="primary" />
                    <div>
                      <b>{easy ? '나가는 길' : '주 피난동선'}</b>
                      <span>{easy ? '현관으로 나가는 길' : '현관을 종점으로 하는 주 동선'}</span>
                    </div>
                  </div>
                  <div className="sign">
                    <LegendMark kind="alt" />
                    <div>
                      <b>{easy ? '돌아가는 길' : '대체 피난동선'}</b>
                      <span>{easy ? '현관이 막혔을 때 가는 길' : '세대 피난설비를 종점으로 하는 동선'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}
