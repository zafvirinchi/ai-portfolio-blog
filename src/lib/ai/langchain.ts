import { ChatOpenAI } from "@langchain/openai";

export const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o-mini",
  temperature: 0.35,
  maxTokens: 1200,
  timeout: 60000,
  maxRetries: 2,
});