'use client';

/**
 * 진입 — 누가 쓰는지 골라 두 화면 가운데 하나를 연다.
 * 첫 방문에는 고르는 덮개가 뜨고, 고른 뒤에는 바로 그 화면이 열린다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import EntryGate, { Audience, loadAudience, saveAudience } from '../components/EntryGate';
import KidsShell from '../kids/ui/KidsShell';

export default function Page() {
  /* 서버에서는 저장소를 읽을 수 없으므로 첫 그림은 비워 두고, 뜨자마자 읽는다 */
  const [audience, setAudience] = useState<Audience | null | 'unknown'>('unknown');

  useEffect(() => {
    setAudience(loadAudience());
  }, []);

  const pick = useCallback((a: Audience) => {
    saveAudience(a);
    setAudience(a);
  }, []);

  const leave = useCallback(() => {
    saveAudience(null);
    setAudience(null);
  }, []);

  if (audience === 'unknown') return null;
  if (audience === null) return <EntryGate onPick={pick} />;
  if (audience === 'kids') return <KidsShell onLeave={leave} />;
  return <AppShell onLeave={leave} />;
}
