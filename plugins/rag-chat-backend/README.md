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
| `ragChat.providers.type` | **Frontend + Backend** | Provider type used to build the LLM client |
| `ragChat.providers.apiToken` | **Backend only** ⚠️ | Shared provider secret key — never sent to browser |
| `ragChat.providers.apiBaseUrl` | **Frontend + Backend** | Optional shared API endpoint for the provider |
| `ragChat.providers.chatModel[]` | **Frontend + Backend** | Chat models available for the selected provider |
| `ragChat.providers.embedding.model` | **Backend + Frontend** | Embedding model used for RAG vector search |
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

These keys are read **exclusively by the backend** for credentials. The frontend uses the same structure for safe display metadata.

```yaml
# app-config.yaml

ragChat:
  # ── Shared with frontend ──────────────────────────────────────────────────
  # (see frontend README for defaultModelId, defaultSourceIds, permission, and
  #  models[].id/name/provider/apiBaseUrl and sources[].id/name/type/description)

  # ── Backend-only: permission toggle ──────────────────────────────────────
  permission:
    enabled: false   # default; set true to enforce ragChatChatPermission / ragChatAdminPermission

  providers:
    type: openai             # openai | anthropic | google | custom
    apiToken: ${OPENAI_API_TOKEN}   # ⚠️ backend only
    apiBaseUrl: https://api.openai.com/v1
    embedding:
      model: text-embedding-3-small
    chatModel:
      - id: gpt-4
        name: GPT-4
      - id: gpt-4-turbo
        name: GPT-4 Turbo

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
| `OPENAI_API_TOKEN` | OpenAI provider chat + embedding |
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
| `POST` | `/credentials` | `rag-chat.chat` | Save user-specific API tokens for a model |
| `GET` | `/admin/config` | `rag-chat.admin` | Return safe server-side config (no tokens) |

Permissions are only enforced when `ragChat.permission.enabled: true`.

### SSE event format (`POST /chat`)

```
data: {"type":"token","token":"Hello"}
data: {"type":"token","token":" world"}
data: {"type":"done","conversationId":"conv-123","messageId":"msg-456","citations":[],"usage":{"totalTokens":15}}
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
- **Anthropic** — `claude-3-*` via `@anthropic-ai/sdk`, supporting native `system` role
- **Google Gemini** — `gemini-pro` and others via `@google/genai`, supporting native `systemInstruction`
- Common `LlmProvider` interface with `chat()` and `stream()`
- Support for `system`, `user`, and `assistant` roles across all providers

### RAG Pipeline
- **Catalog** — fetches API, Component, Group, Template, User entities; chunks kind/name/ref/description/tags/spec
- **TechDocs** — fetches rendered HTML from the TechDocs backend, strips chrome, chunks article text
- **Custom** — fetches a URL (strips HTML) or reads a file path; configured via `sources[].target`
- **File upload** — TXT/PDF/DOCX extracted, chunked, and indexed scoped to a conversation
- **Chunker** — 512-word sliding window with 64-word overlap, metadata attached per chunk
- **Embedding** — `OpenAiEmbeddingProvider`, `GoogleEmbeddingProvider`, `AnthropicEmbeddingProvider`
- **Vector store** — `InMemoryVectorStore` (cosine similarity) for development; interface-based for easy swap to pgvector
- **Retrieval** — lazy indexing on first query; top-5 chunks injected as system context before conversation history
- **Citations** — Derived from retrieved RAG chunks and returned in the `done` event

### Prompt Engineering
- **System Role Optimization**: Behavioral instructions and RAG context are isolated in the `system` role to prevent LLM hallucination and history repetition.
- **General Chat Handling**: Professional handling of greetings and capability inquiries without irrelevant citations.

### Conversation Persistence
- Knex-backed via Backstage's `DatabaseService` — SQLite for dev, PostgreSQL for production
- Auto-migration on startup
- Tables: `rag_chat_conversations`, `rag_chat_messages`, `rag_chat_conversation_sources`
- Token usage tracking (`promptTokens`, `completionTokens`, `totalTokens`) persisted per message
- All data scoped per `user_ref`

### Streaming
- `POST /chat` streams tokens via SSE as they arrive from the LLM
- All three providers implement `stream()` returning `AsyncIterable<LlmStreamEvent>`
- Full response assembled and persisted to the database on completion
- Auth/permission errors emitted as `{ type: 'error' }` SSE events

### Permissions
- `ragChatChatPermission` — gates chat, upload, and conversation endpoints
- `ragChatAdminPermission` — gates `GET /admin/config`
- Registered via `coreServices.permissionsRegistry`
- Controlled by `ragChat.permission.enabled` (default `false`)

---

## Architecture

| File | Purpose |
|---|---|
| `src/plugin.ts` | Plugin registration, reads config, wires all services |
| `src/router.ts` | Express router — all API endpoints |
| `src/permissions.ts` | Permission definitions (shared with frontend plugin) |
| `src/services/ConversationService.ts` | Knex-backed conversation and message persistence |
| `src/services/llm/LlmProvider.ts` | `LlmProvider` interface and role definitions |
| `src/services/llm/LlmService.ts` | Builds providers from config, exposes `ILlmService` |
| `src/services/llm/OpenAiProvider.ts` | OpenAI chat and streaming |
| `src/services/llm/AnthropicProvider.ts` | Anthropic chat and streaming with system role support |
| `src/services/llm/GoogleProvider.ts` | Google Gemini chat and streaming with systemInstruction support |
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

- [x] **Replace in-memory vector store with pgvector**
  - Enable the extension: `CREATE EXTENSION IF NOT EXISTS vector;`
  - Add a Knex migration for an `embeddings` table with a `vector(1536)` column
  - Implement `PgVectorStore` using `knex.raw` for `<=>` cosine distance queries
  - Auto-select based on database client: SQLite → in-memory, Postgres → pgvector
  - Without this, all embeddings are lost on every server restart

- [ ] **Scheduled re-indexing**
  - Embeddings are currently indexed lazily on first query and lost on restart
  - Add a `SchedulerService` task to re-index catalog and TechDocs on a configurable interval
  - Track `indexed_at` per source in the database to skip unchanged content

### Medium Priority

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

- [ ] **OpenAPI spec**
  - Define an OpenAPI spec using Backstage's tooling for auto-generated docs and client SDKs

- [ ] **Expand test coverage**
  - Unit tests for `FileTextExtractor` with real PDF/DOCX fixtures
  - Unit tests for each `EmbeddingProvider` with mocked HTTP
  - Integration test for the full RAG pipeline: index → embed → retrieve → inject → generate
  - Stabilize frontend JSDOM event simulation for `keyDown` input submission
