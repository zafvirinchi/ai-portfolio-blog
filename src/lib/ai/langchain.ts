import { ChatOpenAI } from "@langchain/openai";

import { meterChatModel } from "./usage/usage-meter";

const LLM_MODEL = "gpt-4o-mini";

// Phase 14 Milestone 4 — meterChatModel() wraps .invoke() in place
// (same public shape, same thrown errors); PortfolioChain's existing
// llm.invoke() call is unchanged. See src/lib/ai/usage/usage-meter.ts.
export const llm = meterChatModel(
  new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: LLM_MODEL,
    temperature: 0.35,
    maxTokens: 1200,
    timeout: 60000,
    maxRetries: 2,
  }),
  LLM_MODEL
);