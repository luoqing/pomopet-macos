import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { AppRuntime } from './runtime.mjs';
import { EdgeTtsSynthesizer } from './edge-tts.mjs';
import { JsonStore } from './store.mjs';
import { createBlockerSuppression } from './blocker-suppression.mjs';
import { createAiKeyHandler, createIpcAuthorizer } from './ipc-security.mjs';
import { createPresentationRouter, sendPresentationWhenReady, showPresentationNotification } from './presentation-routing.mjs';
import { resolveControlClose } from './control-close.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
let controlWindow; let petWindow; let blockWindow; let tray; let runtime; let edgeTts; let quitting = false; let controlDirty = false; let closePromptOpen = false;
const ipcAuthorizer = createIpcAuthorizer({
  getControlWindow: () => controlWindow,
  getPetWindow: () => petWindow,
  getBlockWindow: () => blockWindow
});
const blockerSuppression = createBlockerSuppression((name, payload) => runtime?.command(name, payload));
const presentationRouter = createPresentationRouter({
  sendPet: (event) => {
    const wake = wakesHiddenPet(event);
    if (wake) showTemporaryPet();
    if (!wake && !['full', 'pet'].includes(petDisplayMode())) return;
    if (petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) sendPresentationWhenReady(petWindow, event);
  },
  showBlocker: (event) => showOffworkBlocker(event),
  shouldShowBlocker: () => Boolean(runtime.data.offwork.blockMode)
});
const appPage = (name) => join(here, '../../../dist/app', name);
const PET_WIDTH = 300;
const PET_HEIGHT = 280;
const PET_TIMER_HEIGHT = 126;
const WAKE_PET_CATEGORIES = new Set(['focusComplete', 'breakComplete', 'alarm', 'offwork', 'ignored']);

function petDisplayMode() {
  return runtime?.data?.pet?.displayMode || (runtime?.data?.pet?.visible === false ? 'hidden' : 'full');
}

function wakesHiddenPet(event) {
  return WAKE_PET_CATEGORIES.has(event?.category);
}

function trayIcon() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="12" r="8" fill="#E66C4C"/><path d="M7 6Q11 1 15 6" fill="#70A66D"/><circle cx="8.5" cy="12" r="1"/><circle cx="13.5" cy="12" r="1"/></svg>';
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')).resize({ width: 18, height: 18 });
}

function send(channel, value) {
  for (const win of [controlWindow, petWindow, blockWindow]) if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}

function clampPosition(bounds = {}) {
  const primary = screen.getPrimaryDisplay().workArea;
  const width = Number.isFinite(Number(bounds.width)) && Number(bounds.width) > 0 ? Number(bounds.width) : PET_WIDTH;
  const height = Number.isFinite(Number(bounds.height)) && Number(bounds.height) > 0 ? Number(bounds.height) : PET_HEIGHT;
  const x = Number.isFinite(Number(bounds.x)) ? Number(bounds.x) : primary.x + primary.width - width;
  const y = Number.isFinite(Number(bounds.y)) ? Number(bounds.y) : primary.y + primary.height - height;
  const normalized = { x, y, width, height };
  const display = screen.getDisplayMatching(normalized).workArea;
  return {
    x: Math.min(Math.max(x, display.x), display.x + display.width - width),
    y: Math.min(Math.max(y, display.y), display.y + display.height - height)
  };
}

function recallPet({ recreate = false } = {}) {
  if (recreate && petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  const win = ensurePetWindow();
  if (!win) return false;
  const current = win.getBounds();
  const display = controlWindow && !controlWindow.isDestroyed()
    ? screen.getDisplayMatching(controlWindow.getBounds()).workArea
    : screen.getPrimaryDisplay().workArea;
  const height = Math.min(480, Math.max(PET_HEIGHT, current.height || PET_HEIGHT));
  const recalledBounds = {
    x: Math.round(display.x + display.width - PET_WIDTH - 24),
    y: Math.round(display.y + display.height - height - 24),
    width: PET_WIDTH,
    height
  };
  win.setBounds(recalledBounds, false);
  win.setOpacity(1);
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (win.isMinimized()) win.restore();
  win.show();
  win.moveTop();
  return true;
}

function resizePetWindow(requestedHeight = PET_HEIGHT, minimumHeight = PET_TIMER_HEIGHT) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds).workArea;
  const height = Math.min(480, Math.max(minimumHeight, Math.round(requestedHeight)));
  const bottom = bounds.y + bounds.height;
  const y = Math.max(display.y, bottom - height);
  petWindow.setBounds({ x: bounds.x, y, width: PET_WIDTH, height: bottom - y }, false);
}

