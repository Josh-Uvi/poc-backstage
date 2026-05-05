# @internal/backstage-plugin-rag-chat

A Backstage **frontend** plugin that provides an AI-powered chat interface with real-time streaming responses, conversation management, file uploads, and configurable LLM models and RAG sources.

Requires [`@internal/backstage-plugin-rag-chat-backend`](../rag-chat-backend/README.md) to be installed and running.

---

## How the two plugins relate

Both plugins share a single `ragChat:` config block in `app-config.yaml`, but each reads a **different subset** of it:

| Config key | Read by | Purpose |
|---|---|---|
| `ragChat.defaultModelId` | **Frontend** | Pre-selects a model in the Settings panel |
| `ragChat.defaultSourceIds` | **Frontend** | Pre-selects RAG sources in the Settings panel |
| `ragChat.permission.enabled` | **Frontend + Backend** | Toggles permission enforcement in both plugins |
| `ragChat.providers.type` | **Frontend + Backend** | Provider type (`openai`, `anthropic`, `google`, `custom`) |
| `ragChat.providers.apiToken` | **Backend only** ⚠️ | Shared provider token — never sent to the browser |
| `ragChat.providers.apiBaseUrl` | **Frontend + Backend** | Optional shared API base URL |
| `ragChat.providers.chatModel[]` | **Frontend + Backend** | Available chat models for the selected provider |
| `ragChat.providers.embedding.model` | **Frontend + Backend** | Default embedding model for the selected provider |
| `ragChat.sources[].id/name/type/description` | **Frontend + Backend** | Source identity and display |
| `ragChat.sources[].target` | **Backend only** | URL or file path for custom sources |

> **Security rule:** `providers.apiToken` is read exclusively by the backend process for production use. Backstage's config system serves the `ragChat:` block to the frontend browser bundle — **never put real API tokens in `app-config.yaml` without using environment variable substitution** (e.g. `${OPENAI_API_TOKEN}`).

---

## Installation

```sh
yarn --cwd packages/app add @internal/backstage-plugin-rag-chat
```

Register in `packages/app/src/App.tsx`:

```ts
import ragChatPlugin from '@internal/backstage-plugin-rag-chat';

export default createApp({
  features: [
    // ...other plugins
    ragChatPlugin,
  ],
});
```

