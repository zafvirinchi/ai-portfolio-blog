import { llm } from "../langchain";
import { portfolioPrompt, prepareContextForPrompt } from "../prompt";

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

    // Phase 13 Milestone 24 — the only change in this file: the context
    // string is no longer interpolated into the prompt as-is. See
    // ../prompt.ts's prepareContextForPrompt() for what this does and
    // why (trusted Phase 9 directive preserved as an instruction,
    // everything else delimited as untrusted data) and
    // PHASE13_MILESTONE24_PORTFOLIOCHAIN_CONTEXT_SECURITY.md for the
    // full trust-boundary analysis. No other behavior in this class
    // changed — same model, same temperature (inherited from `llm`),
    // same single LLM call, same public invoke() signature/return shape.
    const preparedContext = prepareContextForPrompt(resolvedContext);

    const prompt = await portfolioPrompt.formatMessages({
      question,
      context: preparedContext,
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