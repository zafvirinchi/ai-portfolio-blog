import { openai } from "../openai";
import { usageFeatureOverrideContext } from "../usage/usage-context";
import { buildReviewMessages } from "./agent-prompts";
import { REVIEW_JSON_SCHEMA, reviewOutputSchema, ReviewOutput } from "./agent-response";

const REVIEWER_MODEL = "gpt-4o-mini";

/**
 * Reviews draft context for hallucination risk, contradictions, missing
 * references, confidence, and response quality. Returns a review only —
 * never rewrites the context itself.
 */
export class ReviewerAgent {
  async run(question: string, context: string): Promise<ReviewOutput> {
    // Phase 14 Milestone 4 — relabels this agent's own openai call as
    // MULTI_AGENT_REVIEW (distinct from research/summarizer).
    const completion = await usageFeatureOverrideContext.run({ feature: "MULTI_AGENT_REVIEW" }, () =>
      openai.chat.completions.create({
        model: REVIEWER_MODEL,
        temperature: 0,
        messages: buildReviewMessages(question, context),
        response_format: {
          type: "json_schema",
          json_schema: REVIEW_JSON_SCHEMA,
        },
      })
    );

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Reviewer agent returned no content");
    }

    const parsed = reviewOutputSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Reviewer agent output failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}

export const reviewerAgent = new ReviewerAgent();