function applyPetDisplayMode({ recreate = false } = {}) {
  const mode = petDisplayMode();
  if (mode === 'hidden') {
    petWindow?.hide();
    refreshTray();
    return;
  }
  if (recreate) recallPet({ recreate: true });
  const win = ensurePetWindow();
  if (!win || win.isDestroyed()) return;
  resizePetWindow(mode === 'timer' ? PET_TIMER_HEIGHT : PET_HEIGHT);
  win.show();
  win.moveTop();
  refreshTray();
}

function showTemporaryPet() {
  const win = ensurePetWindow();
  if (!win || win.isDestroyed()) return;
  resizePetWindow(PET_HEIGHT, PET_HEIGHT);
  win.show();
  win.moveTop();
}

async function closeControlWindow() {
  if (closePromptOpen || !controlWindow || controlWindow.isDestroyed()) return;
  closePromptOpen = true;
  try {
    const action = await resolveControlClose({
      dirty: controlDirty,
      quitting,
      confirmDiscard: async () => {
        const result = await dialog.showMessageBox(controlWindow, {
          type: 'warning',
          title: '有未保存修改',
          message: '当前窗口还有未保存的修改。',
          detail: '继续编辑会保留草稿；放弃修改会恢复到上次保存的内容。',
          buttons: ['继续编辑', '放弃修改'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        return result.response;
      },
      getCurrentState: () => ({ quitting, windowAvailable: Boolean(controlWindow && !controlWindow.isDestroyed()) })
    });
    if (action === 'close' || action === 'ignore' || !controlWindow || controlWindow.isDestroyed()) return;
    if (action === 'focus') { controlWindow.show(); controlWindow.focus(); }
    if (action === 'discard-hide') { controlWindow.webContents.send('discard-drafts'); controlDirty = false; controlWindow.hide(); }
    if (action === 'hide') controlWindow.hide();
  } finally {
    closePromptOpen = false;
  }
}

function ensurePetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow;
  if (!runtime) return null;
  const area = screen.getPrimaryDisplay().workArea;
  const saved = runtime.data.pet.position;
  const initial = clampPosition(saved || { x: area.x + area.width - 330, y: area.y + area.height - 310, width: PET_WIDTH, height: PET_HEIGHT });
  const win = petWindow = new BrowserWindow({
    ...initial, width: PET_WIDTH, height: PET_HEIGHT, transparent: true, frame: false, resizable: false,
    hasShadow: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    show: petDisplayMode() !== 'hidden', type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(appPage('pet.html'));
  win.on('moved', () => {
    if (win.isDestroyed()) return;
    const bounds = win.getBounds();
    runtime.command('pet:position', { x: bounds.x, y: bounds.y + bounds.height - PET_HEIGHT }).catch(console.error);
  });
  petWindow.on('closed', () => { if (petWindow === win) petWindow = undefined; });
  petWindow.webContents.on('render-process-gone', () => {
    if (!quitting && !win.isDestroyed()) win.destroy();
    if (petWindow === win) petWindow = undefined;
  });
  return win;
}

function createWindows() {
  controlWindow = new BrowserWindow({
    width: 1040, height: 740, minWidth: 860, minHeight: 640, show: false,
    titleBarStyle: 'hiddenInset', backgroundColor: '#f3eadb',
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  controlWindow.loadFile(appPage('index.html'));
  controlWindow.once('ready-to-show', () => controlWindow.show());
  controlWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); void closeControlWindow().catch(console.error); } });
  ensurePetWindow();
}

function ensureBlockWindow() {
  if (blockWindow && !blockWindow.isDestroyed()) return blockWindow;
  const bounds = screen.getPrimaryDisplay().bounds;
  blockWindow = new BrowserWindow({
    ...bounds, transparent: true, frame: false, resizable: false, movable: false,
    hasShadow: false, alwaysOnTop: true, skipTaskbar: true, focusable: true, show: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  blockWindow.setAlwaysOnTop(true, 'screen-saver');
  blockWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  blockWindow.loadFile(appPage('block.html'));
  blockWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); hideOffworkBlocker(); } });
  blockWindow.on('closed', () => { blockWindow = undefined; blockerSuppression.setActive(false).catch(console.error); });
  return blockWindow;
}

function showOffworkBlocker(event) {
  const win = ensureBlockWindow();
  win.setBounds(screen.getPrimaryDisplay().bounds);
  win.show();
  blockerSuppression.setActive(true).catch(console.error);
  win.focus();
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => win.webContents.send('presentation', event));
  else win.webContents.send('presentation', event);
}

function hideOffworkBlocker() {
  if (blockWindow && !blockWindow.isDestroyed()) blockWindow.hide();
  blockerSuppression.setActive(false).catch(console.error);
}

