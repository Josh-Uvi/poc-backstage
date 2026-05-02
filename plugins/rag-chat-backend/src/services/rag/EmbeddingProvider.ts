import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  readonly #client: GoogleGenerativeAI;
  readonly #model: string;

  constructor(options: { apiToken: string; model?: string }) {
    this.#client = new GoogleGenerativeAI(options.apiToken);
    this.#model = options.model ?? 'text-embedding-004';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const model = this.#client.getGenerativeModel({ model: this.#model });
    const results = await Promise.all(
      texts.map(t => model.embedContent(t)),
    );
    return results.map(r => r.embedding.values);
  }
}

// ── Anthropic (no native embedding — falls back to OpenAI-compatible) ─────────

export class AnthropicEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(options: { apiToken: string; apiBaseUrl?: string }) {
    // Anthropic doesn't have a native embedding API yet;
    // use the OpenAI-compatible endpoint if a custom baseURL is provided,
    // otherwise callers should configure a separate embedding model.
    super({
      apiToken: options.apiToken,
      apiBaseUrl: options.apiBaseUrl ?? 'https://api.anthropic.com/v1',
      model: 'text-embedding-3-small',
    });
  }
}
