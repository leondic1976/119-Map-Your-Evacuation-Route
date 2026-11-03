import { NameTag, Welcome } from './ui/Screens';
import { Studio } from './ui/Studio';
import { useApp } from './store/app';

export function App() {
  const screen = useApp((s) => s.screen);
  return (
    <>
      <div className="too-small" role="alert">
        <h1>우리집 대피지도</h1>
        <p>화면이 조금 작아. 태블릿이나 컴퓨터에서 열어 보자.</p>
      </div>
      <div className="app-root">
        {screen === 'welcome' && <Welcome />}
        {screen === 'nametag' && <NameTag />}
        {screen === 'studio' && <Studio />}
      </div>
    </>
  );
}
