import { RagToolResult } from "@/types/tool-result";

export class SourceBuilder {

  build(chunks: RagToolResult["chunks"]) {

    if (!chunks.length) {

      return [];

    }

    return chunks.map(chunk => ({

      id: chunk.id,

      documentId: chunk.document_id,

      similarity: chunk.similarity

    }));

  }

}

export const sourceBuilder =
  new SourceBuilder();