The plugin is available at [/rag-chat](http://localhost:3000/rag-chat).

---

## Frontend-only configuration

These keys are read by the **frontend plugin only**. They control the UI defaults and do not affect backend behaviour.

```yaml
# app-config.yaml

ragChat:
  # Pre-selects this model in the Settings panel on first load.
  # Must match an id defined under ragChat.providers.chatModel.
  defaultModelId: gpt-4

  # Pre-selects these sources in the Settings panel on first load.
  # Must match ids defined under ragChat.sources.
  defaultSourceIds:
    - catalog
    - techdocs

  # Controls whether Backstage permission checks are enforced.
  # false (default) — all authenticated users have full access.
  # true  — ragChatChatPermission gates chat/upload;
  #         ragChatAdminPermission gates model/source management in Settings.
  permission:
    enabled: false

  providers:
    type: openai          # openai | anthropic | google | custom
    apiToken: ${OPENAI_API_TOKEN}   # backend only
    apiBaseUrl: https://api.openai.com/v1
    embedding:
      model: text-embedding-3-small
    chatModel:
      - id: gpt-4
        name: GPT-4
      - id: gpt-4-turbo
        name: GPT-4 Turbo

  # Source display metadata — the frontend uses id, name, type, description
  # to populate the Settings source chips.
  # target is NOT needed here; it is only required in the backend config.
  sources:
    - id: catalog
      name: Software Catalog
      type: catalog             # catalog | techdocs | custom
      description: Query entities from the Backstage software catalog

    - id: techdocs
      name: TechDocs
      type: techdocs
      description: Query documentation from TechDocs
```

For the **backend-only** keys (`providers.apiToken`, `sources[].target`) see the [backend README](../rag-chat-backend/README.md#backend-only-configuration).

---

## Development

```sh
cd plugins/rag-chat
yarn start
```

---

## Implemented Features

### Chat Interface
- Multi-conversation sidebar — create, select, delete; title derived from first message
- Real-time SSE streaming — tokens appear as they arrive with a blinking cursor
- Modern rounded chat bubbles, theme-aware (Backstage light and dark modes)
- Logged-in user avatar — profile picture from `identityApiRef`, falls back to initials
- Auto-scroll to latest message (configurable)

### File Uploads
- Attach button opens a native file picker (TXT, PDF, DOCX)
- Selected file shown as a dismissible chip above the input
- File is uploaded to `POST /api/rag-chat/upload` and indexed for RAG retrieval within that conversation

### Settings Panel
- **Appearance** — auto-scroll and sound notification toggles (all users)
- **Model and Embedding Configuration** — choose provider, chat model, embedding model, and temperature
- If an `apiToken` is already present in `app-config.yaml` for the selected provider, the UI hides the API token input and uses the configured token automatically
- For Google providers, the UI loads available chat and embedding models and presents them in separate dropdowns
- Custom provider entry keeps the API token field and only shows the API base URL field for the `custom` provider option
- **RAG Sources** — app-config sources are shown as read-only references while users can still add their own sources
- User-defined sources are stored in `localStorage` under `ragChat.userSources`

### Permissions
- `ragChatChatPermission` (`rag-chat.chat`) — gates chat and file upload
- `ragChatAdminPermission` (`rag-chat.admin`) — gates model/source management in Settings
- Disabled by default (`ragChat.permission.enabled: false`)
- When disabled, all authenticated users have full access including admin features

### Architecture

| File | Purpose |
|------|---------|
| `src/plugin.tsx` | Plugin registration, `PageBlueprint`, `ApiBlueprint` |
| `src/api.ts` | `RagChatConfigApi` — reads frontend-relevant keys from `ragChat:` config |
| `src/permissions.ts` | Permission definitions (shared with backend) |
| `src/components/ChatUI/ChatInterface.tsx` | Main layout, SSE stream consumer, identity fetch |
| `src/components/ChatUI/ChatMessage.tsx` | Message bubble with avatar and streaming cursor |
| `src/components/ChatUI/ChatInput.tsx` | Text input with file attachment |
| `src/components/ChatUI/ChatSidebar.tsx` | Conversation list |
| `src/components/ChatUI/SettingsPanel.tsx` | Settings dialog with permission-aware controls |
| `src/components/ChatUI/types.ts` | Shared TypeScript types |

---

## TODO — Remaining Work to Production

### High Priority

- [x] **Wire to real backend — conversations**
  - On mount, call `GET /api/rag-chat/conversations` and replace `localStorage` state
  - On create/delete, call backend endpoints and update local state optimistically
  - `localStorage` should become a cache only, not the source of truth

- [x] **Wire to real backend — chat**
  - `handleSendMessage` currently uses a mock `setTimeout` — replace with a real `fetchApi.fetch` call to `POST /api/rag-chat/chat`
  - Consume the SSE stream token-by-token using `ReadableStream`
  - Surface `{ type: 'error' }` SSE events via the snackbar

- [x] **Markdown rendering in message bubbles**
  - Replace plain `<Typography>` with `react-markdown` + `remark-gfm`
  - Add syntax highlighting for code blocks via `react-syntax-highlighter`

- [x] **Source citations**
  - Render `citations` from the `done` SSE event as collapsible cards below the assistant bubble

### Medium Priority

- [ ] **Move user-defined model tokens server-side**
  - Storing `apiToken` in `localStorage` is insecure
  - Frontend should only send `modelId`; backend resolves the token

- [ ] **Conversation search and filter**
  - Search input in the sidebar to filter by title or message content

- [ ] **Rename conversation inline**
  - Double-click a conversation title in the sidebar to edit it in place

- [ ] **Export conversation**
  - Download the current conversation as Markdown or JSON

- [ ] **Upload progress indicator**
  - Show a progress bar while a file is being uploaded and indexed

### Lower Priority

- [ ] **Token / cost indicator** per message
- [ ] **Keyboard shortcuts** (`Ctrl+K` new conversation, `Escape` close Settings)
- [ ] **Accessibility audit** — ARIA labels, keyboard navigation
- [ ] **Expand test coverage** — SSE stream consumption, `SettingsPanel` with `canAdmin=false`, `RagChatConfigClient` edge cases
