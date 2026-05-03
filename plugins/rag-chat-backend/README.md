# @internal/backstage-plugin-rag-chat-backend

A Backstage **backend** plugin that powers the RAG Chat experience. It handles LLM calls, RAG indexing and retrieval, conversation persistence, file upload processing, SSE streaming, and permission enforcement.

Works in conjunction with [`@internal/backstage-plugin-rag-chat`](../rag-chat/README.md).

---

## How the two plugins relate

Both plugins share a single `ragChat:` config block in `app-config.yaml`, but each reads a **different subset** of it:

| Config key | Read by | Purpose |
|---|---|---|
| `ragChat.defaultModelId` | Frontend only | Pre-selects a model in the UI |
| `ragChat.defaultSourceIds` | Frontend only | Pre-selects sources in the UI |
| `ragChat.permission.enabled` | **Frontend + Backend** | Toggles permission enforcement in both |
| `ragChat.models[].id` | **Frontend + Backend** | Identifies the model in API requests |
| `ragChat.models[].name` | Frontend only | Display name in the Settings dropdown |
| `ragChat.models[].provider` | **Frontend + Backend** | Provider type used to build the LLM client |
| `ragChat.models[].apiBaseUrl` | **Frontend + Backend** | API endpoint for the provider |
| `ragChat.models[].apiToken` | **Backend only** ⚠️ | Secret key — read server-side, never sent to browser |
| `ragChat.embedding.*` | **Backend only** ⚠️ | Embedding model and secret key for RAG vector search |
| `ragChat.sources[].id/name/type/description` | **Frontend + Backend** | Source identity and display |
| `ragChat.sources[].target` | **Backend only** | URL or file path for custom sources |

> **Security:** `apiToken` values are resolved from environment variables server-side by Backstage's config pipeline. They are never included in the browser bundle. Always use `${ENV_VAR}` substitution — never hardcode tokens.

---

## Installation

```sh
yarn --cwd packages/backend add @internal/backstage-plugin-rag-chat-backend
```

Register in `packages/backend/src/index.ts`:

```ts
backend.add(import('@internal/backstage-plugin-rag-chat-backend'));
```

---

## Backend-only configuration

These keys are read **exclusively by the backend**. The frontend never sees `apiToken` or `embedding` values.

```yaml
# app-config.yaml

ragChat:
  # ── Shared with frontend ──────────────────────────────────────────────────
  # (see frontend README for defaultModelId, defaultSourceIds, permission, and
  #  models[].id/name/provider/apiBaseUrl and sources[].id/name/type/description)

  # ── Backend-only: permission toggle ──────────────────────────────────────
  permission:
    enabled: false   # default; set true to enforce ragChatChatPermission / ragChatAdminPermission

  # ── Backend-only: embedding model ────────────────────────────────────────
  # Used to embed text chunks and user queries for vector similarity search.
  # The frontend never reads this block.
  embedding:
    provider: openai          # openai | google | anthropic
    apiToken: ${OPENAI_API_TOKEN}   # ⚠️ server-side only
    model: text-embedding-3-small   # OpenAI default; use text-embedding-004 for Google
    # apiBaseUrl: https://api.openai.com/v1   # optional override

  # ── Backend-only: apiToken per model ─────────────────────────────────────
  # id, name, provider, apiBaseUrl are also read by the frontend for display.
  # apiToken is read ONLY by the backend to make LLM API calls.
  models:
    - id: gpt-4
      name: GPT-4
      provider: openai
      apiBaseUrl: https://api.openai.com/v1
      apiToken: ${OPENAI_API_TOKEN}       # ⚠️ backend only

    - id: gpt-4-turbo
      name: GPT-4 Turbo
      provider: openai
      apiBaseUrl: https://api.openai.com/v1
      apiToken: ${OPENAI_API_TOKEN}       # ⚠️ backend only

    - id: claude-3-opus
      name: Claude 3 Opus
      provider: anthropic
      apiBaseUrl: https://api.anthropic.com/v1
      apiToken: ${ANTHROPIC_API_TOKEN}    # ⚠️ backend only

    - id: gemini-pro
      name: Gemini Pro
      provider: google
      apiBaseUrl: https://generativelanguage.googleapis.com/v1
      apiToken: ${GOOGLE_API_TOKEN}       # ⚠️ backend only

  # ── Backend-only: source targets ─────────────────────────────────────────
  # id, name, type, description are also read by the frontend for display.
  # target is read ONLY by the backend to fetch and index content.
  sources:
    - id: catalog
      name: Software Catalog
      type: catalog
      description: Query entities from the Backstage software catalog
      # No target needed — uses CatalogClient internally

    - id: techdocs
      name: TechDocs
      type: techdocs
      description: Query documentation from TechDocs
      # No target needed — fetches from the TechDocs backend

    # - id: my-docs
    #   name: My Custom Docs
    #   type: custom
    #   description: Internal runbooks
    #   target: https://example.com/runbooks   # ⚠️ backend only — URL or absolute file path
```

