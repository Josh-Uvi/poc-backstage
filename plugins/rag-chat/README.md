# RAG Chat Plugin

A Backstage frontend plugin providing an AI-powered chat interface with conversation management, configurable LLM models, and RAG source selection.

## Getting Started

Available at [/rag-chat](http://localhost:3000/rag-chat) when running `yarn start` from the root directory.

To serve the plugin in isolation:

```sh
cd plugins/rag-chat
yarn start
```

---

## Current Features

### Chat UI
- Multi-conversation sidebar with create, select, and delete
- Dynamic conversation titles derived from the first user message
- Modern rounded chat bubbles — theme-aware (Backstage light/dark)
- Logged-in user avatar (profile picture or initials via `identityApiRef`)
- Auto-scroll to latest message (configurable)
- File attachment picker with chip preview
- Conversations and settings persisted in `localStorage`

### Configuration
- Models and RAG sources configurable via `app-config.yaml` under `ragChat:`
- UI fallback: users can add custom models and sources via the Settings panel when none are provided by config
- User-defined models/sources stored in `localStorage` separately from app config
- `RagChatConfigApi` registered as an `ApiBlueprint` extension in the new Backstage frontend system

### Settings Panel
- Toggle auto-scroll and sound notifications
- Select active LLM model and temperature
- Toggle which RAG sources the assistant queries
- Add/delete custom models (name, provider, API base URL, API token)
- Add/delete custom sources (name, type, description)

---

## app-config.yaml Reference

```yaml
ragChat:
  defaultModelId: gpt-4
  defaultSourceIds:
    - catalog
    - techdocs
  models:
    - id: gpt-4
      name: GPT-4
      provider: openai                          # openai | anthropic | google | custom
      apiBaseUrl: https://api.openai.com/v1
      # apiToken: ${OPENAI_API_TOKEN}
    - id: claude-3-opus
      name: Claude 3 Opus
      provider: anthropic
      apiBaseUrl: https://api.anthropic.com/v1
      # apiToken: ${ANTHROPIC_API_TOKEN}
    - id: gemini-pro
      name: Gemini Pro
      provider: google
      apiBaseUrl: https://generativelanguage.googleapis.com/v1
      # apiToken: ${GOOGLE_API_TOKEN}
  sources:
    - id: catalog
      name: Software Catalog
      type: catalog
      description: Query entities from the Backstage software catalog
    - id: techdocs
      name: TechDocs
      type: techdocs
      description: Query documentation from TechDocs
```

---

## TODO — Remaining Work

### Backend Plugin (`plugins/rag-chat-backend`)

- [ ] **Create backend plugin scaffold**
  - Run `yarn backstage-cli new --select backend-plugin` to generate `plugins/rag-chat-backend`
  - Register it in `packages/backend/src/index.ts` via `backend.add(import('@internal/backstage-plugin-rag-chat-backend'))`

- [ ] **REST API router**
  - `POST /api/rag-chat/chat` — accepts `{ message, modelId, sourceIds, conversationId, temperature }`, returns streamed or single assistant response
  - `GET /api/rag-chat/conversations` — list saved conversations per user
  - `POST /api/rag-chat/conversations` — create/update a conversation
  - `DELETE /api/rag-chat/conversations/:id` — delete a conversation

- [ ] **LLM provider integrations**
  - OpenAI (`gpt-3.5-turbo`, `gpt-4`, `gpt-4o`) via `openai` npm package
  - Anthropic (`claude-3-*`) via `@anthropic-ai/sdk`
  - Google Gemini via `@google/generative-ai`
  - Abstract behind a common `LlmProvider` interface so providers are swappable
  - Read `apiToken` and `apiBaseUrl` from `app-config.yaml` server-side (never expose tokens to the frontend)

- [ ] **RAG pipeline**
  - Catalog source: use `CatalogClient` to fetch entities, chunk and embed metadata/descriptions
  - TechDocs source: read rendered HTML from TechDocs storage, chunk into passages
  - Custom source: accept a URL or file path, fetch and chunk content
  - Embed chunks using the configured model's embedding endpoint (or a dedicated embedding model)
  - Store embeddings in a vector store (options: pgvector via existing Postgres, in-memory for dev, or external e.g. Pinecone/Weaviate)
  - At query time: embed the user message, retrieve top-k relevant chunks, inject into the LLM prompt as context

- [ ] **Conversation persistence (database)**
  - Use Backstage's `DatabaseService` (Knex) to store conversations and messages per user
  - Schema: `rag_chat_conversations(id, user_ref, title, created_at, updated_at)` and `rag_chat_messages(id, conversation_id, role, content, timestamp)`
  - Migrate away from `localStorage` as the source of truth — use it only as a cache

- [ ] **Streaming responses**
  - Implement SSE (`text/event-stream`) or chunked transfer on `POST /api/rag-chat/chat`
  - Frontend consumes the stream and appends tokens to the message bubble in real time

- [ ] **File upload handling**
  - `POST /api/rag-chat/upload` — accept multipart file, extract text (PDF, DOCX, TXT), chunk and embed
  - Associate uploaded file chunks with the conversation for scoped RAG retrieval
  - Return a source reference the frontend can display

- [ ] **Permissions**
  - Define `ragChatChatPermission` and `ragChatAdminPermission` using Backstage's permission framework
  - Gate the chat endpoint behind `ragChatChatPermission`
  - Gate model/source management behind `ragChatAdminPermission`

---

### Frontend (`plugins/rag-chat`)

- [ ] **Replace mock response generator with real API calls**
  - Create a `RagChatClient` that calls `POST /api/rag-chat/chat` via `fetchApiRef` + `discoveryApiRef`
  - Pass `modelId`, `temperature`, `activeSourceIds`, `conversationId`, and message content
  - Handle errors and surface them via the snackbar

- [ ] **Streaming message rendering**
  - Consume the SSE stream from the backend
  - Render a message bubble that grows token-by-token with a blinking cursor indicator

- [ ] **Sync conversations with backend**
  - On mount, fetch conversations from `GET /api/rag-chat/conversations` and merge with `localStorage`
  - On create/delete, call the corresponding backend endpoints
  - Remove `localStorage` as the primary store; use it only for optimistic UI

- [ ] **File upload integration**
  - Wire the attach button to `POST /api/rag-chat/upload`
  - Show upload progress indicator
  - Display uploaded file as a cited source in the conversation

- [ ] **Markdown rendering in message bubbles**
  - Replace plain `<Typography>` with a Markdown renderer (e.g. `react-markdown` + `remark-gfm`)
  - Support code blocks with syntax highlighting (`react-syntax-highlighter`)

- [ ] **Source citations in responses**
  - Backend should return `citations: [{ title, url, excerpt }]` alongside the answer
  - Frontend renders citations as expandable cards below the assistant bubble

- [ ] **Conversation search / filter**
  - Add a search input to the sidebar to filter conversations by title or message content

- [ ] **Rename conversation**
  - Allow users to double-click a conversation title in the sidebar to rename it inline

- [ ] **Export conversation**
  - Add a menu option to export the current conversation as Markdown or JSON

- [ ] **Token / cost indicator**
  - Display estimated token usage and cost per message based on the selected model's pricing

---

### Infrastructure & Quality

- [ ] **Move API tokens server-side**
  - Currently `apiToken` can be stored in `localStorage` for user-defined models — this is insecure
  - Backend should proxy all LLM calls; tokens should only live in `app-config.yaml` or environment variables

- [ ] **Vector store setup guide**
  - Document how to enable `pgvector` extension on the Backstage Postgres instance
  - Provide a Knex migration for the embeddings table

- [ ] **Expand test coverage**
  - Unit tests for `RagChatConfigClient` parsing edge cases
  - Unit tests for the backend LLM provider adapters
  - Integration test for the RAG pipeline (embed → retrieve → generate)
  - E2E test for the full chat flow using `@backstage/frontend-test-utils`

- [ ] **Update README** with backend setup steps, vector store configuration, and provider-specific environment variable names once backend is implemented
