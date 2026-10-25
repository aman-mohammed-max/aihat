# Screen inventory

Every screen (picture in `screens/`, source in `design/`), the route it should become, and the screens its taps open (from the links in each file).

| Area | Screen | Image | File | Suggested route | Taps open |
|---|---|---|---|---|---|
| Overview | Navigation map — what every tap opens | `screens/Map.png` | `design/Map.dc.html` | `—` | About, AddMcp, AddProvider, AddSkill, Appearance, AttachSheet, Audio, Backup, ChatDefaults, ChatMenu, Composer, ConnectorAuth, Connectors, DeleteChat, ErrorChat, FileChat, Files, GenAction, GenApp, GenCard, GenCatalog, GenForm, GenSettings, GenSpec, GenStream, ImageViewer, Images, Main, Mcp, McpDetail, MediaChat, MessageSheet, ModelSheet, NewChat, ParamsSheet, Privacy, PromptEdit, PromptSheet, Prompts, ProviderDetail, Providers, SearchChat, SearchChats, Settings, Sidebar, SkillDetail, Skills, SourcesSheet, ToolsSheet, Voice, WebSearch, Welcome |
| Chat | First run · welcome | `screens/Welcome.png` | `design/Welcome.dc.html` | `/welcome` | AddProvider, Backup, NewChat |
| Chat | New chat (empty) | `screens/NewChat.png` | `design/NewChat.dc.html` | `/` | FileChat, MediaChat, ModelSheet, PromptSheet, SearchChat, Sidebar, Voice |
| Chat | Chat | `screens/Main.png` | `design/Main.dc.html` | `/chat/[id]` | ChatMenu, McpDetail, MessageSheet, ModelSheet, NewChat, PromptSheet, Sidebar, SkillDetail |
| Chat | Side menu · history | `screens/Sidebar.png` | `design/Sidebar.dc.html` | `(drawer)` | ChatMenu, Connectors, FileChat, GenApp, Main, Mcp, MediaChat, NewChat, Prompts, SearchChat, SearchChats, Settings, Skills |
| Chat | Search chats | `screens/SearchChats.png` | `design/SearchChats.dc.html` | `/search-chats` | FileChat, Main, Sidebar |
| Chat | Delete chat · confirm | `screens/DeleteChat.png` | `design/DeleteChat.dc.html` | `/(modals)/delete-chat` | ChatMenu, ModelSheet, NewChat, Sidebar |
| Chat | Model picker | `screens/ModelSheet.png` | `design/ModelSheet.dc.html` | `/(modals)/model-sheet` | ErrorChat, Main, NewChat, ParamsSheet, Providers, Sidebar |
| Chat | System prompt picker | `screens/PromptSheet.png` | `design/PromptSheet.dc.html` | `/(modals)/prompt-sheet` | Main, ModelSheet, NewChat, PromptEdit, Prompts, Sidebar |
| Chat | Chat options (⋯) | `screens/ChatMenu.png` | `design/ChatMenu.dc.html` | `/(modals)/chat-menu` | DeleteChat, Main, ModelSheet, NewChat, ParamsSheet, PromptSheet, Rename, Sidebar, ToolsSheet |
| Chat | Model settings for this chat | `screens/ParamsSheet.png` | `design/ParamsSheet.dc.html` | `/(modals)/params-sheet` | Main, ModelSheet, NewChat, Sidebar |
| Chat | Message actions (long-press) | `screens/MessageSheet.png` | `design/MessageSheet.dc.html` | `/(modals)/message-sheet` | Backup, Main, ModelSheet, NewChat, Sidebar, Voice |
| Chat | Tools for this chat | `screens/ToolsSheet.png` | `design/ToolsSheet.dc.html` | `/(modals)/tools-sheet` | Main, Mcp, McpDetail, ModelSheet, NewChat, Sidebar, Skills |
| Chat | Rename chat | `screens/Rename.png` | `design/Rename.dc.html` | `/(modals)/rename` | ChatMenu, Main, ModelSheet, NewChat, Sidebar |
| Chat | Choice picker (any value row) | `screens/Picker.png` | `design/Picker.dc.html` | `/(modals)/picker` | Audio, Settings |
| Chat | Add (+) menu | `screens/AttachSheet.png` | `design/AttachSheet.dc.html` | `/(modals)/attach-sheet` | ConnectorAuth, FileChat, Main, MediaChat, ModelSheet, NewChat, SearchChat, Sidebar |
| Chat | Chat · file upload | `screens/FileChat.png` | `design/FileChat.dc.html` | `/file-chat` | ChatMenu, Files, MessageSheet, ModelSheet, NewChat, Sidebar |
| Chat | Chat · web search | `screens/SearchChat.png` | `design/SearchChat.dc.html` | `/search-chat` | ChatMenu, MessageSheet, ModelSheet, NewChat, Sidebar, SourcesSheet |
| Chat | Web sources | `screens/SourcesSheet.png` | `design/SourcesSheet.dc.html` | `/(modals)/sources-sheet` | ModelSheet, NewChat, SearchChat, Sidebar, WebSearch |
| Chat | Chat · image upload & generation | `screens/MediaChat.png` | `design/MediaChat.dc.html` | `/media-chat` | ChatMenu, ImageViewer, Images, MessageSheet, ModelSheet, NewChat, Sidebar |
| Chat | Image viewer | `screens/ImageViewer.png` | `design/ImageViewer.dc.html` | `/image-viewer` | Backup, MediaChat, MessageSheet |
| Chat | Voice input & translation | `screens/Voice.png` | `design/Voice.dc.html` | `/voice` | Audio, Main |
| Chat | Endpoint offline · error | `screens/ErrorChat.png` | `design/ErrorChat.dc.html` | `/error-chat` | ChatMenu, ModelSheet, NewChat, ProviderDetail, Sidebar |
| Prompts, skills & MCP | System prompts | `screens/Prompts.png` | `design/Prompts.dc.html` | `/prompts` | PromptEdit, Sidebar |
| Prompts, skills & MCP | Edit system prompt | `screens/PromptEdit.png` | `design/PromptEdit.dc.html` | `/prompt-edit` | Main, ModelSheet, Picker, Prompts, ToolsSheet |
| Prompts, skills & MCP | Skills | `screens/Skills.png` | `design/Skills.dc.html` | `/skills` | AddSkill, Sidebar, SkillDetail |
| Prompts, skills & MCP | Skill detail | `screens/SkillDetail.png` | `design/SkillDetail.dc.html` | `/skill-detail` | Skills |
| Prompts, skills & MCP | Add skill | `screens/AddSkill.png` | `design/AddSkill.dc.html` | `/add-skill` | SkillDetail, Skills |
| Prompts, skills & MCP | MCP servers | `screens/Mcp.png` | `design/Mcp.dc.html` | `/mcp` | AddMcp, Connectors, McpDetail, Sidebar |
| Prompts, skills & MCP | MCP server detail | `screens/McpDetail.png` | `design/McpDetail.dc.html` | `/mcp-detail` | AddMcp, ConnectorAuth, GenAction, Mcp, Picker |
| Prompts, skills & MCP | Add MCP server | `screens/AddMcp.png` | `design/AddMcp.dc.html` | `/add-mcp` | Mcp, McpDetail |
| Prompts, skills & MCP | Connectors | `screens/Connectors.png` | `design/Connectors.dc.html` | `/connectors` | AddMcp, ConnectorAuth, McpDetail, Sidebar |
| Prompts, skills & MCP | Connect Google Drive | `screens/ConnectorAuth.png` | `design/ConnectorAuth.dc.html` | `/connector-auth` | Connectors |
| Providers | Providers | `screens/Providers.png` | `design/Providers.dc.html` | `/providers` | AddProvider, ProviderDetail, Settings |
| Providers | Add OpenAI-compatible endpoint | `screens/AddProvider.png` | `design/AddProvider.dc.html` | `/add-provider` | ProviderDetail, Providers |
| Providers | Provider detail | `screens/ProviderDetail.png` | `design/ProviderDetail.dc.html` | `/provider-detail` | ParamsSheet, Providers |
| Settings | Settings | `screens/Settings.png` | `design/Settings.dc.html` | `/settings` | About, Appearance, Audio, Backup, ChatDefaults, Files, GenSettings, Images, Mcp, Privacy, Providers, Sidebar, Skills, WebSearch |
| Settings | Appearance | `screens/Appearance.png` | `design/Appearance.dc.html` | `/appearance` | Settings |
| Settings | Chat defaults | `screens/ChatDefaults.png` | `design/ChatDefaults.dc.html` | `/chat-defaults` | ModelSheet, ParamsSheet, Picker, PromptSheet, Settings, ToolsSheet |
| Settings | Audio · speech & translation | `screens/Audio.png` | `design/Audio.dc.html` | `/audio` | ModelSheet, Picker, Settings |
| Settings | Images | `screens/Images.png` | `design/Images.dc.html` | `/images` | Picker, Settings |
| Settings | Web search | `screens/WebSearch.png` | `design/WebSearch.dc.html` | `/web-search` | Picker, Settings |
| Settings | Files & documents | `screens/Files.png` | `design/Files.dc.html` | `/files` | ModelSheet, Picker, Settings |
| Settings | Sync & backup | `screens/Backup.png` | `design/Backup.dc.html` | `/backup` | ConnectorAuth, Connectors, Picker, Settings |
| Settings | Privacy & API keys | `screens/Privacy.png` | `design/Privacy.dc.html` | `/privacy` | McpDetail, ProviderDetail, Settings, Welcome |
| Settings | About | `screens/About.png` | `design/About.dc.html` | `/about` | Settings, Welcome |
| Generative UI | Interactive card | `screens/GenCard.png` | `design/GenCard.dc.html` | `/gen-card` | ChatMenu, GenSpec, ModelSheet, NewChat, Sidebar |
| Generative UI | Generated form | `screens/GenForm.png` | `design/GenForm.dc.html` | `/gen-form` | ChatMenu, McpDetail, ModelSheet, NewChat, Sidebar |
| Generative UI | Streaming in | `screens/GenStream.png` | `design/GenStream.dc.html` | `/gen-stream` | ChatMenu, ModelSheet, NewChat, Sidebar |
| Generative UI | Action approval | `screens/GenAction.png` | `design/GenAction.dc.html` | `/(modals)/gen-action` | ModelSheet, NewChat, Sidebar |
| Generative UI | Full-screen mini app | `screens/GenApp.png` | `design/GenApp.dc.html` | `/gen-app` | GenSpec, Sidebar |
| Generative UI | Spec inspector (dev) | `screens/GenSpec.png` | `design/GenSpec.dc.html` | `/gen-spec` | GenCard |
| Generative UI | Component catalog | `screens/GenCatalog.png` | `design/GenCatalog.dc.html` | `/gen-catalog` | GenSettings |
| Generative UI | Generative UI settings | `screens/GenSettings.png` | `design/GenSettings.dc.html` | `/gen-settings` | GenCatalog, Picker, Settings |
| Components | Header | `screens/Header.png` | `design/Header.dc.html` | `component` | — |
| Components | Composer | `screens/Composer.png` | `design/Composer.dc.html` | `component` | AttachSheet, ToolsSheet, Voice |
| Components | Search bar | `screens/SearchBar.png` | `design/SearchBar.dc.html` | `component` | — |
| Components | Toggle | `screens/Toggle.png` | `design/Toggle.dc.html` | `component` | — |
