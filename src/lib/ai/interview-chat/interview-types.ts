/** A candidate row fetched from the existing interview_questions table, joined with its topic/category. */
export interface InterviewCandidate {
  id: string;
  topicId: string;
  question: string;
  answer: string;
  level: string;
  tags: string[];
  codeExample: string | null;
  codeLanguage: string | null;
  topicTitle: string;
  categoryTitle: string;
}

export interface RankedInterviewCandidate extends InterviewCandidate {
  score: number;
}

/** Rich, UI-friendly source attribution — richer than the generic AgentSource
 *  shape (id/documentId/similarity) the existing tool pipeline carries, so
 *  it's surfaced separately. See interview-chat-service.ts. */
export interface InterviewSourceSummary {
  category: string;
  topic: string;
  question: string;
  difficulty: string;
}

export interface InterviewSearchResult {
  context: string;
  sources: InterviewSourceSummary[];
}
