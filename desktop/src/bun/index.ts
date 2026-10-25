/**
 * AI Hat for Linux, Windows and macOS. Electrobun runs this file in Bun and shows the app in the system's own web
 * view (WebKit on macOS and Linux, WebView2 on Windows), so there is no browser engine to ship. The window shows the
 * web build of the same app the phones run, served by ./server.
 */
import { ApplicationMenu, BrowserWindow, Screen, Utils } from 'electrobun/bun';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import app from '../../../app.json';

import { startServer } from './server';

const dataDir = Utils.paths.userData;
mkdirSync(dataDir, { recursive: true });

const server = await startServer({
  webRoot: join(import.meta.dir, '..', 'web'),
  host: {
    dataDir,
    downloads: Utils.paths.downloads,
    version: app.expo.version,
    openExternal: (url) => void Utils.openExternal(url),
    showItemInFolder: (path) => Utils.showItemInFolder(path),
    notify: (title, body) => Utils.showNotification({ title, body }),
  },
});

// ---------- the window, where you left it ----------
type Frame = { x: number; y: number; width: number; height: number };
const frameFile = join(dataDir, 'window.json');

function firstFrame(): Frame {
  try {
    const f = JSON.parse(readFileSync(frameFile, 'utf8')) as Frame;
    if (f.width >= 480 && f.height >= 400) return f;
  } catch {
    /* first launch */
  }
  const area = Screen.getPrimaryDisplay().workArea;
  const width = Math.min(1280, area.width || 1280);
  const height = Math.min(840, area.height || 840);
  return { width, height, x: area.x + Math.max(0, (area.width - width) / 2), y: area.y + Math.max(0, (area.height - height) / 2) };
}

let frame = firstFrame();
const win = new BrowserWindow({ title: 'AI Hat', url: server.url, frame });

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const remember = (patch: Partial<Frame>) => {
  frame = { ...frame, ...patch };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeFileSync(frameFile, JSON.stringify(frame)), 400);
};
win.on('resize', (e) => {
  const { x, y, width, height } = (e as { data: Frame }).data;
  remember({ x, y, width, height });
});
win.on('move', (e) => {
  const { x, y } = (e as { data: Frame }).data;
  remember({ x, y });
});

// A page that asks for a new window (a link with target=_blank the page didn't catch) opens in the system browser.
win.webview.on('new-window-open' as 'dom-ready', (e) => {
  const d = (e as { data: { detail: string | { url: string } } }).data.detail;
  const url = typeof d === 'string' ? d : d?.url;
  if (url && /^(https?|mailto):/.test(url)) Utils.openExternal(url);
});

// ---------- menu bar (macOS; on Windows and Linux the app's own shortcuts do the same) ----------
/** Tell the page to do something; the app listens for `aihat:command`. */
const command = (name: string) => win.webview.executeJavascript(`window.dispatchEvent(new CustomEvent('aihat:command', { detail: ${JSON.stringify(name)} }))`);

if (process.platform === 'darwin') ApplicationMenu.setApplicationMenu([
  {
    label: 'AI Hat',
    submenu: [
      { label: 'About AI Hat', action: 'about' },
      { type: 'separator' },
      { label: 'Settings…', action: 'settings', accelerator: ',' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'showAll' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'File',
    submenu: [
      { label: 'New chat', action: 'new-chat', accelerator: 'n' },
      { label: 'Search…', action: 'search', accelerator: 'k' },
      { type: 'separator' },
      { role: 'close' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
    ],
  },
  {
    label: 'View',
    submenu: [{ label: 'Toggle sidebar', action: 'toggle-sidebar' }, { type: 'separator' }, { role: 'toggleFullScreen' }],
  },
  { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
]);

ApplicationMenu.on('application-menu-clicked', (e) => {
  const action = (e as { data: { action?: string } }).data.action;
  if (action) command(action);
});
