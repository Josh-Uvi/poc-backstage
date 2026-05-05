import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import { LoggerService, BackstageCredentials } from '@backstage/backend-plugin-api';
import { CatalogApi } from '@backstage/catalog-client';
import { chunkText, Chunk } from './Chunker';

export class TechDocsRagSource {
  readonly #catalog: CatalogApi;
  readonly #techdocsBaseUrl: string;
  readonly #logger: LoggerService;

  constructor(options: {
    catalog: CatalogApi;
    techdocsBaseUrl: string;
    logger: LoggerService;
  }) {
    this.#catalog = options.catalog;
    this.#techdocsBaseUrl = options.techdocsBaseUrl.replace(/\/$/, '');
    this.#logger = options.logger;
  }

  async fetchChunks(credentials: BackstageCredentials): Promise<Chunk[]> {
    // Find all entities that have TechDocs enabled
    const { items: entities } = await this.#catalog.getEntities({
      filter: { 'metadata.annotations.backstage.io/techdocs-ref': '*' },
    }, { credentials } as any);

    const chunks: Chunk[] = [];

    for (const entity of entities) {
      const kind = entity.kind.toLowerCase();
      const namespace = entity.metadata.namespace ?? 'default';
      const name = entity.metadata.name;

      try {
        const url = `${this.#techdocsBaseUrl}/static/docs/${namespace}/${kind}/${name}/index.html`;
        const response = await fetch(url);

        if (!response.ok) {
          this.#logger.debug(
            `TechDocs not available for ${kind}:${namespace}/${name} (${response.status})`,
          );
          continue;
        }

        const html = await response.text();
        const root = parse(html);

        // Remove nav, header, footer — keep only article content
        root.querySelectorAll('nav, header, footer, script, style').forEach(el => el.remove());
        const text = root.querySelector('article')?.text ?? root.text;
        const cleaned = text.replace(/\s+/g, ' ').trim();

        if (!cleaned) continue;

        const metadata = {
          sourceId: 'techdocs',
          kind,
          ref: `${kind}:${namespace}/${name}`,
          title: entity.metadata.title ?? name,
          url,
        };

        chunks.push(...chunkText(cleaned, metadata));
        this.#logger.debug(`Indexed TechDocs for ${kind}:${namespace}/${name}`);
      } catch (e) {
        this.#logger.warn(
          `Failed to fetch TechDocs for ${kind}:${namespace}/${name}: ${e}`,
        );
      }
    }

    return chunks;
  }
}
