/**
 * A question as it arrives for import. Milestone 1's fields (category,
 * topic, question, answer, ...) are required; Milestone 2's AI-enrichment
 * fields are all optional here too, matching how they're optional on
 * EnrichedInterviewQuestion — so this type structurally accepts BOTH a
 * plain Milestone 1 InterviewExtractionResult (enrichment fields entirely
 * absent) and a Milestone 2 EnrichedInterviewDocument (enrichment fields
 * present) with no cast needed at the call site, and without this package
 * needing a runtime dependency on either of those packages' types.
 */
export interface ImportableQuestion {
  category: string;
  topic: string;
  question: string;
  answer: string;
  confidence: number;
  order: number;
  documentName: string;
  difficulty?: string;
  experienceLevel?: string;
  codeExample?: string;
  bestPractices?: string[];
  followUpQuestions?: string[];
  tags?: string[];
  importantConcepts?: string[];
  commonMistakes?: string[];
}

export interface ImportableDocument {
  filename: string;
  questions: ImportableQuestion[];
}

export interface ImportDuplicate {
  category: string;
  topic: string;
  question: string;
  reason: "duplicate-question" | "invalid-record";
}

export interface ImportResult {
  createdCategories: number;
  existingCategories: number;
  createdTopics: number;
  existingTopics: number;
  importedQuestions: number;
  skippedQuestions: number;
  duplicates: ImportDuplicate[];
  processingTimeMs: number;
}

/** Minimal row shapes read back from the existing tables — only what duplicate detection and FK linkage need. */
export interface CategoryRow {
  id: string;
  slug: string;
  title: string;
}

export interface TopicRow {
  id: string;
  category_id: string;
  slug: string;
  title: string;
}

export interface QuestionRow {
  id: string;
  topic_id: string;
  question: string;
}
