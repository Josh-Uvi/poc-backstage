# Setting up pgvector for Backstage RAG Chat

When using PostgreSQL as your Backstage database, the `rag-chat-backend` plugin will automatically use `pgvector` to store and query embeddings efficiently. This ensures that your RAG (Retrieval-Augmented Generation) indexes survive server restarts.

To use this feature, the `pgvector` extension must be installed and enabled on your PostgreSQL database.

## 1. Enabling the Extension

The backend plugin handles creating the `rag_chat_embeddings` table and the `vector(1536)` column via Knex migrations. However, Backstage migrations typically run as a standard database user without superuser privileges, so they **cannot install extensions**.

You must enable the extension manually as a superuser **before** starting the Backstage backend:

```sql
-- Connect to your Backstage database as a superuser
\c backstage_plugin_rag_chat;

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

## 2. Cloud Provider Instructions

Most managed PostgreSQL providers support `pgvector` out of the box, but you still need to run the `CREATE EXTENSION` command.

### Amazon RDS / Aurora
`pgvector` is supported on RDS for PostgreSQL 15.2+ and Aurora PostgreSQL 15.3+.
1. Connect to your RDS instance using your master user (e.g., `postgres`).
2. Run `CREATE EXTENSION IF NOT EXISTS vector;` in the specific database used by the plugin.

### Google Cloud SQL
`pgvector` is supported on Cloud SQL for PostgreSQL 15+.
1. Connect using the `postgres` user.
2. Run `CREATE EXTENSION IF NOT EXISTS vector;`.

### Neon
Neon supports `pgvector` by default on all compute endpoints.
1. Connect via the Neon SQL Editor or `psql` using your admin credentials.
2. Run `CREATE EXTENSION IF NOT EXISTS vector;`.

### Local Development (Docker)
If you are running PostgreSQL locally via Docker, use the official `pgvector` image instead of the standard `postgres` image:

```yaml
# docker-compose.yml
services:
  postgres:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
```

## 3. Verifying the Setup

When the backend starts, the Knex migration `20240516_init_vector_store.ts` will run. If `pgvector` is not enabled, you will see an error similar to:

```
error: type "vector" does not exist
```

If it starts successfully, you can verify the table was created:

```sql
\d rag_chat_embeddings
```

You should see the `embedding` column with the type `vector(1536)`.

## 4. Fallback Behavior

If you are using SQLite (typically only in local development or CI), the plugin will automatically detect the database client and fall back to the `InMemoryVectorStore`. In this mode, embeddings are stored in memory and will be lost when the server restarts, but no database extensions are required.
