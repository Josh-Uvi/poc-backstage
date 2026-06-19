import weaviate, { WeaviateClient, Filters, ApiKey } from 'weaviate-client';
import { VectorStore, VectorEntry } from './VectorStore';

export interface WeaviateVectorStoreOptions {
  scheme: 'http' | 'https';
  host: string;
  port?: number;
  apiKey?: string;
  className?: string;
}

export class WeaviateVectorStore implements VectorStore {
  private clientPromise: Promise<WeaviateClient>;
  private className: string;

  constructor(options: WeaviateVectorStoreOptions) {
    this.className = options.className || 'BackstageRagChunk';

    const auth = options.apiKey ? new ApiKey(options.apiKey) : undefined;
    
    // Extract host and optional port from the string
    let host = options.host;
    let port = options.port;
    if (!port) {
      if (host.includes(':')) {
        const parts = host.split(':');
        host = parts[0];
        port = parseInt(parts[1], 10);
      } else {
        port = options.scheme === 'https' ? 443 : 80;
      }
    }

    this.clientPromise = weaviate.connectToCustom({
      httpHost: host,
      httpPort: port,
      httpSecure: options.scheme === 'https',
      grpcHost: host,
      grpcPort: 50051, // default grpc port
      grpcSecure: options.scheme === 'https',
      authCredentials: auth,
    }).then(async client => {
      // Ensure class exists
      const exists = await client.collections.exists(this.className);
      if (!exists) {
        await client.collections.create({
          name: this.className,
          // We can omit properties here, they will be auto-schema created by Weaviate
        });
      }
      return client;
    });
  }

  private async getCollection() {
    const client = await this.clientPromise;
    return client.collections.get(this.className);
  }

  async upsert(sourceId: string, entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const collection = await this.getCollection();

    const objects = entries.map(entry => ({
      properties: {
        sourceId,
        text: entry.chunk.text,
        // Weaviate auto-indexes JSON props, but let's stringify metadata if it's complex
        metadataJson: JSON.stringify(entry.chunk.metadata),
      },
      vectors: entry.embedding,
    }));

    // Batch insert
    await collection.data.insertMany(objects);
  }

  async query(
    embedding: number[],
    sourceIds: string[],
    topK: number,
  ): Promise<VectorEntry[]> {
    const collection = await this.getCollection();

    let filter;
    if (sourceIds.length > 0) {
      if (sourceIds.length === 1) {
        filter = Filters.byProperty('sourceId').equal(sourceIds[0]);
      } else {
        // Build OR filter for multiple sourceIds
        const conditions = sourceIds.map(id => Filters.byProperty('sourceId').equal(id));
        filter = Filters.or(...conditions);
      }
    }

    const response = await collection.query.nearVector(embedding, {
      limit: topK,
      filters: filter,
      returnProperties: ['sourceId', 'text', 'metadataJson'],
    });

    return response.objects.map(obj => {
      const props = obj.properties as any;
      let metadata = {};
      try {
        metadata = JSON.parse(props.metadataJson || '{}');
      } catch (e) {
        // ignore parse error
      }

      return {
        chunk: {
          text: props.text as string,
          metadata,
        },
        embedding: [], // vector is not returned by default
        sourceId: props.sourceId as string,
      };
    });
  }

  async clear(sourceId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.data.deleteMany(
      Filters.byProperty('sourceId').equal(sourceId)
    );
  }

  async sync(
    sourceId: string,
    chunks: { text: string; metadata: Record<string, string>; hash: string }[],
    embedFn: (texts: string[]) => Promise<number[][]>,
  ): Promise<void> {
    // Basic sync: delete old and insert new
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
