export interface Chunk {
  text: string;
  metadata: Record<string, string>;
}

export function chunkText(
  text: string,
  metadata: Record<string, string>,
  chunkSize = 512,
  overlap = 64,
): Chunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: Chunk[] = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const slice = words.slice(i, i + chunkSize).join(' ');
    if (slice.trim()) {
      chunks.push({ text: slice, metadata });
    }
    if (i + chunkSize >= words.length) break;
  }

  return chunks;
}
