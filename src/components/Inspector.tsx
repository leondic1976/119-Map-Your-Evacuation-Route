'use client';

/** 단계별 검사기 — 오른쪽 패널 */
import React from 'react';
import { STEPS } from '../lib/store';
import { useApp } from './useStore';
import { Grid } from '../lib/grid';
import { SmokeField } from '../lib/firesim';
import Step1Plan from './panels/Step1Plan';
import Step2Meta from './panels/Step2Meta';
import Step3Opening from './panels/Step3Opening';
import Step4Facility from './panels/Step4Facility';
import Step5Route from './panels/Step5Route';
import Step6Sim from './panels/Step6Sim';
import Step7Drill from './panels/Step7Drill';
import Step8Check from './panels/Step8Check';
import Step9Output from './panels/Step9Output';

interface Props {
  grid: Grid;
  field: SmokeField | null;
  pickMode: boolean;
  setPickMode: (v: boolean) => void;
  onPreview: (v: boolean) => void;
}

export default function Inspector({ grid, field, pickMode, setPickMode, onPreview }: Props) {
  const { step } = useApp();
  const def = STEPS[step];

  return (
    <aside className="inspector" aria-label={`${def.title} 검사기`}>
      <div className="insp-head">
        <div className="no">STEP {def.no}</div>
        <h2>{def.title}</h2>
        <p>{def.guide}</p>
      </div>
      {step === 0 && <Step1Plan />}
      {step === 1 && <Step2Meta />}
      {step === 2 && <Step3Opening />}
      {step === 3 && <Step4Facility />}
      {step === 4 && <Step5Route />}
      {step === 5 && <Step6Sim field={field} grid={grid} pickMode={pickMode} setPickMode={setPickMode} />}
      {step === 6 && <Step7Drill grid={grid} />}
      {step === 7 && <Step8Check grid={grid} />}
      {step === 8 && <Step9Output onPreview={onPreview} />}
    </aside>
  );
}
