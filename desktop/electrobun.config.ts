import type { ElectrobunConfig } from 'electrobun';

import app from '../app.json';

export default {
  app: {
    name: 'AI Hat',
    identifier: app.expo.ios.bundleIdentifier,
    version: app.expo.version,
    description: 'A chat app for any OpenAI-compatible endpoint.',
  },
  build: {
    mainProcess: 'bun',
    bun: { entrypoint: 'src/bun/index.ts', minify: true },
    // The web build of the app (`npx expo export --platform web`, run from the repo root).
    copy: { '../dist': 'web' },
    mac: {
      icons: 'icons/icon.iconset',
      entitlements: { 'com.apple.security.device.audio-input': 'AI Hat uses the microphone when you dictate a message.' },
    },
    linux: { icon: 'icons/icon.png' },
    win: { icon: 'icons/icon-256.png' },
  },
  scripts: { postWrap: 'scripts/adhoc-sign.ts' },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
