import type { BunPlugin } from 'bun';
import type { ElectrobunConfig } from 'electrobun';

import app from '../app.json';

/** Electrobun's main-process API also re-exports two 3D engines the app never uses; leave them out (about 5 MB). */
const no3d: BunPlugin = {
  name: 'aihat-no-3d',
  setup(build) {
    build.onResolve({ filter: /^(three|@babylonjs\/core)$/ }, (args) => ({ path: args.path, namespace: 'aihat-empty' }));
    build.onLoad({ filter: /.*/, namespace: 'aihat-empty' }, () => ({ contents: 'export {};', loader: 'js' }));
  },
};

export default {
  app: {
    name: 'AI Hat',
    identifier: app.expo.ios.bundleIdentifier,
    version: app.expo.version,
    description: 'A chat app for any OpenAI-compatible endpoint.',
  },
  build: {
    bun: { entrypoint: 'src/bun/index.ts', minify: true, plugins: [no3d] },
    // The web build of the app (`npx expo export --platform web`, run from the repo root).
    copy: { '../dist': 'web' },
    mac: {
      icons: 'icons/icon.iconset',
      entitlements: { 'com.apple.security.device.audio-input': 'AI Hat uses the microphone when you dictate a message.' },
    },
    linux: { icon: 'icons/icon.png' },
    win: { icon: 'icons/icon-256.png' },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
