# Project: AI chat client (React Native)

## Design
- The design lives in `screens/` (a PNG of every screen — look at these) and `design/` (the HTML source of each, 390×844). Read `DESIGN.md` for tokens, components and flows, and `SCREENS.md` for every screen → route → what each tap opens.
- Match the mockups closely: spacing, sizes, colours and copy. Don't invent new colours; use the tokens in `src/theme`.
- Build shared components first (Header, Composer, SearchBar, Toggle, ListRow, Segmented, Chip, BottomSheet, Dialog) and use them on every screen. No one-off headers or switches.
- Dark theme is the default; support System / Light / Dark and a user-chosen accent colour.

## Stack
- Expo (latest SDK) + TypeScript + Expo Router.
- State: Zustand. Storage: SQLite (expo-sqlite) for chats; expo-secure-store for API keys.
- Bottom sheets: @gorhom/bottom-sheet. Drawer: expo-router drawer.
- Generative UI: `@json-render/core` + `@json-render/react-native`, with our own components registered so they follow the theme.
- Networking: fetch with SSE streaming to OpenAI-compatible endpoints (`/models`, `/chat/completions`, `/audio/*`, `/images/generations`, `/embeddings`).

## Rules
- Every tappable element must navigate or act as `SCREENS.md` says.
- Touch targets ≥ 44px; every icon-only button has an accessibilityLabel.
- Never log or back up API keys.
