/*
 * 우리집 대피지도 — 데스크톱 껍데기 (설계서 v1.18 §5.3 · v2.0 §7).
 *
 * V2 오프라인 HTML(dist/home-escape-map.html)과 그림·음성 폴더를 그대로 연다. 앱은 이미 file:// 에서
 * 네트워크 없이 도는 것이 검증돼 있어 Host 를 갈아 끼우지 않는다. 저장은 Electron 프로필의
 * localStorage 에 남고, 파일 저장은 저장 대화상자로 받는다. 화면 안에서는 바깥 주소로 나가지 않는다.
 *
 * 자동 업데이트(대장 #131) — 켤 때와 여섯 시간마다 사이트의 download/latest.json 을 읽어, 판이 더 새것이면
 * 묻지 않고 받아 sha256 을 맞춰 둔다. 그리는 도중에 꺼지지 않도록 창을 닫을 때 조용히 설치하고, 다음에 켜면
 * 새 판이다. F5·메뉴(Alt)로 손수 확인하면 바로 설치할 수도 있다. 인터넷이 없으면 아무 말 없이 넘어간다.
 * 이것 말고는 어떤 요청도 보내지 않는다. 화면 캐시는 남기지 않고 저장은 도면뿐이다(대장 #132).
 */
const { app, BrowserWindow, Menu, dialog, net, screen, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

/* 창을 화면 반쪽에 붙여도 쓰게 웹과 같은 800 으로 둔다 (설계서 v2.0 §11) */
const CONTENT_MIN_WIDTH = 800;
const CONTENT_MIN_HEIGHT = 600;
const CONTENT_WIDTH = 1280;
const CONTENT_HEIGHT = 800;

const APP_ID = 'io.github.leondic1976.home-escape-map';
const APP_NAME = '우리집 대피지도';
/* 공개 사이트의 설치 안내 — latest.json 과 설치판은 이 아래에 있다 (설계서 v1.18 §5.3 · v2.0 §7) */
const SITE_DOWNLOAD = 'https://leondic1976.github.io/119-Map-Your-Evacuation-Route/download/';
/* 검증(desktop-update-check)만 가짜 사이트를 쓴다 */
const UPDATE_BASE = process.env.HEM_UPDATE_URL || SITE_DOWNLOAD;
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;

/* 화면 파일은 앱 안에 있으니 디스크 캐시를 남기지 않는다 */
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
const appDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', 'dist');
const indexFile = path.join(appDir, 'home-escape-map.html');
/* 무설치판은 실행 파일 자리를 안다 — 창을 닫은 뒤 그 파일을 새것으로 바꾼다 */
const portableFile = process.env.PORTABLE_EXECUTABLE_FILE || '';

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
   * 크기는 창틀이 아니라 본문 기준이다(useContentSize). 처음에는 1280×800 으로 열고, 그보다 작은
   * 교실 모니터에서는 최대화한다. 이용자는 800×600 까지 줄일 수 있다 — 앱도 그 너비에서 돈다.
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
    backgroundColor: '#fbf7ea',
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
  const res = await net.fetch(`${UPDATE_BASE}latest.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || typeof data.version !== 'string') throw new Error('latest.json 모양이 다르다');
  return data;
}

let checking = false;
/* 받아서 맞춰 둔 새 판 — 창을 닫을 때 설치한다 */
let pending = null;

function updateLog(message) {
  if (process.env.HEM_UPDATE_LOG) fs.appendFileSync(process.env.HEM_UPDATE_LOG, `${message}\n`);
}

const updateDir = () => path.join(app.getPath('temp'), 'home-escape-map-update');

/**
 * 묻지 않고 받아 둔다. 손수 확인(manual)일 때만 결과를 말한다.
 * 일반 검증(desktop-check)은 HEM_NO_UPDATE=1 로 끈다.
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
      updateLog('offline');
      if (manual) await dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message: '새 판을 확인하지 못했다.', detail: '인터넷이 연결돼 있는지 확인하고 다시 해 보자. 인터넷이 없어도 지금 판은 그대로 쓸 수 있다.' });
      return;
    }
    const current = app.getVersion();
    if (!isNewer(latest.version, current)) {
      updateLog('current');
      if (manual) await dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message: `지금 판 ${current} 이 가장 새 판이다.` });
      return;
    }
    if (!pending || pending.version !== latest.version) {
      const asset = portableFile ? latest.portable : latest.setup;
      if (!asset || !asset.name || !asset.sha256) return;
      pending = { version: latest.version, file: await download(win, asset) };
      updateLog('ready');
      if (!win.isDestroyed()) win.setTitle(`${APP_NAME} — 새 판 ${latest.version} 준비됨 · 닫으면 설치된다`);
    }
    if (manual) {
      const notes = typeof latest.notes === 'string' && latest.notes.trim() ? `\n\n바뀐 것\n${latest.notes.trim()}` : '';
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['지금 설치', '닫을 때 설치'],
        defaultId: 1,
        cancelId: 1,
        title: '새 판을 받아 두었다',
        message: `${APP_NAME} ${latest.version} 을 받아 두었다.`,
        detail: `지금 판은 ${current} 이다. 그린 지도는 그대로 남는다.${notes}`,
      });
      if (response === 0) {
        install(true);
        pending = null;
        app.quit();
      }
    }
  } catch (e) {
    updateLog(e && e.message === 'mismatch' ? 'mismatch' : `error ${e && e.message}`);
    if (manual) dialog.showErrorBox(APP_NAME, `새 판을 받지 못했다.\n${e && e.message ? e.message : e}\n\n받는 곳에서 직접 받아도 된다.`);
  } finally {
    checking = false;
  }
}

/** 임시 폴더에 받고 sha256 을 맞춘다. 다르면 지운다 */
async function download(win, asset) {
  fs.mkdirSync(updateDir(), { recursive: true });
  const target = path.join(updateDir(), path.basename(asset.name));
  const res = await net.fetch(new URL(asset.name, UPDATE_BASE).href, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`받기 실패 (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(target);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    out.write(Buffer.from(value));
    got += value.length;
    if (!win.isDestroyed()) win.setProgressBar(asset.size ? Math.min(0.99, got / asset.size) : 2);
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  if (!win.isDestroyed()) win.setProgressBar(-1);
  if (hash.digest('hex') !== asset.sha256) {
    fs.rmSync(target, { force: true });
    throw new Error('mismatch');
  }
  return target;
}

/** 받아 둔 판을 설치한다. restart 면 끝나고 다시 켠다 */
function install(restart) {
  if (!pending) return;
  updateLog('install');
  if (portableFile) {
    /* 실행 중인 파일은 바꿀 수 없다 — 앱이 끝나 풀릴 때까지 기다렸다가 바꾼다. 경로는 환경 변수로 넘겨 글자가 깨지지 않게 한다 */
    const script = 'for($i=0;$i -lt 240;$i++){try{Copy-Item -LiteralPath $env:HEM_SRC -Destination $env:HEM_DST -Force -ErrorAction Stop;Remove-Item -LiteralPath $env:HEM_SRC -Force;exit 0}catch{Start-Sleep -Milliseconds 500}}';
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, HEM_SRC: pending.file, HEM_DST: portableFile },
    }).unref();
    return;
  }
  /* NSIS 설치판 — /S 조용히 덮어쓰기, restart 면 끝나고 --force-run 으로 다시 켠다 */
  spawn(pending.file, restart ? ['/S', '--force-run'] : ['/S'], { detached: true, stdio: 'ignore' }).unref();
}

