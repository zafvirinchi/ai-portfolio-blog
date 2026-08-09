import { openai } from "../openai";
import { usageFeatureOverrideContext } from "../usage/usage-context";
import { buildResearchMessages } from "./agent-prompts";
import { RESEARCH_JSON_SCHEMA, researchOutputSchema, ResearchOutput } from "./agent-response";

const RESEARCH_MODEL = "gpt-4o-mini";

/**
 * Reads retrieved context and flags gaps: missing information,
 * inconsistencies, unsupported claims, and evidence worth adding. Never
 * generates the final answer — that stays PortfolioChain's job.
 */
export class ResearchAgent {
  async run(question: string, context: string): Promise<ResearchOutput> {
    // Phase 14 Milestone 4 — relabels this agent's own openai call as
    // MULTI_AGENT_RESEARCH (distinct from reviewer/summarizer) for
    // usage-meter.ts, which transparently meters the call below either
    // way; this one line is the only difference the agents need.
    const completion = await usageFeatureOverrideContext.run({ feature: "MULTI_AGENT_RESEARCH" }, () =>
      openai.chat.completions.create({
        model: RESEARCH_MODEL,
        temperature: 0,
        messages: buildResearchMessages(question, context),
        response_format: {
          type: "json_schema",
          json_schema: RESEARCH_JSON_SCHEMA,
        },
      })
    );

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Research agent returned no content");
    }

    const parsed = researchOutputSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Research agent output failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}

export const researchAgent = new ResearchAgent();
