# @internal/backstage-plugin-rag-chat

A Backstage **frontend** plugin that provides an AI-powered chat interface with real-time streaming responses, conversation management, file uploads, and configurable LLM models and RAG sources.

Requires [`@internal/backstage-plugin-rag-chat-backend`](../rag-chat-backend/README.md) to be installed and running.


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



## Development

```sh
cd plugins/rag-chat
yarn start
yarn test
yarn lint
```



## Implemented Features

### Chat Interface
- **Rich Messaging**: Markdown rendering via `react-markdown` with GFM support and syntax highlighting for code blocks.
- **Citations**: Source citations derived from RAG context are rendered as interactive cards below assistant responses.
- **Real-time Streaming**: SSE streaming with a typing indicator and auto-scroll.
- **Conversation Management**: Multi-conversation sidebar with search, inline renaming, and export (Markdown/JSON).
- **Usage Tracking**: Per-message token counts and estimated cost indicators.

### File Uploads
- Attach files (TXT, PDF, DOCX) directly to a conversation.
- Upload progress bar and optimistic UI updates.
- Scoped indexing ensures uploaded files are only retrieved for the specific conversation.

### Settings Panel
- **Smart Configuration**: Permission-aware controls for models, sources, and temperature.
- **Provider Management**: Auto-hiding API tokens when configured server-side.
- **Appearance**: Toggles for auto-scroll and notification sounds.

### Architecture

| File | Purpose |
|------|---------|
| `src/plugin.tsx` | Plugin registration, `PageBlueprint`, `ApiBlueprint` |
| `src/api.ts` | `RagChatConfigApi` — reads frontend-relevant keys from `ragChat:` config |
| `src/permissions.ts` | Permission definitions (shared with backend) |
| `src/components/ChatUI/ChatInterface.tsx` | Main layout, SSE stream consumer, identity fetch |
| `src/components/ChatUI/ChatMessage.tsx` | Message bubble with Markdown and Citation rendering |
| `src/components/ChatUI/ChatInput.tsx` | Text input with file attachment and keyboard shortcuts |
| `src/components/ChatUI/ChatSidebar.tsx` | Conversation list with search and filter |
| `src/components/ChatUI/SettingsPanel.tsx` | Settings dialog with permission-aware controls |

---

## TODO — Remaining Work to Production

### High Priority

- [x] **Stabilize JSDOM test environment**
  - Fix flaky event simulation for `keyDown` input submission in `ChatInterface.test.tsx`.
  - Current JSDOM limitations cause inconsistencies in synthetic event propagation for complex MUI components.

- [x] **Response Feedback System**
  - Add thumbs up/down buttons to assistant messages to capture user satisfaction.
  - Send feedback to the backend for RAG quality auditing.

### Medium Priority

- [x] **Advanced File Preview**
  - Preview the content of uploaded documents (TXT/MD) before sending the message.

- [x] **Custom System Prompt Tuning**
  - Allow administrators to adjust the base system instructions via the Settings panel.

### Lower Priority

- [ ] **Image Generation Support**
  - Integrate with DALL-E or Stable Diffusion for image generation responses.
- [ ] **Voice Input**
  - Add Web Speech API integration for hands-free queries.
