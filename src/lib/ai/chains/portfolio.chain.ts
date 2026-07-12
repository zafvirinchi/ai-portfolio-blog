import { llm } from "../langchain";
import { portfolioPrompt } from "../prompt";

import { buildContext } from "../context";
import { searchRagContext } from "../retrieval";

import { ChatMessage, RagChunk } from "@/types/ai";


export interface PortfolioChainResponse {
  answer: string;
  chunks: RagChunk[];
}

export class PortfolioChain {
  async invoke(
    question: string,
    history: ChatMessage[] = [],
    context?: string
  ): Promise<PortfolioChainResponse> {

    const chunks =
      context === undefined
        ? await searchRagContext(question)
        : [];

    const resolvedContext =
      context ?? buildContext(chunks);

    const prompt = await portfolioPrompt.formatMessages({
      question,
      context: resolvedContext,
      history,
    });

    const response = await llm.invoke(prompt);

    return {
      answer:
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content),

      chunks,
    };
  }
}

export const portfolioChain = new PortfolioChain();