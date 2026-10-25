# Prompts to paste into Claude Code

## 1. Start (run in the project folder after copying this handoff in)

Read CLAUDE.md, DESIGN.md and SCREENS.md, and look at the images in screens/. Then:
1. Scaffold an Expo + TypeScript + Expo Router app in this folder.
2. Create src/theme with every token from DESIGN.md (dark + light, accent options).
3. Build the shared components (Header, Composer, SearchBar, Toggle, ListRow, Segmented, Chip, BottomSheet, Dialog) to match screens/Header.png, Composer.png, SearchBar.png, Toggle.png (sizes and colours in the matching design/*.dc.html).
4. Make a /dev/components screen that shows them all so I can check them.
Plan first, show me the plan, then build. Don't build the other screens yet.

## 2. Screens, one area at a time

Build the Chat area from SCREENS.md (Welcome, NewChat, Main, Sidebar, SearchChats, DeleteChat, every *Sheet, ChatMenu, Rename, Picker) using only the shared components. Match each screens/*.png image (exact values in design/*.dc.html). Wire every tap to the route SCREENS.md lists. Use mock data for now.

(Repeat for: Prompts/Skills/MCP/Connectors → Providers → Settings → Generative UI.)

## 3. Make it real

Replace mock data: providers + model list from `GET {baseUrl}/models`, streaming chat via `/chat/completions` (SSE, tool calls), keys in expo-secure-store, chats in SQLite. Then add MCP (HTTP transport), file upload + RAG, web search (SearXNG first), voice (Whisper endpoint), images (ComfyUI), and json-render generative UI.