function refreshTray() {
  if (!tray || tray.isDestroyed()) return false;
  const petVisible = petDisplayMode() !== 'hidden';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Pomopet 小屋', click: () => { if (controlWindow && !controlWindow.isDestroyed()) { controlWindow.show(); controlWindow.focus(); } } },
    { label: petVisible ? '让小狗躲一会儿' : '叫小狗回来', click: async () => {
      await runtime.command('pet:displayMode', { mode: petVisible ? 'hidden' : 'full' });
      applyPetDisplayMode({ recreate: !petVisible });
    } },
    { type: 'separator' },
    { label: '退出 Pomopet', click: () => { quitting = true; app.quit(); } }
  ]));
  return true;
}

function createTray() {
  try {
    tray = new Tray(trayIcon()); tray.setToolTip('Pomopet · 你工作，我陪你'); refreshTray();
    tray.on('click', () => { void runtime.command('pet:displayMode', { mode: 'full' }).then(() => applyPetDisplayMode({ recreate: true })).catch(console.error); });
    return true;
  } catch (error) {
    console.error('Pomopet tray unavailable:', error);
    tray = undefined;
    return false;
  }
}

app.whenReady().then(async () => {
  edgeTts = new EdgeTtsSynthesizer({ cacheDir: join(app.getPath('userData'), 'edge-tts-cache') });
  runtime = new AppRuntime({
    store: new JsonStore(join(app.getPath('userData'), 'pomopet-state.json')),
    onState: (state) => send('state', state),
    onPresentation: (event) => presentationRouter.route(event),
    onNotify: (event) => showPresentationNotification(event, {
        isSupported: () => Notification.isSupported(),
        createNotification: (options) => new Notification(options),
        openControl: () => { if (controlWindow && !controlWindow.isDestroyed()) { controlWindow.show(); controlWindow.focus(); } },
        muted: Boolean(runtime.data.settings.muted)
      })
  });
  await runtime.init(); createWindows(); createTray(); applyPetDisplayMode();
  setInterval(() => runtime.tick().catch(console.error), 500);
  app.on('activate', () => { controlWindow.show(); controlWindow.focus(); });
});

app.on('before-quit', () => { quitting = true; blockerSuppression.setActive(false).catch(console.error); runtime?.persist(); });
app.on('window-all-closed', () => {});
ipcMain.handle('command', async (event, name, payload) => {
  ipcAuthorizer.authorizeCommand(event, name);
  const state = await runtime.command(name, payload);
  if (name === 'settings:update' && Object.hasOwn(payload, 'launchAtLogin')) app.setLoginItemSettings({ openAtLogin: payload.launchAtLogin });
  if (name === 'pet:visible') { payload.visible ? recallPet({ recreate: true }) : petWindow?.hide(); refreshTray(); }
  if (name === 'pet:displayMode') applyPetDisplayMode();
  if (name === 'offwork:snooze' || name === 'offwork:dismiss') hideOffworkBlocker();
  return state;
});
ipcMain.handle('ai:set-key', createAiKeyHandler({ getControlWindow: () => controlWindow, setAiKey: (key) => runtime.setAiKey(key) }));
ipcMain.handle('state', () => runtime.view());
ipcMain.on('window:set-dirty', (event, dirty) => {
  if (!controlWindow || controlWindow.isDestroyed() || event.sender !== controlWindow.webContents) return;
  controlDirty = Boolean(dirty);
});
ipcMain.handle('speech:synthesize', async (event, payload) => { ipcAuthorizer.authorizeChannel(event, 'speech:synthesize'); return edgeTts?.synthesize(payload); });
ipcMain.handle('show-control', (event, payload) => {
  const { focus = null } = ipcAuthorizer.authorizeShowControl(event, payload);
  controlWindow.show(); controlWindow.focus();
  if (focus) {
    const notifyFocus = () => controlWindow.webContents.send('control-focus', { focus });
    if (controlWindow.webContents.isLoading()) controlWindow.webContents.once('did-finish-load', notifyFocus);
    else notifyFocus();
  }
});
ipcMain.handle('hide-blocker', (event) => { ipcAuthorizer.authorizeChannel(event, 'hide-blocker'); hideOffworkBlocker(); });
ipcMain.handle('hide-pet', async (event) => { ipcAuthorizer.authorizeChannel(event, 'hide-pet'); await runtime.command('pet:displayMode', { mode: 'hidden' }); applyPetDisplayMode(); });
ipcMain.handle('pet:set-speaking', (event, payload = {}) => {
  ipcAuthorizer.authorizeChannel(event, 'pet:set-speaking');
  if (payload.visible) resizePetWindow(payload.height || PET_HEIGHT);
  else if (payload.restoreDisplay) applyPetDisplayMode();
});
ipcMain.on('drag-pet', (event, delta) => {
  ipcAuthorizer.authorizeChannel(event, 'drag-pet');
  const bounds = petWindow.getBounds(); const next = clampPosition({ x: bounds.x + delta.x, y: bounds.y + delta.y, width: bounds.width, height: bounds.height });
  petWindow.setPosition(Math.round(next.x), Math.round(next.y));
});
