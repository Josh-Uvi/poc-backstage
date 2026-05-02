import { CatalogApi } from '@backstage/catalog-client';
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { chunkText, Chunk } from './Chunker';

const CATALOG_KINDS = ['API', 'Component', 'Group', 'Template', 'User'];

export class CatalogRagSource {
  readonly #catalog: CatalogApi;

  constructor(catalog: CatalogApi) {
    this.#catalog = catalog;
  }

  async fetchChunks(
    credentials: BackstageCredentials,
  ): Promise<Chunk[]> {
    const { items: entities } = await this.#catalog.getEntities(
      { filter: CATALOG_KINDS.map(kind => ({ kind })) },
      { token: await this.#getToken(credentials) },
    );

    const chunks: Chunk[] = [];

    for (const entity of entities) {
      const kind = entity.kind;
      const name = entity.metadata.name;
      const namespace = entity.metadata.namespace ?? 'default';
      const title = entity.metadata.title ?? name;
      const description = entity.metadata.description ?? '';
      const tags = (entity.metadata.tags ?? []).join(', ');

      const text = [
        `Kind: ${kind}`,
        `Name: ${title}`,
        `Ref: ${kind.toLowerCase()}:${namespace}/${name}`,
        description,
        tags ? `Tags: ${tags}` : '',
        // Include spec fields as key:value pairs
        ...Object.entries(entity.spec ?? {}).map(
          ([k, v]) => `${k}: ${JSON.stringify(v)}`,
        ),
      ]
        .filter(Boolean)
        .join('\n');

      const metadata = {
        sourceId: 'catalog',
        kind,
        ref: `${kind.toLowerCase()}:${namespace}/${name}`,
        title,
      };

      chunks.push(...chunkText(text, metadata));
    }

    return chunks;
  }

  async #getToken(credentials: BackstageCredentials): Promise<string | undefined> {
    // credentials may carry a token for service-to-service auth
    if ('token' in credentials) return (credentials as any).token;
    return undefined;
  }
}
