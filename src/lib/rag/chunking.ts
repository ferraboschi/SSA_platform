// Document chunking — splits documents into overlapping windows for embedding.
// Paragraph-aware: prefers breaking on blank lines, falls back to hard windows.

import type { RagChunk, RagDocument } from "./types";

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  maxChars: 900,
  overlapChars: 150,
};

export function chunkDocument(
  doc: RagDocument,
  options: ChunkOptions = {},
): RagChunk[] {
  const { maxChars, overlapChars } = { ...DEFAULTS, ...options };
  const paragraphs = doc.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const windows: string[] = [];
  let buffer = "";

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) windows.push(trimmed);
    buffer = "";
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      flush();
      for (let i = 0; i < para.length; i += maxChars - overlapChars) {
        windows.push(para.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if (buffer.length + para.length + 2 > maxChars) flush();
    buffer = buffer ? `${buffer}\n\n${para}` : para;
  }
  flush();

  return windows.map((text, index) => ({
    id: `${doc.id}::${index}`,
    docId: doc.id,
    index,
    text,
    title: doc.title,
    source: doc.source,
    lang: doc.lang,
    metadata: doc.metadata,
  }));
}
