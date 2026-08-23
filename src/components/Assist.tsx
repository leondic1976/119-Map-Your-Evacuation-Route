'use client';

/**
 * 그리기 도우미.
 * 지금 도면을 보고 "다음에 무엇을 하면 되는지"를 한 장 카드로 보여 준다.
 * 초등에서는 늘 켜 두고, 중·고등·일반에서는 할 일이 남았을 때만 조용히 띄운다.
 */
import React from 'react';
import { store, useApp } from './useStore';
import { Grid } from '../lib/grid';
import { Assist, assistFor, progress } from '../lib/assist';
import { generateRoutes } from '../lib/routing';
import { IconCheck, IconChevron, IconWarn } from './Icons';

function run(a: Assist, grid: Grid): void {
  const act = a.action;
  if (!act) return;
  if (act.kind === 'tool') {
    store.setTool(act.value as never);
    return;
  }
  if (act.kind === 'step') {
    store.setStep(Number(act.value));
    return;
  }
  const plan = store.getState().plan;
  const target = act.value === 'facility' ? 'facility' : 'entrance';
  const routes = generateRoutes(plan, grid, { target });
  if (routes.length === 0) {
    store.toast('길을 그릴 수 없다. 문이 제대로 이어져 있는지 본다.', 'warn');
    store.setStep(2);
    return;
  }
  store.update((p) => ({
    ...p,
    routes: p.routes
      .filter((r) => (target === 'entrance' ? r.kind !== 'primary' : r.kind !== 'alt'))
      .concat(routes),
  }));
  store.setStep(4);
  store.toast(`나가는 길 ${routes.length}개를 그렸다.`);
}

export default function AssistPanel({ grid }: { grid: Grid }) {
  const { plan, step, level } = useApp();
  const easy = level === 'elementary';
  const list = assistFor(plan, step, grid);
  const now = list[0];
  const rest = list.slice(1, easy ? 3 : 2);
  const p = progress(plan);

  if (!easy && now.tone === 'done') return null;

  return (
    <div className={`assist${now.tone === 'done' ? ' done' : ''}`} data-coach="assist">
      <div className="assist-top">
        <span className="tag">{now.tone === 'done' ? '다 됐어요' : '다음에 할 일'}</span>
        {easy && (
          <span className="prog" title="꼭 해야 하는 것 중 몇 개를 했는지">
            <i style={{ width: `${Math.round(p.value * 100)}%` }} />
            <b>{p.label}</b>
          </span>
        )}
      </div>

      <div className="assist-main">
        <span className="ico">
          {now.tone === 'done' ? <IconCheck size={17} /> : <IconWarn size={17} />}
        </span>
        <div>
          <b>{now.title}</b>
          <p>{now.body}</p>
        </div>
      </div>

      {now.action && (
        <button type="button" className="assist-go" onClick={() => run(now, grid)}>
          {now.action.label}
          <IconChevron size={14} />
        </button>
      )}

      {rest.length > 0 && (
        <ul className="assist-rest">
          {rest.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => run(a, grid)}>
                {a.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
