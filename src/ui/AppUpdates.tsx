'use client';

/**
 * 브라우저 설치판의 새 판 알림 (설계서 v1.18 §5.1).
 *
 * 서비스 워커를 등록하고, 새 판이 받아졌으면 화면 아래에 한 줄로 알린다.
 * 그리던 도중에 저절로 바뀌지 않는다 — 아이가 「다시 열기」를 눌러야 넘어간다.
 * 붉은 점멸은 쓰지 않는다 (작업지침 §10-10).
 */
import React, { useEffect, useState } from 'react';
import { host } from '../platform/host';

export default function AppUpdates() {
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState(false);

  useEffect(() => {
    host().installer.registerOffline(() => setReady(true));
  }, []);

  if (!ready || later) return null;
  return (
    <div className="k-update" role="status" aria-live="polite" data-coach="kids-update">
      <span>새 판이 준비됐어. 다시 열면 바뀐 것이 보여.</span>
      <button type="button" className="k-update-apply" onClick={() => host().installer.applyUpdate()}>
        다시 열기
      </button>
      <button type="button" className="k-update-later" onClick={() => setLater(true)}>
        나중에
      </button>
    </div>
  );
}
