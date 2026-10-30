# Device validation procedure

[← Back to the limitations and validation status](LIMITATIONS.md)

Run these checks against an APK or IPA built from the same commit being validated. Expo Go does not contain the native modules used for local models and Phonon. Record the app version, device model, OS version, CPU ABI, total RAM, and free storage with each result. Do not use a personal model archive as a test fixture.

## Android: GGUF download and install

1. Install the arm64 or x86_64 APK from the Android APK workflow artifact.
2. In **Marketplace → Models**, choose a small single-file GGUF and download it. Confirm that progress and byte counts advance, then verify that it appears under **My Models** and can be removed.
3. Repeat while pausing and resuming. Cancel another transfer and confirm that it disappears from the queue and does not become an installed model.
4. Start a download, background the app, and reopen it. Then repeat while force-stopping the app. A completed `.part` file should be verified on relaunch; an incomplete active transfer should be retryable from the beginning. An explicitly paused transfer should remain resumable when its saved native task state is available.
5. Update an installed model and confirm that the old file remains available until the verified replacement is committed.

## Android: Phonon archive extraction

Phonon-2 is the Android path that unpacks the publisher's Zstandard-compressed tar archive; a GGUF download is a single file and is not extracted.

1. On a supported 64-bit ARM device, open **Settings → Voice & speech** and download Phonon-2 over a stable connection. Record available storage before starting.
2. Confirm that the UI reports extraction progress after the download. Cancel during extraction; verify that the downloaded archive remains and that no partial model is offered as ready.
3. Retry and let extraction finish. Confirm that the model becomes ready, can transcribe a short English recording, and can be removed.
4. On a disposable test installation, force-stop the app during extraction, reopen it, and retry. Confirm that stale staging files are replaced and the original archive remains until verification and promotion succeed.
5. To investigate a crash, reopen the app and use **Copy details** in the “closed unexpectedly” alert. Also capture the Android exit reason and filtered logs from the host:

   ```sh
   adb shell dumpsys activity exit-info com.amanm.aihat
   adb logcat -d -v threadtime | rg -i 'com\.amanm\.aihat|phonon|zstd|Fatal signal|OutOfMemory'
   ```

   Include the exit reason, stack or tombstone strings, device memory, free storage, and the exact action immediately before the failure. Do not infer an extraction crash from a generic process exit.

## iOS: model download and inference

1. Install an AI Hat build containing the native modules. Use the iOS simulator build for compile checks and a signed device build for hardware tests.
2. Download a small GGUF, then pause/resume, cancel, background/foreground, and relaunch during a second transfer. Confirm that the installed file passes size, GGUF magic, and publisher checksum checks where available.
3. Load and unload the model, stream a response, stop generation, and repeat with a larger model under memory pressure. Confirm that a rejected preflight leaves the app usable.
4. Test Phonon-2 download, validation, load, transcription, background release, and removal on iOS 18 or later.

## Marketplace and regression checks

1. From the side drawer, open Marketplace and visit Models, Skills, MCP, and Extensions on a phone-sized display.
2. Install, enable, disable, and remove a skill; configure and disconnect a hosted MCP server; confirm that secret values remain masked and absent from logs.
3. Check loading, empty, error, and offline states, and verify that returning from each install flow lands on a valid route.

For each check, record **PASS**, **FAIL**, or **NOT RUN**, attach the app version and relevant evidence, and do not mark a source-only or simulator-build result as a physical-device pass.
