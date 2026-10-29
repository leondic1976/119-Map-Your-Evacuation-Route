/*
 * 우리집 대피지도 — 데스크톱 껍데기 (설계서 v1.18 §5.3).
 *
 * 오프라인 HTML(dist/home-escape-map.html)과 음성 폴더를 그대로 연다. 앱은 이미 file:// 에서
 * 네트워크 없이 도는 것이 검증돼 있어 Host 를 갈아 끼우지 않는다. 저장은 Electron 프로필의
 * localStorage 에 남고, 파일 저장은 저장 대화상자로 받는다. 바깥 주소로는 나가지 않는다.
 */
const { app, BrowserWindow, Menu, dialog, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/* 앱이 PC 전용으로 보는 최소 화면 — 본문의 1024px 판정과 같다 */
const CONTENT_MIN_WIDTH = 1024;
const CONTENT_MIN_HEIGHT = 700;
const CONTENT_WIDTH = 1280;
const CONTENT_HEIGHT = 800;

const APP_ID = 'io.github.leondic1976.home-escape-map';
const appDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', 'dist');
const indexFile = path.join(appDir, 'home-escape-map.html');

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
    title: '우리집 대피지도',
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
  Menu.setApplicationMenu(null);

  /* 새 창과 바깥 주소는 막는다 — 이 앱은 인터넷에 아무것도 보내지 않는다 */
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

app.setAppUserModelId(APP_ID);

app.whenReady().then(() => {
  if (!fs.existsSync(indexFile)) {
    dialog.showErrorBox('우리집 대피지도', `앱 파일을 찾지 못했다.\n${indexFile}\n\n설치 파일을 다시 받아 설치한다.`);
    app.quit();
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
