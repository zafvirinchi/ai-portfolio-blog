import { openai } from "../openai";
import { ChatMessage } from "@/types/ai";
import { planner as keywordPlanner } from "../agent/planner";
import { AgentPlan } from "../agent/agent-response";
import { buildPlannerMessages } from "./planner-prompt";
import {
  plannerOutputSchema,
  PLANNER_JSON_SCHEMA,
  PLANNER_CONFIDENCE_THRESHOLD,
} from "./planner-schema";

const PLANNER_MODEL = "gpt-4o-mini";

function applyConfidenceFallback(plan: AgentPlan): AgentPlan {

  if (plan.confidence >= PLANNER_CONFIDENCE_THRESHOLD) {
    return plan;
  }

  return {
    intent: "rag",
    tool: "rag-tool",
    confidence: plan.confidence,
    reason: `Confidence ${plan.confidence.toFixed(
      2
    )} is below the ${PLANNER_CONFIDENCE_THRESHOLD} threshold; falling back to rag-tool. Original reason: ${plan.reason}`,
  };

}

export class PlannerService {

  async plan(
    question: string,
    history: ChatMessage[] = []
  ): Promise<AgentPlan> {

    try {

      const completion = await openai.chat.completions.create({
        model: PLANNER_MODEL,
        temperature: 0,
        messages: buildPlannerMessages(question, history),
        response_format: {
          type: "json_schema",
          json_schema: PLANNER_JSON_SCHEMA,
        },
      });

      const raw = completion.choices[0]?.message?.content;

      if (!raw) {
        throw new Error("Planner LLM returned no content");
      }

      const parsed = plannerOutputSchema.safeParse(JSON.parse(raw));

      if (!parsed.success) {
        throw new Error(
          `Planner LLM output failed schema validation: ${parsed.error.message}`
        );
      }

      return applyConfidenceFallback(parsed.data);

    } catch (error) {

      console.error(
        "PlannerService: LLM planning failed, falling back to keyword planner.",
        error
      );

      const fallback = await keywordPlanner.plan(question);

      return applyConfidenceFallback(fallback);

    }

  }

}

export const plannerService = new PlannerService();
