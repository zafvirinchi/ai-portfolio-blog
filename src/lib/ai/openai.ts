import OpenAI from "openai";

import { meterOpenAiClient } from "./usage/usage-meter";

// Phase 14 Milestone 4 — meterOpenAiClient() wraps .chat.completions.create()/
// .embeddings.create() in place (same public shape, same thrown errors);
// every one of this file's existing callers is unchanged. See
// src/lib/ai/usage/usage-meter.ts.
export const openai = meterOpenAiClient(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  })
);