### Required environment variables

| Variable | Used for |
|---|---|
| `OPENAI_API_TOKEN` | OpenAI LLM calls and/or embedding |
| `ANTHROPIC_API_TOKEN` | Anthropic Claude LLM calls |
| `GOOGLE_API_TOKEN` | Google Gemini LLM calls and/or embedding |

Set these in your shell or `.env` file before running `yarn start`.

---

## API Endpoints

All endpoints are mounted under `/api/rag-chat/`.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `POST` | `/chat` | `rag-chat.chat` | Send a message; streams SSE response tokens |
| `POST` | `/upload` | `rag-chat.chat` | Upload a file (TXT/PDF/DOCX) for RAG indexing |
| `GET` | `/conversations` | `rag-chat.chat` | List conversations for the authenticated user |
| `POST` | `/conversations` | `rag-chat.chat` | Create or update a conversation |
| `DELETE` | `/conversations/:id` | `rag-chat.chat` | Delete a conversation |
| `GET` | `/admin/config` | `rag-chat.admin` | Return safe server-side config (no tokens) |

Permissions are only enforced when `ragChat.permission.enabled: true`.

### SSE event format (`POST /chat`)

```
data: {"type":"token","token":"Hello"}
data: {"type":"token","token":" world"}
data: {"type":"done","conversationId":"conv-123","messageId":"msg-456"}
data: {"type":"error","error":"No LLM provider configured for modelId 'gpt-4'"}
```

---

## Development

```sh
cd plugins/rag-chat-backend
yarn start   # standalone mode
yarn test
```

---

## Implemented Features

### LLM Providers
- **OpenAI** — `gpt-3.5-turbo`, `gpt-4`, `gpt-4o`, any OpenAI-compatible endpoint
- **Anthropic** — `claude-3-*` via `@anthropic-ai/sdk`
- **Google Gemini** — `gemini-pro` and others via `@google/generative-ai`
- Common `LlmProvider` interface with `chat()` and `stream()` — swap providers without changing the router
- Models without a configured `apiToken` are skipped at startup with a warning

### RAG Pipeline
- **Catalog** — fetches API, Component, Group, Template, User entities; chunks kind/name/ref/description/tags/spec
- **TechDocs** — fetches rendered HTML from the TechDocs backend, strips chrome, chunks article text
- **Custom** — fetches a URL (strips HTML) or reads a file path; configured via `sources[].target`
- **File upload** — TXT/PDF/DOCX extracted, chunked, and indexed scoped to a conversation
- **Chunker** — 512-word sliding window with 64-word overlap, metadata attached per chunk
- **Embedding** — `OpenAiEmbeddingProvider`, `GoogleEmbeddingProvider`, `AnthropicEmbeddingProvider`
- **Vector store** — `InMemoryVectorStore` (cosine similarity) for development; interface-based for easy swap to pgvector
- **Retrieval** — lazy indexing on first query; top-5 chunks injected as system context before conversation history

### Conversation Persistence
- Knex-backed via Backstage's `DatabaseService` — SQLite for dev, PostgreSQL for production
- Auto-migration on startup
- Tables: `rag_chat_conversations`, `rag_chat_messages`, `rag_chat_conversation_sources`
- All data scoped per `user_ref`

### Streaming
- `POST /chat` streams tokens via SSE as they arrive from the LLM
- All three providers implement `stream()` returning `AsyncIterable<string>`
- Full response assembled and persisted to the database on completion
- Auth/permission errors emitted as `{ type: 'error' }` SSE events

### Permissions
- `ragChatChatPermission` — gates chat, upload, and conversation endpoints
- `ragChatAdminPermission` — gates `GET /admin/config`
- Registered via `coreServices.permissionsRegistry`
- Controlled by `ragChat.permission.enabled` (default `false`)

### Architecture

