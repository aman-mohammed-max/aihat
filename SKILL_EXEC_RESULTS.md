# Running skill scripts: results

Skills can come with Python and Node scripts (for example to make a Word, Excel, PowerPoint or PDF file). This is
the proof of concept for running them: what was built, what was measured, what works, and what doesn't.

**Status:** all checks pass in Chromium (the engine of Android's WebView), in WebKit (the engine of the iPhone's
web view) and on a computer. CI runs them on every push. **Not yet tried on a real phone.** The first real test is
the checklist at the end of this file.

## How it works

One interface (`src/skill-exec/types.ts`, `SkillExecutor`) with two backends, picked by platform:

| | Phone (Android, iPhone) | Computer (Windows, macOS, Linux) |
|---|---|---|
| Runs | Python 3.14 in WebAssembly ([Pyodide](https://pyodide.org) 314.0.7) and a small Node-style runner, in a hidden WebView | The computer's own Python and Node (or the Bun inside AI Hat when Node isn't installed) |
| Where | A Web Worker in a 1×1 transparent WebView kept alive at the app's root | A fresh temporary folder, deleted after each run |
| Internet | None: the page's Content-Security-Policy plus a worker that removes fetch, XMLHttpRequest and WebSocket | Like any program on the computer |
| Shell | A built-in one: `python3`, `node`, `ls cat cp mv rm mkdir echo head tail grep wc find`, `&& \|\| ; \| > >> 2>&1`, `pip install` (bundled packages only) | The system shell (`sh`; `cmd` on Windows) |
| Setup | One-time download of 35.9 MB after the user agrees | Nothing to download |
| Code | `runtime.tsx`, `engine/` | `runtime.web.tsx`, `desktop/src/bun/exec.ts` |

**Expo Go:** it works without a development build or a local server. It only uses `react-native-webview`,
`expo-file-system` and `expo-crypto`, which Expo Go includes. The add-on is downloaded with the user's consent, each
file is checked against its pinned SHA-256, and then it is copied once into the WebView's own storage (IndexedDB).
The worker reads files from there through an in-page `fetch`, so nothing loads from `file://` and no server runs.

The model gets one tool, `execute(command, skill?)`. The chat's attached files go into `/work`, the skill's files go into
`/skills/<name>`, and new or changed files come back as attachments in the reply. If the setting is on (it is by default),
the app asks before each run ("Run this command?"). Stopping the reply also stops the script.

## What was tested, and where

Fourteen self-tests (`src/skill-exec/selftests.json`) run in four places, all in CI on every push:
- in Node with the real Pyodide (`scripts/skill-runtime-test.mjs`);
- in Chromium (Linux) and WebKit (macOS) with the real hidden page and worker (`scripts/skill-runtime-browser-test.mjs`);
- with the desktop runner (`desktop/test/exec.test.ts`).

The timings below come from Chromium on a small ARM laptop. WebKit passes every check too; GitHub doesn't show its
timings without signing in.

| Test | Node + Pyodide | Chromium (Android's engine) | Computer |
|---|---|---|---|
| Python starts | ✅ 0.9 s | ✅ 1.1 s | ✅ |
| Word file (python-docx) | ✅ 1.3 s | ✅ 1.4 s | ✅ |
| Excel file with a formula (openpyxl) | ✅ 1.1 s | ✅ 1.2 s | ✅ |
| Merge PDFs (pypdf) | ✅ 1.2 s | ✅ 1.4 s | ✅ |
| PowerPoint with Node (pptxgenjs) | ✅ 0.1 s | ✅ 0.2 s | ✅ (Bun) |
| lxml + numpy | ✅ 1.7 s | ✅ 1.8 s | needs them installed |
| Runaway script stopped (3 s limit → exit 124) | needs the sandbox | ✅ 3.0 s, next run works | ✅ |
| No internet for scripts | needs the sandbox | ✅ refused, **0 requests left the page** | not sandboxed |
| pandas | ✅ 6.2 s (first load) | ✅ 8.5 s (first load) | needs it installed |
| PowerPoint with python-pptx | ✅ 1.5 s | ✅ 2.1 s | needs it installed |
| PDF text (pdfplumber) | ✅ 1.8 s | ✅ 3.8 s | needs it installed |
| Word with Node (docx) | ✅ 0.2 s | ✅ 0.3 s | — |
| A script calling `python3` and `soffice` through subprocess | ✅ | ✅ | ✅ |
| Shell basics, and a clear message for a missing program (exit 127) | ✅ | ✅ | ✅ |

Times are from a small ARM laptop. A phone may be 1 to 3 times slower.

| Start-up (Chromium) | |
|---|---|
| Copying the add-on into the WebView (first time only) | 8.2 s |
| Python cold start | 5.2 s |
| A script once Python is running | 0.1 to 2 s (pandas the first time: about 8 s) |

## Size

| | |
|---|---|
| Added to the app download (APK, IPA) | about 75 KB (the runner page and code). `react-native-webview` is already in Expo. |
| One-time download, if the user turns it on | 35.9 MB (Pyodide core 12.9 MB, Python packages 20.5 MB, Node libraries 2.2 MB) |
| Space on the phone | about 72 MB: the downloaded files (36 MB) plus their copy inside the WebView (36 MB). The first copy lets the app refill the WebView without downloading again, because iOS may clear WebView storage when space is low. |

## What works on a phone

- Word, Excel and PowerPoint: python-docx, openpyxl, XlsxWriter, python-pptx, and for Node scripts pptxgenjs and docx.
- PDFs: merging, splitting and rotating with pypdf, and reading text and tables with pdfplumber and pdfminer.six.
- Data: pandas and numpy. Pictures: Pillow.
- Scripts that run other Python scripts through `subprocess` (they run inside the same sandbox).

## What doesn't (limits of phones)

- LibreOffice (`soffice`): converting to PDF and recalculating formulas. Anthropic's docx, xlsx and pptx skills use it
  for those optional steps. The model is told and makes the file without them.
- pandoc, ffmpeg, ImageMagick, Poppler (PDF pages to images), tesseract, git, a web browser (Playwright).
- `pdfplumber`'s `page.to_image()`: it needs a native PDF renderer that isn't available for Pyodide.
- Installing packages (`pip install` and `npm install` of anything that isn't bundled), and internet access from scripts.
- Node is a shim, not real Node: `fs`, `path`, `os`, `buffer` and `util` work, and so do the three bundled libraries.
  `child_process`, `http`, native modules (sharp) and npm packages don't.
- One script at a time, up to 60 s each.

The Skills › Run skill scripts page checks the user's own skills and shows how many can run fully ("72% of your skills
with scripts…"), with the reason for each one that can only partly run.

## Known problems and risks

1. **Not run on a real phone yet.** Both phone engines pass every check in CI: Chromium (Android's WebView) and
   WebKit (iOS). The WebKit check found one real problem, now fixed: WebKit checks the page's `child-src` rule before
   starting a worker, and it was closed. A web engine that can't `import()` a module inside a worker now loads
   Python's core as a classic script instead; that path passes all checks too. The app inside WKWebView on a real
   iPhone may still differ from desktop WebKit in memory limits and background behaviour.
2. iOS may close the WebView in the background. The app restarts it when it comes back, and the next script waits for
   Python to start again.
3. **App Store review.** The scripts run inside Apple's WebKit, which guideline 2.5.2 allows. Running downloaded
   skills' code is still something a reviewer could question. The add-on is off by default, explained in plain
   words, and the app asks before each run, which helps. Google Play allows code that runs inside a WebView.
4. **Computer:** scripts run as the user with full access, so "Ask before each run" matters there. macOS has no real
   Python unless the user installs one; the page says so.
5. The 72 MB on the phone could drop to 36 MB by deleting the downloaded copy after it is inside the WebView. The cost
   is a new download if iOS clears that storage.

## Try it on a phone, offline

On Android, in Expo Go or with the APK from the Releases page:

1. Open AI Hat, go to **Skills › Run skill scripts**, and turn it on. Read the prompt and tap **Download (36 MB)**.
   Wait for "On".
2. Tap **Run the checks** once while online, so the first copy into the sandbox finishes.
3. Turn on **airplane mode**, close AI Hat completely, and open it again.
4. Go to **Skills › Run skill scripts** and tap **Run the checks**. Every check should pass, including "No internet for
   scripts". Note the "Python started in … s" line (cold start) and each check's time.
5. Tap **Open report.docx**, **Open sales.xlsx**, **Open merged.pdf** and **Open deck.pptx** to see the files.
6. In a chat with a skill that has scripts (for example Anthropic's `docx` skill from the marketplace), ask for a Word
   document. You'll see **Run this command?**, then the file appears in the reply.

On an iPhone: the same steps in Expo Go. If it says "could not load Python", note the message; that is the WebKit
risk above.

## Updating the add-on

`node scripts/skill-runtime-manifest.mjs <cacheDir>` pins every file (versions and SHA-256) into
`src/skill-exec/runtime.json`. `node scripts/skill-runtime-test.mjs <cacheDir>` runs the self-tests. After editing the
engine, run `node scripts/embed-skill-engine.mjs`. CI checks all three on every push.
