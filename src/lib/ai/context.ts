import { RagChunk } from "@/types/ai";

export function buildContext(
  chunks: RagChunk[]
): string {
  if (!chunks.length) {
    return "";
  }

  return chunks
    .map(
      (chunk, index) => `
========== Context ${index + 1} ==========
${chunk.chunk_text}
`
    )
    .join("\n\n");
}