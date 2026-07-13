import { z } from "zod";

export const PLANNER_INTENTS = [
  "rag",
  "project",
  "blog",
  "interview",
  "resume",
  "certification",
] as const;

export const PLANNER_TOOLS = [
  "rag-tool",
  "project-tool",
  "blog-tool",
  "interview-tool",
  "resume-tool",
  "certification-tool",
] as const;

export const PLANNER_CONFIDENCE_THRESHOLD = 0.6;

export const plannerOutputSchema = z.object({
  intent: z.enum(PLANNER_INTENTS),
  tool: z.enum(PLANNER_TOOLS),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

// Hand-written mirror of plannerOutputSchema for OpenAI Structured Outputs.
// Kept separate (rather than derived) because strict-mode json_schema only
// supports a constrained subset of JSON Schema (no min/max on numbers).
export const PLANNER_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "planner_output",
  strict: true,
  schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: [...PLANNER_INTENTS] },
      tool: { type: "string", enum: [...PLANNER_TOOLS] },
      confidence: { type: "number" },
      reason: { type: "string" },
    },
    required: ["intent", "tool", "confidence", "reason"],
    additionalProperties: false,
  },
};
