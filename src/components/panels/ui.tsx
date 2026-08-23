'use client';

/** 검사기 패널 공용 조각 */
import React from 'react';

export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="group">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  wide,
  id,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  id?: string;
}) {
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const id = React.useId();
  return (
    <Field label={label} id={id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span style={{ color: 'var(--n6)', fontSize: 11.5 }}>{suffix}</span>}
      </div>
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = React.useId();
  return (
    <Field label={label} id={id}>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Metric({ v, l }: { v: React.ReactNode; l: string }) {
  return (
    <div className="metric">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}

export function Callout({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warn' | 'danger';
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`callout${kind === 'info' ? '' : ` ${kind}`}`}>
      {title && <b>{title}</b>}
      {children}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="note" style={{ padding: '10px 0', color: 'var(--n5)' }}>
      {children}
    </p>
  );
}

export function fmtTime(s: number): string {
  if (!isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}분 ${r}초` : `${r}초`;
}

export function fmtSec(s: number): string {
  if (!isFinite(s)) return '—';
  return `${Math.round(s)}초`;
}
