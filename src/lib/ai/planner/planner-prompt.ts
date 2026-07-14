import type OpenAI from "openai";
import { ChatMessage } from "@/types/ai";
import { PLANNER_INTENTS, PLANNER_TOOLS } from "./planner-schema";

type PlannerIntent = (typeof PLANNER_INTENTS)[number];
type PlannerTool = (typeof PLANNER_TOOLS)[number];
type PlannerMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const INTENT_DESCRIPTIONS: Record<PlannerIntent, string> = {
  project:
    "Questions about Zafrul's projects, client work, applications, or systems he has built.",
  blog: "Questions about Zafrul's blog posts or articles.",
  interview:
    "Requests for interview questions, mock interview prep, or Q&A style technical prep content — including specific technical interview topics such as Java, Spring/Spring Boot, Angular, React, Node, databases/SQL, Kafka, coding questions, system design, and behavioral interview questions.",
  resume:
    "Requests for Zafrul's resume/CV/work history, OR questions about an uploaded resume — ATS score, skill gaps, strengths/weaknesses, career level, suitable roles, or improvement suggestions.",
  certification: "Questions about Zafrul's certifications or certificates.",
  rag: "General knowledge about Zafrul (skills, experience, background), greetings, or anything that does not clearly match another category.",
};

const TOOL_BY_INTENT: Record<PlannerIntent, PlannerTool> = {
  project: "project-tool",
  blog: "blog-tool",
  interview: "interview-tool",
  resume: "resume-tool",
  certification: "certification-tool",
  rag: "rag-tool",
};

function buildSystemPrompt(): string {
  const catalogue = PLANNER_INTENTS.map(
    (intent) =>
      `- ${intent} -> ${TOOL_BY_INTENT[intent]}: ${INTENT_DESCRIPTIONS[intent]}`
  ).join("\n");

  return `
You are the routing planner for Zafrul Islam's AI portfolio assistant.

Your ONLY job is to classify the user's latest question into exactly one
intent and its matching tool. You must NEVER answer the user's question,
and you must NEVER produce any text or explanation outside the required
structured output fields.

Available intents and tools:
${catalogue}

Rules:
1. Pick exactly one intent and its exact matching tool from the list above.
2. "confidence" is a number between 0 and 1 representing how sure you are.
3. If the question is ambiguous, general, a greeting, or does not clearly
   match a specific category, choose "rag" with a lower confidence.
4. "reason" must be a short, single-sentence explanation of your choice.
`.trim();
}

export function buildPlannerMessages(
  question: string,
  history: ChatMessage[]
): PlannerMessage[] {

  const messages: PlannerMessage[] = [
    { role: "system", content: buildSystemPrompt() },
  ];

  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({
    role: "user",
    content: `Classify this question:\n\n${question}`,
  });

  return messages;

}
