# For developers

[← Back to the README](../README.md)

## Run it from source

You need Node 22.

```bash
git clone https://github.com/aman-mohammed-max/aihat.git
cd aihat
npm install
npx expo start -c        # scan the QR code with Expo Go
```

Before sending changes: `npx tsc --noEmit` and `npx expo lint` (the **Check** workflow runs both).

**The desktop app** needs [Bun](https://bun.sh) as well:

```bash
npx expo export --platform web     # the web build, into dist/
cd desktop && bun install
bun run dev                        # the app in its window (needs WebKitGTK 4.1 on Linux)
bun run serve                      # or: the same backend, opened in your normal browser
bun test                           # backend tests
```

**Troubleshooting**
- `AggregateError [ETIMEDOUT]` with `--tunnel`: your network can't reach Expo's tunnel service. Try `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" npx expo start --tunnel`, or skip the tunnel and use the same Wi-Fi.
- On a Chromebook (Linux container), forward TCP port 8081 in ChromeOS settings and run `REACT_NATIVE_PACKAGER_HOSTNAME=<your Wi-Fi IP> npx expo start`.

## How the desktop app works

**The desktop app** is the same app built for the web (React Native Web) inside [Electrobun](https://blackboard.sh/electrobun/): a window that uses the computer's own web view (WebKit on macOS and Linux, Edge WebView2 on Windows) and a [Bun](https://bun.sh) backend, instead of shipping a whole browser the way Electron does. The download is tens of megabytes rather than the 100–250 MB of an Electron app. The Bun backend keeps your chats in SQLite in your user folder, keeps API keys in the system keychain (macOS Keychain, Windows Credential Manager, GNOME Keyring or KWallet on Linux; without a keyring, a file only you can read), reaches your endpoints and MCP servers without the browser's cross-site limits, saves exports to Downloads, shows notifications and brings browser sign-ins back to the app. It only listens on your own computer (127.0.0.1), and every request to it needs a key that changes each time the app starts.


## Project layout

```
src/app          screens and routes (Expo Router)
src/components   shared UI: header, composer, sheets, command palette…
src/store        app state (Zustand) and the SQLite data
src/api          OpenAI-compatible and MCP clients, image engines
src/lib          commands, PDF / Office readers, search, speech, titles
src/genui        generative UI (json-render catalog, renderer, parser)
desktop          the desktop app: Electrobun window and Bun backend (database, keychain, network, files)
handoff          the design mockups and spec the app follows
.github          build, release and check workflows
```

## Building releases

GitHub Actions builds every app on each push to `main` (the **Build & Release** workflow) and publishes them to the "latest beta build" release. Push a tag like `v0.1.0-beta.2` for a numbered release. You can also run **Android APK**, **iOS IPA** or **Desktop apps** alone from the Actions tab.
