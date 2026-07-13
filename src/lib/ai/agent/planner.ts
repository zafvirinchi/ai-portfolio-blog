import { containsKeyword } from "../knowledge/utils";
import { AgentIntent, AgentPlan } from "./agent-response";

// Narrow interface so a LangGraph-based planner can replace KeywordPlanner without touching callers.
export interface Planner {
  plan(question: string): Promise<AgentPlan> | AgentPlan;
}

interface IntentRule {
  intent: AgentIntent;
  tool: string;
  priority: number;
  keywords: string[];
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: "project",
    tool: "project-tool",
    priority: 100,
    keywords: [
      "project",
      "projects",
      "client",
      "clients",
      "application",
      "system",
      "implementation",
      "work",
    ],
  },
  {
    intent: "blog",
    tool: "blog-tool",
    priority: 90,
    keywords: ["blog", "blogs", "article", "articles", "post", "posts"],
  },
  {
    intent: "interview",
    tool: "interview-tool",
    priority: 85,
    keywords: [
      "interview",
      "interview question",
      "interview questions",
      "mock interview",
      "qa round",
    ],
  },
  {
    intent: "resume",
    tool: "resume-tool",
    priority: 85,
    keywords: ["resume", "cv", "curriculum vitae"],
  },
  {
    intent: "certification",
    tool: "certification-tool",
    priority: 85,
    keywords: [
      "certification",
      "certifications",
      "certificate",
      "certificates",
      "certified",
      "badge",
    ],
  },
  {
    intent: "rag",
    tool: "rag-tool",
    priority: 1,
    keywords: [],
  },
];

const FALLBACK_RULE = INTENT_RULES[INTENT_RULES.length - 1];

export class KeywordPlanner implements Planner {
  plan(question: string): AgentPlan {
    let best: IntentRule = FALLBACK_RULE;
    let bestScore = 0;

    for (const rule of INTENT_RULES) {
      let score = 0;

      for (const keyword of rule.keywords) {
        if (containsKeyword(question, [keyword])) {
          score += rule.priority;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = rule;
      }
    }

    return {
      intent: best.intent,
      tool: best.tool,
      confidence: bestScore > 0 ? Math.min(1, bestScore / 100) : 0,
      reason:
        bestScore > 0
          ? `Matched "${best.intent}" keywords`
          : "No keyword match; defaulting to RAG",
    };
  }
}

export const planner: Planner = new KeywordPlanner();
