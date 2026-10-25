# AI Chat Client — design spec

A minimal, dark-first mobile chat client (Claude / ChatGPT style) for **any OpenAI-compatible endpoint**, with system-prompt library, skills, MCP servers, connectors, file upload, web search, image upload/generation, voice (STT + translation + TTS) and generative UI (json-render).

Look at `screens/<Name>.png` for how each screen looks and `design/<Name>.dc.html` for exact sizes, colours and copy; `SCREENS.md` lists every screen, its route and where its taps go.

> Note: `design/*.dc.html` use a design-tool runtime (`support.js`, `<x-dc>`, `{{holes}}`, `<dc-import>`). Treat them as **visual + structural reference**, not code to ship. `{{accent}}` = the accent token below.

---

## 1. Tokens

### Colour (dark theme — default)
| Token | Value | Use |
|---|---|---|
| `bg` | `#0E0F11` | App background |
| `bgDeep` | `#08090A` | Behind side drawer |
| `surface` | `#17191C` | Cards, sheets, inputs, search bar, composer |
| `surface2` | `#22252A` | User bubble, chips, icon tiles |
| `selected` | `#2E3238` | Selected segment |
| `hairline` | `#1E2125` | List dividers |
| `border` | `#2C3036` | Outline buttons, chips, inputs |
| `text` | `#ECEDEF` | Primary text |
| `text2` | `#C9CCD1` | Secondary text |
| `muted` | `#9BA0A8` | Labels, meta, section titles |
| `faint` | `#6F747C` | Chevrons |
| `accent` | `#C6F46B` (user-selectable) | Primary buttons, switches on, active dots, links in headers |
| `onAccent` | `#0E0F11` | Text/icons on accent |
| `warn` | `#FDBA74` | Offline, needs sign-in, “writes data” |
| `danger` | `#F2A2A2` | Delete, rejected key |
| `scrim` | `rgba(0,0,0,0.6)` | Behind sheets / dialogs |

Accent options (Appearance screen): `#C6F46B` lime, `#7DD3FC` sky, `#FDBA74` peach, `#C4B5FD` lilac, `#F9A8D4` rose, `#ECEDEF` snow.

### Light theme
`bg #FFFFFF`, `surface #F4F4F5`, `surface2 #F2F2F3`, `border #E4E4E7`, `text #17181A`, `muted #5E636B`. Theme setting: **System / Light / Dark** (System follows the OS).

### Type
- UI: **Geist** 400/500/600 (fallback system). Mono: **Geist Mono** (model names, URLs, tokens, code).
- Sizes: screen title 16/600 · large heading 26–30/600 · body 15 · list label 15 · meta 12–13 · section title 12/500 `muted` · mono meta 11.5–13.
- Text size setting scales body: Small 13 · Default 14.5–15 · Large 16.5.

### Shape & spacing
- Screen side padding **16**. Row min-height **44–50**. Section gap **16–22**.
- Radii: inputs/search **12**, cards **16**, bubbles **18**, sheets **28 top**, dialogs **24**, composer **24**, primary buttons **pill (height/2)**.
- Button shape setting: Pill / Rounded (9) / Square (3).
- Touch targets ≥ 44×44. Icons: 1.8px stroke line icons, 17–22px.

---

## 2. Shared components (build these first)

