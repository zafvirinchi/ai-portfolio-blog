export type AgentIntent =
  | "rag"
  | "project"
  | "blog"
  | "interview"
  | "resume"
  | "certification";

export interface AgentPlan {
  intent: AgentIntent;
  tool: string;
  confidence: number;
  reason: string;
}

export interface AgentSource {
  id?: string;
  documentId?: string;
  similarity?: number;
}

export interface AgentResponse {
  answer: string;
  tool: string;
  intent: AgentIntent;
  sources: AgentSource[];
}
