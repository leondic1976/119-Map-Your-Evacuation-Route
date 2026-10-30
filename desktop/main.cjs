/*
 * 우리집 대피지도 — 데스크톱 껍데기 (설계서 v1.18 §5.3 · v2.0 §7).
 *
 * 오프라인 HTML(dist/home-escape-map.html)과 음성 폴더를 그대로 연다. 앱은 이미 file:// 에서
 * 네트워크 없이 도는 것이 검증돼 있어 Host 를 갈아 끼우지 않는다. 저장은 Electron 프로필의
 * localStorage 에 남고, 파일 저장은 저장 대화상자로 받는다. 화면 안에서는 바깥 주소로 나가지 않는다.
 *
 * 새 판 확인(v2.0 §7) — 켤 때 한 번, 그리고 F5·메뉴(Alt)로 손수. 사이트의 download/latest.json 을 읽어
 * 판이 더 새것이면 묻고, 설치판을 받아 sha256 을 맞춘 뒤 조용히 덮어쓰고 다시 연다. 인터넷이 없으면
 * 아무 말 없이 넘어간다 — 이 앱은 인터넷 없이도 다 된다. 이것 말고는 어떤 요청도 보내지 않는다.
 */
const { app, BrowserWindow, Menu, dialog, net, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

/* 앱이 PC 전용으로 보는 최소 화면 — 본문의 1024px 판정과 같다 */
const CONTENT_MIN_WIDTH = 1024;
const CONTENT_MIN_HEIGHT = 700;
const CONTENT_WIDTH = 1280;
const CONTENT_HEIGHT = 800;

const APP_ID = 'io.github.leondic1976.home-escape-map';
const APP_NAME = '우리집 대피지도';
/* 공개 사이트의 설치 안내 — latest.json 과 설치판은 이 아래에 있다 (설계서 v1.18 §5.3 · v2.0 §7) */
const SITE_DOWNLOAD = 'https://leondic1976.github.io/119-Map-Your-Evacuation-Route/download/';
const appDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', 'dist');
const indexFile = path.join(appDir, 'home-escape-map.html');
/* 무설치판은 덮어쓸 자리가 없다 — 새 판이 있으면 받는 곳을 열어 준다 */
const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);

/* 한 번에 한 창만 — 두 번 켜면 먼저 켠 창을 앞으로 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

function createWindow() {
  /*
   * 크기는 창틀이 아니라 본문 기준이다(useContentSize). 1024×768 교실 모니터처럼 작은 화면에서는
   * 창을 최대화해 본문 너비가 1024px 에 닿게 한다 — 그래야 앱의 PC 판정을 통과한다.
   */
  const work = screen.getPrimaryDisplay().workAreaSize;
  const small = work.width < CONTENT_WIDTH + 16 || work.height < CONTENT_HEIGHT + 40;
  const win = new BrowserWindow({
    width: Math.min(CONTENT_WIDTH, work.width),
    height: Math.min(CONTENT_HEIGHT, work.height),
    minWidth: CONTENT_MIN_WIDTH,
    minHeight: CONTENT_MIN_HEIGHT,
    useContentSize: true,
    title: APP_NAME,
    backgroundColor: '#eef3f7',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  /* 메뉴 막대는 숨겨 두고 Alt 로 연다 — 새 판 확인(F5)과 정보만 */
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '도움말',
        submenu: [
          { label: '새 판 확인', accelerator: 'F5', click: () => void checkForUpdate(win, true) },
          { label: '받는 곳 열기', click: () => void shell.openExternal(SITE_DOWNLOAD) },
          { type: 'separator' },
          { label: `${APP_NAME} ${app.getVersion()}`, enabled: false },
        ],
      },
    ]),
  );

  /* 새 창과 바깥 주소는 막는다 — 화면은 인터넷에 아무것도 보내지 않는다 */
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });

  /* 「파일 저장」「그림으로 저장」은 어디에 둘지 묻는다 */
  win.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: '파일로 저장',
      defaultPath: path.join(app.getPath('documents'), item.getFilename()),
    });
  });

  /* F11 전체 화면 — 교실 빔프로젝터용 */
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  if (small) win.maximize();
  win.loadFile(indexFile);
  return win;
}

/* ------------------------------------------------------------ 새 판 (설계서 v2.0 §7) */

