const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session } = require('electron');
const path = require('path');

const store = require('./src/store');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* .env is optional */ }
const brain = require('./src/brain');
const fish = require('./src/fish');
const auth = require('./src/auth');
const { split } = require('./src/sentences');

if (!app.requestSingleInstanceLock()) app.quit();

let win, tray, quitting = false;
let turnId = 0, current = null;
const history = [];
const send = (ch, ...a) => win && !win.isDestroyed() && win.webContents.send(ch, ...a);

function createWindow(show) {
  win = new BrowserWindow({
    width: 1180, height: 760, minWidth: 900, minHeight: 600, show, backgroundColor: '#03060f', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'), title: 'Jarvis',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.loadFile('renderer/index.html');
  // Closing the window keeps Jarvis listening from the tray.
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Jarvis');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Jarvis', click: () => win.show() },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => win.show());
}

function setAutostart(on) {
  // Unpackaged (dev) runs need to be told which app folder to start.
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] });
}

// ---------- one conversation turn ----------
function cancel() {
  turnId++;
  current?.kill();
  current = null;
  send('stop-audio');
}

async function ask(text) {
  cancel();
  const id = turnId;
  const cfg = store.config();
  const useFish = !!(cfg.fishKey && cfg.fishVoice);
  send('heard', text);
  send('turn-start', { fish: useFish });

  let chain = Promise.resolve(), buf = '';
  const speak = (s) => {
    send('sentence', s);
    if (!useFish) return;
    const audio = fish.tts(s, cfg).catch((e) => { send('error', e.message); return null; }); // start fetching now
    chain = chain.then(async () => { const b = await audio; if (id === turnId && b) send('audio', b); }); // but play in order
  };

  try {
    current = brain.ask(text, history, (t) => {
      if (id !== turnId) return;
      buf += t;
      const { sentences, rest } = split(buf);
      buf = rest;
      sentences.forEach(speak);
    });
    const full = await current.done;
    if (id !== turnId) return;
    split(buf, true).sentences.forEach(speak);
    history.push({ u: text, a: full.trim() });
    if (history.length > 6) history.shift();
  } catch (e) {
    if (id !== turnId) return;
    send('error', e.message);
    speak((await brain.claudeInstalled())
      ? 'I seem to have lost my train of thought, sir. Do check that Claude Code is logged in.'
      : 'I cannot reach my brain, sir. Claude Code does not appear to be installed.');
  }
  await chain;
  if (id === turnId) send('turn-end');
}

ipcMain.on('ask', (_e, text) => ask(text));
ipcMain.on('cancel', cancel);
ipcMain.handle('settings:get', async () => ({
  ...store.config(), ...auth.connected(),
  autostart: app.getLoginItemSettings().openAtLogin, claudeOk: await brain.claudeInstalled(),
}));
ipcMain.handle('settings:save', (_e, s) => {
  const { autostart, ...rest } = s;
  store.write('config.json', { ...store.read('config.json'), ...rest });
  if (typeof autostart === 'boolean') setAutostart(autostart);
});
ipcMain.handle('connect', async (_e, name) => { try { await auth.connect(name); return ''; } catch (e) { return e.message; } });

// ---------- global hold-to-talk: hold Ctrl+Space ----------
function startHotkey() {
  try {
    const { uIOhook, UiohookKey: K } = require('uiohook-napi');
    let ctrl = false, holding = false;
    const isCtrl = (c) => c === K.Ctrl || c === K.CtrlRight;
    const release = () => { if (holding) { holding = false; send('ptt', 'up'); } };
    uIOhook.on('keydown', (e) => {
      if (isCtrl(e.keycode)) ctrl = true;
      else if (e.keycode === K.Space && ctrl && !holding) { holding = true; send('ptt', 'down'); }
    });
    uIOhook.on('keyup', (e) => {
      if (isCtrl(e.keycode)) { ctrl = false; release(); } else if (e.keycode === K.Space) release();
    });
    uIOhook.start();
  } catch (e) { console.warn('Global hotkey unavailable (hold the orb with the mouse instead):', e.message); }
}

app.whenReady().then(() => {
  store.setDir(app.getPath('userData'));
  if (!store.read('config.json').autostartSet) {
    setAutostart(true); // start automatically by default; can be turned off in Settings
    store.write('config.json', { ...store.read('config.json'), autostartSet: true });
  }
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
  createWindow(!process.argv.includes('--hidden'));
  createTray();
  startHotkey();
});
app.on('second-instance', () => win?.show());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {});
