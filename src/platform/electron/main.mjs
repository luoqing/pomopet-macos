import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { AppRuntime } from './runtime.mjs';
import { JsonStore } from './store.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
let controlWindow; let petWindow; let tray; let runtime; let quitting = false;
const appPage = (name) => join(here, '../../../dist/app', name);

function trayIcon() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="12" r="8" fill="#E66C4C"/><path d="M7 6Q11 1 15 6" fill="#70A66D"/><circle cx="8.5" cy="12" r="1"/><circle cx="13.5" cy="12" r="1"/></svg>';
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')).resize({ width: 18, height: 18 });
}

function send(channel, value) {
  for (const win of [controlWindow, petWindow]) if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}

function clampPosition(bounds) {
  const display = screen.getDisplayMatching(bounds).workArea;
  return {
    x: Math.min(Math.max(bounds.x, display.x), display.x + display.width - 300),
    y: Math.min(Math.max(bounds.y, display.y), display.y + display.height - 280)
  };
}

function createWindows() {
  controlWindow = new BrowserWindow({
    width: 1040, height: 740, minWidth: 860, minHeight: 640, show: false,
    titleBarStyle: 'hiddenInset', backgroundColor: '#f3eadb',
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  controlWindow.loadFile(appPage('index.html'));
  controlWindow.once('ready-to-show', () => controlWindow.show());
  controlWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); controlWindow.hide(); } });

  const area = screen.getPrimaryDisplay().workArea;
  const saved = runtime.data.pet.position;
  const initial = clampPosition(saved || { x: area.x + area.width - 330, y: area.y + area.height - 310, width: 300, height: 280 });
  petWindow = new BrowserWindow({
    ...initial, width: 300, height: 280, transparent: true, frame: false, resizable: false,
    hasShadow: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    show: true, type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  petWindow.loadFile(appPage('pet.html'));
  petWindow.on('moved', () => runtime.command('pet:position', petWindow.getBounds()));
}

function refreshTray() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Pomopet 小屋', click: () => { controlWindow.show(); controlWindow.focus(); } },
    { label: petWindow.isVisible() ? '让小狗躲一会儿' : '叫小狗回来', click: async () => {
      const visible = !petWindow.isVisible(); visible ? petWindow.showInactive() : petWindow.hide();
      await runtime.command('pet:visible', { visible }); refreshTray();
    } },
    { type: 'separator' },
    { label: '退出 Pomopet', click: () => { quitting = true; app.quit(); } }
  ]));
}

function createTray() {
  tray = new Tray(trayIcon()); tray.setToolTip('Pomopet · 你工作，我陪你'); refreshTray();
  tray.on('click', () => { petWindow.showInactive(); runtime.command('pet:visible', { visible: true }); refreshTray(); });
}

app.whenReady().then(async () => {
  runtime = new AppRuntime({
    store: new JsonStore(join(app.getPath('userData'), 'pomopet-state.json')),
    onState: (state) => send('state', state),
    onPresentation: (event) => {
      if (runtime.data.pet.visible && petWindow?.isVisible()) send('presentation', event);
      else if (['alarm', 'offwork', 'annoyed', 'reward'].includes(event.kind) && Notification.isSupported()) new Notification({ title: event.label ? 'Pomopet · ' + event.label : 'Pomopet 想提醒你', body: event.text }).show();
    },
    onNotify: () => {}
  });
  await runtime.init(); await runtime.command('pet:visible', { visible: true }); createWindows(); createTray();
  setInterval(() => runtime.tick().catch(console.error), 500);
  app.on('activate', () => { controlWindow.show(); controlWindow.focus(); });
});

app.on('before-quit', () => { quitting = true; runtime?.persist(); });
app.on('window-all-closed', () => {});
ipcMain.handle('command', async (_event, name, payload) => {
  const state = await runtime.command(name, payload);
  if (name === 'settings:update' && Object.hasOwn(payload, 'launchAtLogin')) app.setLoginItemSettings({ openAtLogin: payload.launchAtLogin });
  if (name === 'pet:visible') { payload.visible ? petWindow.showInactive() : petWindow.hide(); refreshTray(); }
  return state;
});
ipcMain.handle('state', () => runtime.view());
ipcMain.handle('show-control', () => { controlWindow.show(); controlWindow.focus(); });
ipcMain.handle('hide-pet', async () => { petWindow.hide(); await runtime.command('pet:visible', { visible: false }); refreshTray(); });
ipcMain.on('drag-pet', (_event, delta) => {
  const [x, y] = petWindow.getPosition(); const next = clampPosition({ x: x + delta.x, y: y + delta.y, width: 300, height: 280 });
  petWindow.setPosition(Math.round(next.x), Math.round(next.y));
});
