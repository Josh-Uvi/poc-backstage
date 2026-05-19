import { Knex } from 'knex';
import { VectorStore, VectorEntry } from './VectorStore';

export class PgVectorStore implements VectorStore {
  readonly #db: Knex;

  constructor(db: Knex) {
    this.#db = db;
  }

  async upsert(sourceId: string, entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    await this.#db.transaction(async trx => {
      // Clear existing entries for this source
      await trx('rag_chat_embeddings').where({ source_id: sourceId }).delete();

      // Bulk insert new entries
      const rows = entries.map(entry => ({
        source_id: sourceId,
        text: entry.chunk.text,
        metadata: JSON.stringify(entry.chunk.metadata),
        embedding: `[${entry.embedding.join(',')}]`,
      }));

      await trx('rag_chat_embeddings').insert(rows);
    });
  }

  async query(
    embedding: number[],
    sourceIds: string[],
    topK: number,
  ): Promise<VectorEntry[]> {
    const embeddingStr = `[${embedding.join(',')}]`;

    let queryStr = `
      SELECT source_id, text, metadata, embedding <=> ?::vector AS distance
      FROM rag_chat_embeddings
    `;
    const bindings: any[] = [embeddingStr];

    if (sourceIds.length > 0) {
      queryStr += ` WHERE source_id = ANY(?)`;
      bindings.push(sourceIds);
    }

    queryStr += ` ORDER BY distance ASC LIMIT ?`;
    bindings.push(topK);

    const result = await this.#db.raw(queryStr, bindings);

    return result.rows.map((row: any) => ({
      sourceId: row.source_id,
      chunk: {
        text: row.text,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      },
      // We don't fetch the embedding array back to save bandwidth, as RagService doesn't use it.
      embedding: [], 
    }));
  }

  async clear(sourceId: string): Promise<void> {
    await this.#db('rag_chat_embeddings').where({ source_id: sourceId }).delete();
  }

  async sync(
    sourceId: string,
    chunks: { text: string; metadata: Record<string, string>; hash: string }[],
    embedFn: (texts: string[]) => Promise<number[][]>,
  ): Promise<void> {
    if (chunks.length === 0) {
      await this.clear(sourceId);
      return;
    }

    const now = new Date();
    const hashes = chunks.map(c => c.hash);

    await this.#db.transaction(async trx => {
      // Find which hashes already exist
      const existing = await trx('rag_chat_embeddings')
        .select('content_hash')
        .where({ source_id: sourceId })
        .whereIn('content_hash', hashes);

      const existingHashes = new Set(existing.map((row: any) => row.content_hash));
      const newChunks = chunks.filter(c => !existingHashes.has(c.hash));

      // Update timestamp for existing chunks
      if (existingHashes.size > 0) {
        await trx('rag_chat_embeddings')
          .where({ source_id: sourceId })
          .whereIn('content_hash', Array.from(existingHashes))
          .update({ indexed_at: now });
      }

      // Embed and insert new chunks
      if (newChunks.length > 0) {
        const texts = newChunks.map(c => c.text);
        const embeddings = await embedFn(texts);

        const rows = newChunks.map((chunk, i) => ({
          source_id: sourceId,
          text: chunk.text,
          metadata: JSON.stringify(chunk.metadata),
          embedding: `[${embeddings[i].join(',')}]`,
          content_hash: chunk.hash,
          indexed_at: now,
        }));

        await trx('rag_chat_embeddings').insert(rows);
      }

      // Delete any rows that were not seen during this sync
      await trx('rag_chat_embeddings')
        .where({ source_id: sourceId })
        .where('indexed_at', '<', now)
        .delete();
    });
  }
}
