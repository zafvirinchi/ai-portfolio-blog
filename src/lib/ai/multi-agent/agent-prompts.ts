import type OpenAI from "openai";

import { ResearchOutput, ReviewOutput } from "./agent-response";

type AgentMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// Each specialist agent gets its own independent system prompt — none of
// these reuse or call `lib/ai/prompt.ts` (PortfolioChain's prompt). These
// agents never produce user-facing text; they only analyze/merge context
// for PortfolioChain to answer from.

export function buildResearchMessages(question: string, context: string): AgentMessage[] {
  return [
    {
      role: "system",
      content: `You are a research analyst. You are given a user's question and the
context that was retrieved to answer it. Your ONLY job is to analyze that
context for gaps — you never answer the question yourself.

Identify:
- missingInformation: facts the question needs that the context doesn't cover.
- inconsistencies: places where the context contradicts itself.
- unsupportedClaims: statements in the context that aren't backed by specifics.
- suggestedEvidence: what additional evidence (if any) would strengthen the context.

Return empty arrays for any category with nothing to report — do not invent
issues that aren't there.`,
    },
    {
      role: "user",
      content: `Question:\n${question}\n\nRetrieved context:\n${context || "(no context retrieved)"}`,
    },
  ];
}

export function buildReviewMessages(question: string, context: string): AgentMessage[] {
  return [
    {
      role: "system",
      content: `You are a quality reviewer. You are given a user's question and a draft
context that will be used to answer it. Your ONLY job is to review that
context — you never rewrite or answer it yourself.

Assess:
- hallucinationRisk: "low", "medium", or "high" — how likely is an answer
  built from this context to state something not actually supported by it?
- contradictions: any internal contradictions in the context.
- missingReferences: claims that should cite a source/project/document but don't.
- confidence: your confidence (0 to 1) that this context is sufficient and
  accurate for answering the question.
- qualityNotes: brief notes on overall response quality this context would support.

Return empty arrays for any category with nothing to report.`,
    },
    {
      role: "user",
      content: `Question:\n${question}\n\nDraft context:\n${context || "(no context retrieved)"}`,
    },
  ];
}

export function buildSummaryMessages(input: {
  question: string;
  context: string;
  research?: ResearchOutput;
  review?: ReviewOutput;
}): AgentMessage[] {
  const parts: string[] = [`Question:\n${input.question}`, `Retrieved context:\n${input.context || "(none)"}`];

  if (input.research) {
    parts.push(`Research findings:\n${JSON.stringify(input.research, null, 2)}`);
  }

  if (input.review) {
    parts.push(`Review findings:\n${JSON.stringify(input.review, null, 2)}`);
  }

  return [
    {
      role: "system",
      content: `You are a context synthesizer. You are given retrieved context plus
findings from a research pass and/or a review pass. Your ONLY job is to
merge all of this into ONE clean, well-organized context block that a
separate answering system will use — you never answer the question
yourself.

Rules:
- Preserve every fact from the retrieved context — never drop information.
- If research findings mention missing information or unsupported claims,
  note them briefly so the answering system can be appropriately cautious,
  but do not invent the missing facts.
- If review findings flag contradictions or hallucination risk, resolve
  contradictions where possible using the retrieved context as the source
  of truth, and flag anything unresolved.
- If the retrieved context contains any special instructions about how to
  answer (for example, a directive about answering on behalf of a specific
  candidate/entity), preserve that directive verbatim at the top of your
  output — never remove or reword it.
- Keep it concise. Do not add commentary about your own process.`,
    },
    {
      role: "user",
      content: parts.join("\n\n"),
    },
  ];
}
