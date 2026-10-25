<div align="center">

<img src="assets/images/icon.png" alt="AI Hat icon" width="112">

# AI Hat

**A dark-first mobile chat app for any OpenAI-compatible endpoint.**
Chat, draw images, talk, search the web, read PDFs and build small UIs, all from servers you choose.

[![Beta](https://img.shields.io/badge/status-beta-orange)](#known-limitations-beta)
[![Latest release](https://img.shields.io/github/v/release/aman-mohammed-max/aihat?include_prereleases&label=release)](https://github.com/aman-mohammed-max/aihat/releases)
[![Downloads](https://img.shields.io/github/downloads/aman-mohammed-max/aihat/total?label=downloads)](https://github.com/aman-mohammed-max/aihat/releases)
![Android and iOS](https://img.shields.io/badge/platform-Android%20%7C%20iOS-lightgrey)
![Expo SDK 58](https://img.shields.io/badge/Expo-SDK%2058-000020)
[![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**Download**](#download) · [Quick start](#quick-start) · [Commands](#slash-commands) · [Build it yourself](#build-the-apps-yourself) · [Report a bug](https://github.com/aman-mohammed-max/aihat/issues/new?template=bug_report.md)

</div>

> **⚠️ This is a beta.** It works, but expect rough edges, and some things are not built yet (see [Known limitations](#known-limitations-beta)). It has no account system and no servers of its own. Your messages go only to the endpoints you add.

## Download

Every change to `main` is built automatically and published on the **[Releases page](https://github.com/aman-mohammed-max/aihat/releases)**:

| | Android | iPhone / iPad |
|---|---|---|
| **Latest beta build** (updated on every change) | [**AI-Hat-beta-latest.apk**](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest.apk) | [**AI-Hat-beta-latest-unsigned.ipa**](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-unsigned.ipa) |
| **Numbered releases** (fixed versions) | `AI-Hat-v0.1.0-beta.1.apk` and so on, [on the releases page](https://github.com/aman-mohammed-max/aihat/releases) | `AI-Hat-v0.1.0-beta.1-unsigned.ipa` and so on |

If a link says "not found", the first build hasn't finished yet. Builds take roughly 15 to 40 minutes; follow progress under the repository's **Actions** tab. Every release lists its files with SHA-256 checksums.

**Install on Android:** download the APK on your phone, open it, allow "Install unknown apps" for your browser or Files app, then tap Install. Android may warn that the app isn't from the Play Store. That's expected for a beta distributed here.

**Install on iPhone / iPad:** the IPA is **unsigned**, so it can't be installed by tapping it. Open it with [AltStore](https://altstore.io), [SideStore](https://sidestore.io) or [Sideloadly](https://sideloadly.io), which sign it with your own Apple ID. Apps signed with a free Apple ID expire after 7 days and need re-signing.

Prefer to build it yourself? See [Build the apps yourself](#build-the-apps-yourself).

## What it does

- **Chat with any OpenAI-compatible server**: vLLM, Ollama, LM Studio, OpenRouter, Groq, [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) or your own. Replies stream in; add as many endpoints as you like and switch per chat.
- **Slash commands**: type `/` for 50+ commands, and add your own. [`/image`](#slash-commands) has the chat model write a detailed image prompt and then draws it.
- **Images**: your endpoint's `/v1/images/generations`, ComfyUI or AUTOMATIC1111. Choose the model, aspect ratio and count from the chat box.
- **Voice**: tap the mic for a small bar above the message box (no full screen): a red dot, a timer, a level meter and, when the phone's own speech service does the listening, **your words as you speak**. Or dictate through your own Whisper-style endpoint. Optional translation. Replies can be read aloud with pause and stop.
- **Web search** with sources: SearXNG, Brave, Tavily, or your endpoint's `/v1/search`. Models with tool calling can search by themselves.
- **Files**: text, Markdown, CSV and code, plus **PDF, Word, PowerPoint and Excel**, read on the phone. Long files are searched by meaning instead of sent whole (needs an embeddings endpoint).
- **Generative UI**: ask for a checklist, form or dashboard and get an interactive one in the chat, drawn with the app's own components ([json-render](https://json-render.dev)).
- **Marketplace**: browse and add **skills** (from the companies that publish them themselves, such as Vercel, Cloudflare, Stripe and Supabase; from claude-plugins.dev, skills.sh or any public GitHub repository) and **MCP servers** (from the official MCP registry), after reading what you're adding. Skills keep their reference files, which the assistant can open; downloads from websites are checked against the checksum the site publishes.
- **Skills and MCP as commands**: every skill and every MCP server is also a slash command (`/pdf fill in this form`, `/github list my open pull requests`). Skills marked Automatic are listed to the model and opened only when a task matches, so many skills cost little.
- **Tools**: system prompt library with variables, skills, and MCP servers (HTTP) with a per-tool Auto / Ask / Off setting.
- **Reasoning effort** (`low` to `high`), temperature and other model settings, per chat.
- **Always shows what it's doing**: a small activity box names the current step (searching the web, reading a file, improving your prompt, drawing, running a tool) with a timer and the query or prompt behind it.
- **Reply-ready notifications**: get a notification when a reply or image finishes while you're in another app or another chat. Switch it off in Settings › Chat defaults.
- **Yours to keep**: chats are stored on the phone in SQLite, API keys in the OS keystore (never backed up), JSON backup and restore, optional app lock with Face ID or fingerprint.
- **Looks**: dark by default, light theme, six accent colours, text size, button shape, and haptics tuned for iPhone and Android.

## Screenshots

These are the **design mockups** the app is built from. Real screenshots will replace them.

<table>
<tr>
<td align="center"><img src="handoff/screens/NewChat.png" width="200" alt="New chat"><br><sub>New chat</sub></td>
<td align="center"><img src="handoff/screens/Main.png" width="200" alt="Chat"><br><sub>Chat</sub></td>
<td align="center"><img src="handoff/screens/ModelSheet.png" width="200" alt="Model picker"><br><sub>Model picker</sub></td>
<td align="center"><img src="handoff/screens/GenCard.png" width="200" alt="Generated UI"><br><sub>Generated UI</sub></td>
</tr>
</table>

## Quick start

1. **Open the app → Add an endpoint.** Pick a preset (or Custom), enter the base URL **including `/v1`**, add a key if the server needs one, and tap *Test & add*. The model list is fetched automatically.
   Servers on your own network can use plain `http://` (for example `http://192.168.1.20:11434/v1` for Ollama on your computer); the phone asks permission to reach your local network the first time. Prefer `https://` for anything over the internet.
2. **Start chatting.** Tap the model name at the top to switch models.
3. **Try a command.** Type `/` and look around, or try `/image a cozy cabin in snow`.

### Use a different server for each feature

Images, speech, dictation, file search and web search each have their own **Endpoint** and **Model** rows (Settings → Images, Voice & speech, Web search, Files & documents). By default they follow your default endpoint. Pick another one you added, or add one just for that feature.

| Feature | What the app calls |
|---|---|
| Chat | `POST /v1/chat/completions`, `GET /v1/models` |
| Images | `POST /v1/images/generations` (or ComfyUI / A1111) |
| Read aloud | `POST /v1/audio/speech` |
| Dictation | `POST /v1/audio/transcriptions` and `/translations` |
| File search | `POST /v1/embeddings` |
| Web search | `POST /v1/search` on your endpoint, or SearXNG / Brave / Tavily |

> **Gateways that don't list or label every model** (FreeLLMAPI, for example, may not list its image and audio models): open the feature's **Model** row and choose **Add a custom model**. Tap a common id such as `whisper-large-v3-turbo` or `gemini-2.5-flash-preview-tts`, or type the id your provider shows. Tap **Refresh** any time to fetch new models.

## Slash commands

Type `/` in the chat box, or tap the `/` button. Commands that need text insert themselves; the rest run right away. Once you have skills or MCP servers, the list gets **Skills** and **MCP** filters. Settings → **Commands** lists everything and lets you write your own (a name plus a prompt, with `{input}` for the text after it).

| Command | What it does |
|---|---|
| `/image <idea>` | The chat model writes a detailed image prompt, then the image model draws it. Options: `--model id`, `--ratio 16:9`, `--n 2`, `--raw` (skip the rewrite). |
| `/search <question>` | Search the web, then answer with sources. |
| `/ui <what to build>` | Reply with an interactive UI. |
| `/prompt <description>` | The model writes a new system prompt, saves it, and uses it in this chat. |
| `/effort off\|low\|medium\|high` | How much the model should think. |
| `/model`, `/temp`, `/system`, `/tools` | Change the model, temperature, system prompt or tools. |
| `/new`, `/clear`, `/rename`, `/title`, `/pin`, `/archive`, `/delete` | Manage the chat. |
| `/summarize`, `/translate`, `/explain`, `/tldr`, `/fix`, `/review`, `/proofread`, `/rewrite`, `/plan`, `/brainstorm` | Ready-made prompts. |
| `/copy`, `/read`, `/retry`, `/export`, `/files`, `/voice`, `/refresh` | Work with replies, files and models. |
| `/status`, `/usage`, `/doctor` | Show what this chat is using, tokens and time used, and whether the endpoint answers. |
| `/compact [focus]`, `/fork`, `/resume` | Continue from a summary in a fresh chat, copy the chat into a new one, or reopen an earlier chat. |
| `/theme`, `/feedback` | Switch dark or light, or report a problem. |
| `/market` | Browse and add skills and MCP servers. |
| `/<skill> <what to do>` | Use one of your skills for this message, for example `/pdf merge these two files`. It is loaded in full, even if the skill is set to "When I ask". |
| `/<server> [what to do]` | Turn an MCP server's tools on for this chat and, if you add text, ask. `/<server> off` turns them off. |

Start a message with `//` to send a real slash.

## Files it can read

Plain text, Markdown, CSV, JSON, code, **PDF**, **Word (.docx)**, **PowerPoint (.pptx)** and **Excel (.xlsx)**. Scanned PDFs (pictures of pages) and password-protected files can't be read. The app tells you why instead of silently dropping them.

## Privacy

There is no account, no analytics and no server of ours. Messages, images and files go only to the endpoints **you** add. The exceptions are things you ask for: **dictation with the phone's speech service** sends your voice to Apple or Google unless you turn on "Only on this phone" (or dictate with your own endpoint), and the **marketplace** talks to registry.modelcontextprotocol.io, claude-plugins.dev, skills.sh and GitHub when you open it. API keys and tokens are kept in the phone's secure keystore and are never written to backups. If you use a cloud endpoint, your messages go to that company, so choose accordingly.

## Known limitations (beta)

- **iOS builds are unsigned**, so they need AltStore, SideStore or Sideloadly.
- **Developed and tested mainly on iPhone.** The Android build is newer and has had less testing.
- **No on-device language models.** Live-text dictation uses the phone's speech service (Apple on iPhone, Google on Android), which is a native module that **Expo Go doesn't include**: in Expo Go the mic uses your transcription endpoint instead. It is untested on real phones so far; please report problems.
- **Skill scripts are never run on the phone.** The text files that come with a skill (references, templates, scripts) are stored and the assistant can read them, but Python and shell scripts don't execute. With a code-running MCP server connected (through the computer bridge below), the assistant can pass a script to it. Skills and MCP servers are written by other people: read before you add.
- **skills.sh has no public API for apps.** Its documented API needs a Vercel server token, so the app uses the search endpoint its own command line tool uses, which may change. The other sources (company websites, GitHub, claude-plugins.dev) keep working if it does.
- **Browser sign-in for MCP servers** works with servers that let apps register themselves (Notion, Linear, Sentry, Vercel, Stripe, Supabase, Figma, Canva, PayPal and others). Servers that don't (GitHub's, Asana's) need an access token. This has been tested against a stand-in sign-in service and the real servers' sign-in descriptions, not yet with a real login on a phone.
- **MCP servers that run on a computer** can't start on a phone. AI Hat writes the command that runs one on your computer behind a small bridge ([supergateway](https://github.com/supercorp-ai/supergateway), needs Node.js) and then connects to it over your network. Works on the same Wi-Fi or a network such as Tailscale.
- **MCP connectors use access tokens**, not browser sign-in (OAuth isn't built). Backups are a JSON file you share yourself; Google Drive and iCloud backup aren't built.
- **Scanned PDFs need OCR**, which isn't built. PDFs whose fonts have no text map may come out with missing characters.
- **`POST /v1/search`**: there is no published schema for it, so the app sends common field names and reads several reply shapes. If your server uses something different, please open an issue with a sample reply.
- **Notifications only arrive while the app is still running.** iPhone pauses apps shortly after you leave them, so a very long reply may not notify. Android is more forgiving but battery savers can also stop it.
- Not available on the web.

## Build the apps yourself

You don't need a Mac or Android Studio: GitHub builds both (free on a public repository), using the **Build & Release** workflow.

| You do this | What happens |
|---|---|
| **Push to `main`** | Both apps are built and the **latest beta build** pre-release is replaced with the new files. (Changes that only touch docs or the design files don't start a build.) |
| **Push a version tag** | Both apps are built and a **permanent release** is created for that version. |
| **Actions → Build & Release → Run workflow** | The same, started by hand. Type a version to make a numbered release, or leave it empty to refresh the latest beta build. |

To make a numbered release:

```bash
git tag v0.1.0-beta.2
git push origin v0.1.0-beta.2
```

A tag with a hyphen (`-beta.2`, `-rc.1`) is published as a **pre-release**; a plain tag like `v1.0.0` is a normal release. If one platform fails, the other is still published. You can also run **Android APK** or **iOS IPA** alone from the Actions tab to get just one file as a downloadable artifact.

## Run it from source

You need Node 22.

```bash
git clone https://github.com/aman-mohammed-max/aihat.git
cd aihat
npm install
npx expo start -c        # scan the QR code with Expo Go
```

Before sending changes: `npx tsc --noEmit` and `npx expo lint` (the **Check** workflow runs both).

**Troubleshooting**
- `AggregateError [ETIMEDOUT]` with `--tunnel`: your network can't reach Expo's tunnel service. Try `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" npx expo start --tunnel`, or skip the tunnel and use the same Wi-Fi.
- On a Chromebook (Linux container), forward TCP port 8081 in ChromeOS settings and run `REACT_NATIVE_PACKAGER_HOSTNAME=<your Wi-Fi IP> npx expo start`.

## Project layout

```
src/app          screens and routes (Expo Router)
src/components   shared UI: header, composer, sheets, command palette…
src/store        app state (Zustand) and the SQLite data
src/api          OpenAI-compatible and MCP clients, image engines
src/lib          commands, PDF / Office readers, search, speech, titles
src/genui        generative UI (json-render catalog, renderer, parser)
handoff          the design mockups and spec the app follows
.github          build, release and check workflows
```

## Contributing

Bug reports and ideas are welcome: [open an issue](https://github.com/aman-mohammed-max/aihat/issues/new?template=bug_report.md). Include the app version (Settings → About), your phone, and which endpoint and model you used. Never paste API keys. Pull requests are checked by the **Check** workflow.

## License

[MIT](LICENSE). Built with [Expo](https://expo.dev), React Native, [json-render](https://json-render.dev) and [fflate](https://github.com/101arrowz/fflate).
