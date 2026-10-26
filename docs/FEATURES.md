# What AI Hat can do

[← Back to the README](../README.md)

- **Chat with any OpenAI-compatible server**: vLLM, Ollama, LM Studio, OpenRouter, Groq, [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) or your own. Replies stream in; add as many endpoints as you like and switch per chat.
- **Slash commands**: type `/` for 50+ commands, and add your own. [`/image`](#slash-commands) has the chat model write a detailed image prompt and then draws it.
- **Images**: your endpoint's `/v1/images/generations`, ComfyUI or AUTOMATIC1111. Choose the model, aspect ratio and count from the chat box.
- **Voice**: tap the mic for a small bar above the message box (no full screen): a red dot, a timer, a level meter and, when the phone's own speech service does the listening, **your words as you speak**. Or dictate through your own Whisper-style endpoint. Optional translation. Replies can be read aloud with pause and stop.
- **Skill scripts** (optional): skills that come with Python or Node scripts can run them to make Word, Excel, PowerPoint and PDF files. On a phone they run offline in a sandbox after a one-time 36 MB download you agree to (no internet, only the chat's files); on a computer, with its own Python and Node. The app asks before each run. Details: [SKILL_EXEC_RESULTS.md](../SKILL_EXEC_RESULTS.md).
- **Web search** with sources: SearXNG, Brave, Tavily, or your endpoint's `/v1/search`. Models with tool calling can search by themselves.
- **Files**: text, Markdown, CSV and code, plus **PDF, Word, PowerPoint and Excel**, read on the phone. Long files are searched by meaning instead of sent whole (needs an embeddings endpoint).
- **Generative UI**: ask for a checklist, form or dashboard and get an interactive one in the chat, drawn with the app's own components ([json-render](https://json-render.dev)).
- **Marketplace**: browse and add **skills** (from the companies that publish them themselves, such as Vercel, Cloudflare, Stripe and Supabase; from claude-plugins.dev, skills.sh or any public GitHub repository) and **MCP servers** (from the official MCP registry), after reading what you're adding. Skills keep their reference files, which the assistant can open; downloads from websites are checked against the checksum the site publishes.
- **Skills and MCP as commands**: every skill and every MCP server is also a slash command (`/pdf fill in this form`, `/github list my open pull requests`). Skills marked Automatic are listed to the model and opened only when a task matches, so many skills cost little.
- **Tools**: system prompt library with variables, skills, and MCP servers with a per-tool Auto / Ask / Off setting. Servers are hosted ones reached over the internet: paste a token or **sign in with your browser**. Tools that run code or change things ask first.
- **Reasoning effort** (`low` to `high`), temperature and other model settings, per chat.
- **Always shows what it's doing**: a small activity box names the current step (searching the web, reading a file, improving your prompt, drawing, running a tool) with a timer and the query or prompt behind it.
- **Reply-ready notifications**: get a notification when a reply or image finishes while you're in another app or another chat. Switch it off in Settings › Chat defaults.
- **Yours to keep**: chats are stored on your device in SQLite, API keys in the OS keystore or keychain (never backed up), JSON backup and restore, optional app lock with Face ID or fingerprint on phones.
- **Phone, tablet and computer**: the layout follows the window. Tablets get an icon rail with a menu that slides over, two-pane settings and dialogs instead of bottom sheets; computers get the full side menu, a sources panel beside the chat, ⌘K / Ctrl+K search for everything, keyboard shortcuts and drag-and-drop files.
- **Looks**: dark by default, light theme, six accent colours, text size, button shape, and haptics tuned for iPhone and Android.

## Setting up

1. **Open the app → Add an endpoint.** Pick a preset (or Custom), enter the base URL **including `/v1`**, add a key if the server needs one, and tap *Test & add*. The model list is fetched automatically.
   A server running on the phone itself (for example in Termux on Android) can use plain `http://127.0.0.1:…`. Use `https://` for anything over the internet.
2. **Start chatting.** Tap the model name at the top to switch models.
3. **Try a command.** Type `/` and look around, or try `/image a cozy cabin in snow`.

## Use a different server for each feature

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

## On tablets and computers

The app follows the width of its window, the same way on an iPad, an Android tablet, a foldable or a desktop window:

| | Phone (under 700 px) | Tablet (700–1099 px) | Computer (1100 px and up) |
|---|---|---|---|
| Menu | Drawer | 64 px icon rail; the full menu slides over | Side menu, foldable to the rail (⌘B / Ctrl+B) |
| Model, prompt, tools, + menu | Bottom sheets | Centred dialogs; the model picker opens under its button | Same, plus ⌘K / Ctrl+K to search chats, commands and settings |
| Chat | Full width | 760 px column | 760 px column; sources in a side panel from 1280 px |
| Settings | A list, then a page | Sections beside the page | Sections, list and detail side by side (Providers) |

Phones stay upright; tablets turn freely.

## Files it can read

Plain text, Markdown, CSV, JSON, code, **PDF**, **Word (.docx)**, **PowerPoint (.pptx)** and **Excel (.xlsx)**. **Scanned PDFs** (pictures of pages) are sent as page pictures, so pick a model marked **Vision** to read them (up to 20 pages; black-and-white fax-style scans can't be converted yet). Password-protected files can't be read. The app tells you why instead of silently dropping a file.