| File | Purpose |
|------|---------|
| `src/plugin.ts` | Plugin registration, reads config, wires all services |
| `src/router.ts` | Express router — all API endpoints |
| `src/permissions.ts` | Permission definitions (shared with frontend plugin) |
| `src/services/ConversationService.ts` | Knex-backed conversation and message persistence |
| `src/services/llm/LlmProvider.ts` | `LlmProvider` interface (`chat` + `stream`) |
| `src/services/llm/LlmService.ts` | Builds providers from config, exposes `ILlmService` |
| `src/services/llm/OpenAiProvider.ts` | OpenAI chat and streaming |
| `src/services/llm/AnthropicProvider.ts` | Anthropic chat and streaming |
| `src/services/llm/GoogleProvider.ts` | Google Gemini chat and streaming |
| `src/services/rag/RagService.ts` | Orchestrates indexing and retrieval |
| `src/services/rag/EmbeddingProvider.ts` | Embedding interface + implementations |
| `src/services/rag/VectorStore.ts` | `VectorStore` interface + `InMemoryVectorStore` |
| `src/services/rag/Chunker.ts` | Sliding-window text chunker |
| `src/services/rag/CatalogRagSource.ts` | Catalog entity fetching and chunking |
| `src/services/rag/TechDocsRagSource.ts` | TechDocs HTML fetching and chunking |
| `src/services/rag/CustomRagSource.ts` | URL/file fetching and chunking |
| `src/services/rag/FileTextExtractor.ts` | TXT/PDF/DOCX text extraction |
| `src/services/migrations/` | Knex migration files |

---

## TODO — Remaining Work to Production

### High Priority

- [ ] **Replace in-memory vector store with pgvector**
  - Enable the extension: `CREATE EXTENSION IF NOT EXISTS vector;`
  - Add a Knex migration for an `embeddings` table with a `vector(1536)` column
  - Implement `PgVectorStore` using `knex.raw` for `<=>` cosine distance queries
  - Auto-select based on database client: SQLite → in-memory, Postgres → pgvector
  - Without this, all embeddings are lost on every server restart

- [ ] **Scheduled re-indexing**
  - Embeddings are currently indexed lazily on first query and lost on restart
  - Add a `SchedulerService` task to re-index catalog and TechDocs on a configurable interval
  - Track `indexed_at` per source in the database to skip unchanged content

- [ ] **Source citations in the `done` event**
  - Include `citations: [{ title, ref, excerpt }]` derived from retrieved RAG chunks
  - Frontend renders them as collapsible cards below the assistant bubble

- [ ] **Wire frontend to this backend**
  - The frontend `handleSendMessage` still uses a mock `setTimeout`
  - The frontend conversation list is still driven by `localStorage`
  - See [frontend README TODO](../rag-chat/README.md#todo--remaining-work-to-production)

### Medium Priority

- [ ] **Secure user-defined model tokens**
  - User-defined models added via the Settings UI store `apiToken` in `localStorage` — insecure
  - Add `POST /admin/models` and `DELETE /admin/models/:id` (gated by `ragChatAdminPermission`)
  - Frontend sends only `modelId`; backend resolves the token

- [ ] **PDF extraction improvements**
  - Current extraction reads the raw text layer only — scanned PDFs return empty
  - Integrate `pdf-parse` or `pdfjs-dist` for reliable extraction

- [ ] **Rate limiting on `POST /chat`**
  - Add per-user rate limiting configurable via `ragChat.rateLimit.requestsPerMinute`

- [ ] **Audit logging**
  - Use Backstage's `AuditorService` to log chat requests with model, sources, and user ref

### Lower Priority

- [ ] **pgvector setup guide**
  - Document enabling `pgvector` on AWS RDS, Cloud SQL, and Neon
  - Provide the migration SQL

- [ ] **External vector store support**
  - `PineconeVectorStore` and `WeaviateVectorStore` behind the `VectorStore` interface
  - Configurable via `ragChat.vectorStore.type`

- [ ] **Anthropic full conversation history**
  - Properly map alternating user/assistant turns to Anthropic's message format

- [ ] **OpenAPI spec**
  - Define an OpenAPI spec using Backstage's tooling for auto-generated docs and client SDKs

- [ ] **Expand test coverage**
  - Unit tests for `FileTextExtractor` with real PDF/DOCX fixtures
  - Unit tests for each `EmbeddingProvider` with mocked HTTP
  - Integration test for the full RAG pipeline: index → embed → retrieve → inject → generate
  - Test `permissionsEnabled: false` path
