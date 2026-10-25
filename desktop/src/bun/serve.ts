/**
 * Browser mode: the same backend without the desktop window. Opens AI Hat in your default browser, for developing
 * the desktop build, or on a machine where the window can't open (a Linux box without WebKitGTK).
 *
 *   bun src/bun/serve.ts [path to the web build, default ../dist]
 *
 * Its data folder is separate from the installed app's, so trying things here never touches your real chats.
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import app from '../../../app.json';

import { startServer } from './server';

const appData =
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support')
    : process.platform === 'win32'
      ? process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
      : process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');

const opener = process.platform === 'darwin' ? ['open'] : process.platform === 'win32' ? ['cmd', '/c', 'start', ''] : ['xdg-open'];
const open = (target: string) => {
  try {
    Bun.spawn([...opener, target], { stdout: 'ignore', stderr: 'ignore' });
  } catch {
    console.log('Open this yourself:', target);
  }
};

const server = await startServer({
  webRoot: resolve(process.argv[2] ?? join(import.meta.dir, '../../../dist')),
  host: {
    dataDir: process.env.AIHAT_DATA_DIR || join(appData, app.expo.ios.bundleIdentifier, 'browser'),
    downloads: join(homedir(), 'Downloads'),
    version: app.expo.version,
    openExternal: open,
    showItemInFolder: (path) => console.log('Saved', path),
    notify: (title, body) => console.log(`[notification] ${title}: ${body}`),
  },
  keysInFile: process.env.AIHAT_KEYS_IN_FILE === '1',
});

console.log(`AI Hat is running at ${server.url} (keys: ${server.keyStore}). Press Ctrl+C to stop.`);
if (process.env.AIHAT_NO_OPEN !== '1') open(server.url);