/* 창을 닫을 때 받아 둔 새 판을 설치한다 */
app.on('will-quit', () => {
  try {
    install(false);
  } catch (e) {
    updateLog(`error ${e && e.message}`);
  }
  pending = null;
});

app.setAppUserModelId(APP_ID);

app.whenReady().then(() => {
  /* 도면(localStorage)은 두고 다른 저장본은 지운다. 지난번에 받았던 설치 파일도 지운다 */
  void session.defaultSession.clearCache().catch(() => undefined);
  void session.defaultSession.clearStorageData({ storages: ['cachestorage', 'serviceworkers', 'shadercache'] }).catch(() => undefined);
  fs.rmSync(updateDir(), { recursive: true, force: true });
  if (!fs.existsSync(indexFile)) {
    dialog.showErrorBox(APP_NAME, `앱 파일을 찾지 못했다.\n${indexFile}\n\n설치 파일을 다시 받아 설치한다.`);
    app.quit();
    return;
  }
  const win = createWindow();
  /* 화면이 뜬 뒤 조용히 받아 둔다. 오래 켜 두어도 여섯 시간마다 다시 본다 */
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => void checkForUpdate(win, false), 2500);
    setInterval(() => {
      if (!win.isDestroyed()) void checkForUpdate(win, false);
    }, UPDATE_EVERY_MS).unref?.();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
