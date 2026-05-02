import fs from 'node:fs/promises';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import { LoggerService } from '@backstage/backend-plugin-api';
import { chunkText, Chunk } from './Chunker';

export interface CustomSourceConfig {
  id: string;
  name: string;
  target: string; // URL or absolute file path
}

export class CustomRagSource {
  readonly #logger: LoggerService;

  constructor(logger: LoggerService) {
    this.#logger = logger;
  }

  async fetchChunks(source: CustomSourceConfig): Promise<Chunk[]> {
    const text = source.target.startsWith('http')
      ? await this.#fetchUrl(source.target)
      : await this.#fetchFile(source.target);

    if (!text) return [];

    const metadata = {
      sourceId: source.id,
      title: source.name,
      target: source.target,
    };

    return chunkText(text, metadata);
  }

  async #fetchUrl(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      this.#logger.warn(`Custom source fetch failed for ${url}: ${response.status}`);
      return '';
    }
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();

    if (contentType.includes('html')) {
      const root = parse(raw);
      root.querySelectorAll('nav, header, footer, script, style').forEach(el => el.remove());
      return (root.querySelector('main, article, body')?.text ?? root.text)
        .replace(/\s+/g, ' ')
        .trim();
    }
    return raw;
  }

  async #fetchFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      this.#logger.warn(`Custom source file read failed for ${filePath}: ${e}`);
      return '';
    }
  }
}
