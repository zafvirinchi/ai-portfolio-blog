import { searchRagContext } from "../retrieval";
import { buildContext } from "../context";

import { RagKnowledgeResult } from "./types";

export class RagKnowledgeService {

  async search(
    question: string
  ): Promise<RagKnowledgeResult> {

    const chunks =
      await searchRagContext(question);

    return {

      chunks,

      context: buildContext(chunks),

    };

  }

}

export const ragKnowledge =
  new RagKnowledgeService();