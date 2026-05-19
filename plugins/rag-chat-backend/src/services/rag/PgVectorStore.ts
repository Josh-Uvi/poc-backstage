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
}
