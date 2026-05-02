import { Chunk } from './Chunker';

export interface VectorEntry {
  chunk: Chunk;
  embedding: number[];
  sourceId: string;
}

export interface VectorStore {
  upsert(sourceId: string, entries: VectorEntry[]): Promise<void>;
  query(embedding: number[], sourceIds: string[], topK: number): Promise<VectorEntry[]>;
  clear(sourceId: string): Promise<void>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class InMemoryVectorStore implements VectorStore {
  readonly #store = new Map<string, VectorEntry[]>();

  async upsert(sourceId: string, entries: VectorEntry[]): Promise<void> {
    this.#store.set(sourceId, entries);
  }

  async query(
    embedding: number[],
    sourceIds: string[],
    topK: number,
  ): Promise<VectorEntry[]> {
    const candidates: Array<{ entry: VectorEntry; score: number }> = [];

    for (const [sid, entries] of this.#store) {
      if (sourceIds.length && !sourceIds.includes(sid)) continue;
      for (const entry of entries) {
        candidates.push({
          entry,
          score: cosineSimilarity(embedding, entry.embedding),
        });
      }
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(c => c.entry);
  }

  async clear(sourceId: string): Promise<void> {
    this.#store.delete(sourceId);
  }
}
