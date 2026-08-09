import { openai } from "../openai";
import { usageFeatureOverrideContext } from "../usage/usage-context";
import { buildSummaryMessages } from "./agent-prompts";
import {
  ResearchOutput,
  ReviewOutput,
  SUMMARY_JSON_SCHEMA,
  summaryOutputSchema,
  SummaryOutput,
} from "./agent-response";

const SUMMARIZER_MODEL = "gpt-4o-mini";

export interface SummarizerInput {
  question: string;
  context: string;
  research?: ResearchOutput;
  review?: ReviewOutput;
}

/**
 * Merges research output, review output, and the retrieved context into
 * one clean context block for PortfolioChain. Never answers the question
 * directly — its output is context, not a response.
 */
export class SummarizerAgent {
  async run(input: SummarizerInput): Promise<SummaryOutput> {
    // Phase 14 Milestone 4 — relabels this agent's own openai call as
    // MULTI_AGENT_SUMMARY (distinct from research/reviewer).
    const completion = await usageFeatureOverrideContext.run({ feature: "MULTI_AGENT_SUMMARY" }, () =>
      openai.chat.completions.create({
        model: SUMMARIZER_MODEL,
        temperature: 0,
        messages: buildSummaryMessages(input),
        response_format: {
          type: "json_schema",
          json_schema: SUMMARY_JSON_SCHEMA,
        },
      })
    );

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Summarizer agent returned no content");
    }

    const parsed = summaryOutputSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Summarizer agent output failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}

export const summarizerAgent = new SummarizerAgent();
