import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly #client: OpenAI;
  readonly #model: string;

  constructor(options: {
    apiToken: string;
    apiBaseUrl?: string;
    model?: string;
  }) {
    this.#client = new OpenAI({
      apiKey: options.apiToken,
      baseURL: options.apiBaseUrl,
    });
    this.#model = options.model ?? 'text-embedding-3-small';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.#client.embeddings.create({
      model: this.#model,
      input: texts,
    });
    return response.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  }
}

// ── Google ────────────────────────────────────────────────────────────────────

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  readonly #client: GoogleGenAI;
  readonly #model: string;

  constructor(options: { apiToken: string; model?: string }) {
    this.#client = new GoogleGenAI({ apiKey: options.apiToken });
    this.#model = options.model ?? 'text-embedding-004';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(
      texts.map(text =>
        this.#client.models.embedContent({
          model: this.#model,
          contents: text,
        }),
      ),
    );
    return results.map(r => r.embeddings?.[0]?.values ?? []);
  }
}

// ── Anthropic (no native embedding — falls back to OpenAI-compatible) ─────────

export class AnthropicEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(options: { apiToken: string; apiBaseUrl?: string }) {
    super({
      apiToken: options.apiToken,
      apiBaseUrl: options.apiBaseUrl ?? 'https://api.anthropic.com/v1',
      model: 'text-embedding-3-small',
    });
  }
}
