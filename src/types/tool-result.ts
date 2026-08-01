/**
 * A stored interview answer that matches the user's question closely enough
 * (see interview-chat/interview-exact-match.ts) to be returned verbatim
 * instead of being paraphrased by the LLM generation step.
 */
export interface ExactInterviewAnswer {
  question: string;
  answer: string;
  diagramUrl?: string | null;
  diagramCaption?: string | null;
  codeExample?: string | null;
  codeLanguage?: string | null;
}

export interface RagToolResult {
  context: string;
  chunks: {
    id?: string;
    document_id?: string;
    similarity?: number;
  }[];
  exactAnswer?: ExactInterviewAnswer;
}

export interface DatabaseToolResult {
  rows: unknown[];
}