| Component | Source | Props / behaviour |
|---|---|---|
| **Header** | `design/Header.dc.html` | `left`: menu \| back \| close \| cancel \| none · `title`, `sub` (sub shows an accent dot when the title is tappable) · `titleHref` → title becomes a button with ⌄ (opens Model picker) · `right`: new \| more \| both \| add \| text \| none · top padding 50 (safe area). |
| **Composer** | `design/Composer.dc.html` | Rounded `surface` box: optional attached-file chips (ext tile, name, meta/progress, ×) · text input · row: **+** (Add menu), **sliders** (Tools sheet), mode chips **Search** / **Image** (tap to turn off), spacer, **mic** (Voice), **send** (accent circle). |
| **SearchBar** | `design/SearchBar.dc.html` | 44 high, `surface`, search icon, input, optional right hint (“8 results”). |
| **Toggle** | `design/Toggle.dc.html` | 44×26 switch. On = accent track + dark knob; off = `border` track + `muted` knob. |
| **ListRow** | (pattern) | icon 19 `muted` · label 15 · value 13 `muted` · chevron 16 `faint`. Toggle rows swap value+chevron for Toggle. |
| **SectionTitle** | (pattern) | 12/500 `muted`, 4px left inset. |
| **Segmented** | (pattern) | `surface` track r12 p4, equal columns, selected = `selected` bg + `text`. |
| **Chip** | (pattern) | 32 high pill; selected = `text` bg / `bg` text; else `border` outline. |
| **BottomSheet** | (pattern) | Scrim over current screen, `surface` sheet r28 top, 36×5 grabber, title row with accent **Done**, optional SearchBar, footer with two outline buttons. Close: Done, tap scrim, swipe down. |
| **Dialog** | `DeleteChat`, `Rename` | Centered `surface` r24 card, two-button footer. |
| **MessageActions** | in chats | copy · read aloud · regenerate · ⋯ (opens Message actions) · right: `tok · s` in mono. |
| **ToolChip** | in chats | 28 high `surface` pill showing skill / MCP tool used; tap → detail. |

---

## 3. Navigation (React Native + Expo Router suggested)

- **Drawer** (Side menu) wraps chat screens. Header ☰ opens it; tapping outside closes.
- **Stack** for Settings / Library / Providers pages (back arrow).
- **Modal routes** (`presentation: 'formSheet'` / bottom sheet) for every `*Sheet`, Chat options, Picker; **transparent modal** for dialogs.
- Full map: `SCREENS.md` + `design/Map.dc.html`.

Key flows:
1. **First run** → Welcome → Add endpoint (presets: vLLM, Ollama, LM Studio, OpenRouter, Groq, Custom) → test → choose models → New chat.
2. **Chat**: title → Model picker (grouped by provider, status, capability tags) · prompt pill → System prompt picker · ⋯ → Chat options (rename, pin, prompt, model settings, tools, export, delete).
3. **Composer**: + → Add menu (camera, photos, files, Drive, iCloud, web search, create image, link) · sliders → Tools for this chat · mic → Voice.
4. **Errors**: endpoint timeout / 401 → inline error card (Retry · Switch model · Endpoint) + banner with Fix → Provider detail.
5. **Generative UI**: reply contains a json-render spec → render inline; actions that write data → “Allow this action?” sheet.

---

## 4. Data model (minimum)

- `Provider { id, name, baseUrl, apiKeyRef, headers, timeoutMs, isDefault, status, latencyMs }`
- `Model { id, providerId, name, enabled, caps: {tools, vision, embeddings, contextK, structuredOutput|jsonMode|promptOnly}, defaults: Params }`
- `Params { temperature, maxTokens, topP, reasoning: off|low|high, stream }`
- `SystemPrompt { id, name, body, tags[], favorite, preferredModelId?, toolIds[], variables[] }` — variables `{date} {language} {model}` + custom.
- `Skill { id, name, description, version, source, files[], mode: auto|always|onAsk, enabled, canRunScripts }`
- `McpServer { id, name, url, transport: http|sse, auth: none|token|oauth, tools: [{name, kind: read|write|delete, policy: auto|ask|off}], enabledByDefault }`
- `Connector` = preset McpServer with OAuth + scopes.
- `Chat { id, title, pinned, modelId, promptId?, params, toolIds[], searchMode, createdAt }`
- `Message { id, chatId, role, content, attachments[], toolCalls[], citations[], uiSpec?, usage {tokens, ms} }`
- Settings: appearance, chat defaults, audio (STT engine: device | endpoint | system; translate; TTS engine/voice), images (engine ComfyUI | OpenAI | A1111, url, model, workflow, aspect, count), web search (mode, engine SearXNG | Brave | Tavily, results, fullPages, safe, blocklist), files (whole | RAG, embedding model, chunk size, top-k, OCR, max size), backup (Drive | iCloud, include flags, schedule), privacy (app lock, hide in switcher, cloud warning).

API keys live in the OS keystore (expo-secure-store), never in backups.

## 5. OpenAI-compatible calls
`GET {base}/models` · `POST {base}/chat/completions` (stream SSE, tools) · `POST {base}/audio/transcriptions` · `POST {base}/audio/speech` · `POST {base}/images/generations` · `POST {base}/embeddings`.
