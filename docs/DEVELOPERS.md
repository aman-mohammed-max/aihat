# For developers

[← Back to the README](../README.md)

## Run it from source

You need Node 22.

```bash
git clone https://github.com/aman-mohammed-max/aihat.git
cd aihat
npm install
npx expo start -c        # Expo Go is for a JavaScript-only preview
```

Expo Go does not include AI Hat's custom native modules (`llama.rn`, Phonon, and crash logging). Use an AI Hat development or release build to test local models and speech. The GitHub Actions workflows generate native projects and build the Android APK and iOS simulator app; local Android Studio and Xcode are not required.

Before sending changes: `npx tsc --noEmit`, `npx expo lint`, `npm run test:expo-cli-compat`, `npm run test:navigation`, `npm run test:local-stream`, `npm run test:local-runtime`, `npm run test:local-backends`, `npm run test:local-models`, `npm run test:phonon-download`, `npm run test:marketplace`, and `npm run docs:check` (the **Check** workflow runs these).

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
- On an ARM64 Chromebook, `npx expo export --platform all --no-bytecode` can validate JavaScript bundles when the installed Hermes compiler is x86-64. Treat this as a bundle check only; build and publish native bundles with the normal Hermes bytecode step in CI.

## Local language-model engine

The app uses **`llama.rn` 0.13.0-rc.8**, a React Native binding to llama.cpp, for local chat. This matches the marketplace's actual artifact format: individual GGUF files discovered from Hugging Face. The adapter is in `src/lib/local/engine.ts` and implements the engine-neutral contract in `src/lib/local/inference.ts`; download and installed-file management are separate in `src/store/localModels.ts` and `src/lib/local/files.ts`. Model paths preserve repository and file components in a byte-encoded hierarchy, avoiding flattened-name collisions across mobile filesystems. Existing indexed installs retain their original path so saved background-download destinations remain valid. Android targets arm64-v8a and x86_64; the Chromebook release is arm64-v8a. **Automatic** mode checks llama.rn's enumerated backends and each GGUF's `general.file_type` metadata. iOS requests Metal when available. Android OpenCL is attempted only for a reported OpenCL GPU and Q4_0 or Q6_K GGUF; the pinned binding documents Qualcomm Adreno support. Hexagon HTP/NPU is experimental and user-selected, and is attempted only when HTP is reported. Recoverable accelerator initialization errors fall back to CPU, and the app displays the loaded context's reported backend. Context size is reduced for larger model/device-memory combinations. Compatibility remains model-, device-, driver-, and memory-dependent.

The preferred backend is stored as `auto`, `cpu`, `gpu`, or `npu`. Automatic mode does not select experimental HTP; users can request it explicitly. GGUF metadata—not the filename—controls Android OpenCL eligibility. Runtime selection and reporting are covered by `src/lib/local/backend-selector.test.mjs`; hardware execution still needs the physical-device checks in [DEVICE_TESTS.md](DEVICE_TESTS.md). ARM64 only describes the Chromebook's app ABI and cannot establish which GPU/NPU the ChromeOS Android runtime exposes. This llama.rn version does not provide Vulkan or Apple's Neural Engine/Core ML inference for the GGUF path.

Alternatives checked against their official projects:

- [ExecuTorch](https://docs.pytorch.org/executorch/stable/llm/getting-started.html) has Android Java/Kotlin and iOS APIs, but its LLM path expects exported `.pte` artifacts and tokenizer files. Replacing the current engine would require a separate conversion/catalog and would not run the marketplace's arbitrary GGUF downloads directly.
- [LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM) currently has a stable Kotlin API for Android and an early-preview Swift API; its models use `.litertlm` artifacts. It could be added behind a separate provider after adding a React Native bridge and compatible model catalog, but it does not load the app's GGUF downloads directly.
- [WebLLM](https://github.com/mlc-ai/web-llm) runs MLC model artifacts through browser WebGPU. That suits browser deployments with WebGPU, not this app's native iOS/Android GGUF storage and inference path.
- [Transformers.js](https://huggingface.co/docs/transformers.js) uses ONNX Runtime for supported exported models across JavaScript environments, with browser WASM/WebGPU backends. It does not provide a drop-in native React Native GGUF engine for the current catalog.

Keeping llama.cpp avoids format conversion and supports the current mobile targets with the least architectural change. The package is an upstream release candidate, so native CI and representative device tests remain required before treating every accelerator path as verified. See the pinned [`llama.rn` v0.13.0-rc.8 README](https://github.com/mybigday/llama.rn/blob/v0.13.0-rc.8/README.md) for Android OpenCL quantization limits, experimental HTP requirements, supported ABIs, and iOS Metal notes.

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
