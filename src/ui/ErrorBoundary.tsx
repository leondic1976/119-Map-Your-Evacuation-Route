'use client';

/**
 * 오류 경계 (설계서 v1.18 §7).
 *
 * 화면이 깨져도 흰 화면으로 끝내지 않는다. 지도는 600ms 마다 자동 저장되므로
 * 다시 열면 이어서 할 수 있고, 혹시 모르니 지금 지도를 파일로도 내려받게 한다.
 */
import React from 'react';
import { useKids } from '../store/kidsStore';
import { downloadText, serializeSave } from '../store/storage';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[우리집 대피지도] 화면 오류', error, info.componentStack);
  }

  private save = (): void => {
    try {
      downloadText(serializeSave(useKids.getState().toSaveFile()), `우리집-대피지도-${new Date().toISOString().slice(0, 10)}.json`);
    } catch {
      /* 저장 자료마저 깨졌으면 자동 저장본이 마지막 보루다 */
    }
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="k-crash" role="alert" data-screen="crash">
        <section className="k-crash-card">
          <h1>앗, 화면에 문제가 생겼어</h1>
          <p>그리던 지도는 이 PC에 자동으로 저장돼 있어. 다시 열면 이어서 할 수 있어.</p>
          <details>
            <summary>무슨 일이 있었는지 보기</summary>
            <pre>{this.state.error.message}</pre>
          </details>
          <footer>
            <button type="button" className="k-crash-save" onClick={this.save}>
              지금 지도 파일로 저장
            </button>
            <button type="button" className="k-crash-reload" onClick={() => window.location.reload()} autoFocus>
              다시 열기
            </button>
          </footer>
        </section>
      </main>
    );
  }
}