/** 2.1.0 > 2.0.9 — 세 자리 판 번호 비교 */
function isNewer(candidate, current) {
  const a = String(candidate).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const b = String(current).split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function fetchLatest() {
  const res = await net.fetch(`${SITE_DOWNLOAD}latest.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || typeof data.version !== 'string') throw new Error('latest.json 모양이 다르다');
  return data;
}

let checking = false;

/**
 * 손수 확인(manual)이면 결과를 늘 말해 준다. 켤 때의 자동 확인은 새 판이 있을 때만 말을 건다.
 * 검증 러너(desktop-check)는 HEM_NO_UPDATE=1 로 끈다.
 */
async function checkForUpdate(win, manual) {
  if (checking || process.env.HEM_NO_UPDATE === '1') return;
  if (!app.isPackaged && !manual) return;
  checking = true;
  try {
    let latest;
    try {
      latest = await fetchLatest();
    } catch {
      if (manual) await dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message: '새 판을 확인하지 못했다.', detail: '인터넷이 연결돼 있는지 확인하고 다시 해 보자. 인터넷이 없어도 지금 판은 그대로 쓸 수 있다.' });
      return;
    }
    const current = app.getVersion();
    if (!isNewer(latest.version, current)) {
      if (manual) await dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message: `지금 판 ${current} 이 가장 새 판이다.` });
      return;
    }
    const notes = typeof latest.notes === 'string' && latest.notes.trim() ? `\n\n바뀐 것\n${latest.notes.trim()}` : '';
    if (portable || !latest.setup || !latest.setup.name) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['받는 곳 열기', '나중에'],
        defaultId: 0,
        cancelId: 1,
        title: '새 판이 있다',
        message: `${APP_NAME} ${latest.version} 이 나왔다.`,
        detail: `지금 판은 ${current} 이다. 무설치판은 받는 곳에서 새 파일을 받아 바꿔 쓰면 된다. 그린 지도는 그대로 남는다.${notes}`,
      });
      if (response === 0) await shell.openExternal(SITE_DOWNLOAD);
      return;
    }
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['지금 받아서 설치', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '새 판이 있다',
      message: `${APP_NAME} ${latest.version} 이 나왔다.`,
      detail: `지금 판은 ${current} 이다. 받아서 설치하면 앱이 잠깐 닫혔다가 새 판으로 다시 열린다. 그린 지도는 그대로 남는다.${notes}`,
    });
    if (response !== 0) return;
    await downloadAndInstall(win, latest);
  } catch (e) {
    dialog.showErrorBox(APP_NAME, `새 판을 설치하지 못했다.\n${e && e.message ? e.message : e}\n\n받는 곳에서 설치판을 직접 받아도 된다.`);
  } finally {
    checking = false;
  }
}

/** 설치판을 임시 폴더에 받고 sha256 을 맞춘 뒤, 조용히 덮어쓰고 끝나면 다시 연다 */
async function downloadAndInstall(win, latest) {
  const setup = latest.setup;
  const target = path.join(app.getPath('temp'), setup.name);
  const res = await net.fetch(new URL(setup.name, SITE_DOWNLOAD).href, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`설치판 받기 실패 (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(target);
  let got = 0;
  win.setProgressBar(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    out.write(Buffer.from(value));
    got += value.length;
    win.setProgressBar(setup.size ? Math.min(0.99, got / setup.size) : 2);
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  win.setProgressBar(-1);
  if (setup.sha256 && hash.digest('hex') !== setup.sha256) {
    fs.rmSync(target, { force: true });
    throw new Error('받은 파일이 사이트의 것과 다르다. 다시 해 보자.');
  }
  /* NSIS 설치판 — /S 조용히 덮어쓰기, 끝나면 --force-run 으로 다시 켠다 */
  const child = spawn(target, ['/S', '--force-run'], { detached: true, stdio: 'ignore' });
  child.unref();
  app.quit();
}

app.setAppUserModelId(APP_ID);

app.whenReady().then(() => {
  if (!fs.existsSync(indexFile)) {
    dialog.showErrorBox(APP_NAME, `앱 파일을 찾지 못했다.\n${indexFile}\n\n설치 파일을 다시 받아 설치한다.`);
    app.quit();
    return;
  }
  const win = createWindow();
  /* 화면이 뜬 뒤 조용히 한 번 — 새 판이 있을 때만 묻는다 */
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => void checkForUpdate(win, false), 2500);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
