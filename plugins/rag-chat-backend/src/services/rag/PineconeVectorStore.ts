import { Pinecone, RecordMetadata } from '@pinecone-database/pinecone';
import { VectorStore, VectorEntry } from './VectorStore';

export interface PineconeVectorStoreOptions {
  apiKey: string;
  indexName: string;
  host?: string;
}

export class PineconeVectorStore implements VectorStore {
  private readonly pinecone: Pinecone;
  private readonly indexName: string;

  constructor(options: PineconeVectorStoreOptions) {
    this.pinecone = new Pinecone({ apiKey: options.apiKey });
    this.indexName = options.indexName;
  }

  private get index() {
    return this.pinecone.Index<RecordMetadata>(this.indexName);
  }

  async upsert(sourceId: string, entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Pinecone allows up to 1000 vectors per upsert request
    const batchSize = 100;
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const vectors = batch.map((entry, idx) => ({
        id: `${sourceId}_${i + idx}`,
        values: entry.embedding,
        metadata: {
          sourceId,
          text: entry.chunk.text,
          ...entry.chunk.metadata,
        },
      }));

      await this.index.upsert(vectors);
    }
  }

  async query(
    embedding: number[],
    sourceIds: string[],
    topK: number,
  ): Promise<VectorEntry[]> {
    const filter = sourceIds.length > 0 ? { sourceId: { $in: sourceIds } } : undefined;

    const response = await this.index.query({
      vector: embedding,
      topK,
      filter,
      includeMetadata: true,
    });

    return response.matches.map(match => {
      const metadata = match.metadata || {};
      const { sourceId, text, ...restMeta } = metadata;
      return {
        chunk: {
          text: text as string,
          metadata: restMeta as Record<string, string>,
        },
        embedding: [], // Pinecone doesn't return the vector by default unless requested, and we don't need it
        sourceId: sourceId as string,
      };
    });
  }

  async clear(sourceId: string): Promise<void> {
    // Delete all vectors with this sourceId
    await this.index.deleteMany({ sourceId });
  }

  async sync(
    sourceId: string,
    chunks: { text: string; metadata: Record<string, string>; hash: string }[],
    embedFn: (texts: string[]) => Promise<number[][]>,
  ): Promise<void> {
    // For simplicity with Pinecone, we clear the existing source and insert the new ones
    // A more advanced implementation would use listPaginated to diff hashes.
    await this.clear(sourceId);

    const embeddings = await embedFn(chunks.map(c => c.text));
    const entries: VectorEntry[] = chunks.map((chunk, i) => ({
      chunk: { text: chunk.text, metadata: chunk.metadata },
      embedding: embeddings[i],
      sourceId,
    }));

    await this.upsert(sourceId, entries);
  }
}
