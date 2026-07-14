import { z } from "zod";

// Runtime validation for the Interview Document Extraction Pipeline.
// Every record produced by question-parser.ts/topic-detector.ts/
// category-detector.ts is validated here before it's allowed into the
// final InterviewExtractionResult — malformed records are rejected
// individually (see interview-service.ts), never silently accepted.

export const InterviewCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const InterviewTopicSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const InterviewQuestionSchema = z.object({
  category: z.string().min(1),
  topic: z.string().min(1),
  question: z.string().min(1),
  // Missing answers are valid and expected — never invented, see
  // question-parser.ts's answer-extraction rule.
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  // 1-indexed, per spec: "Question 1 -> Order = 1".
  order: z.number().int().min(1),
  documentName: z.string().min(1),
});

export const InterviewExtractionMetadataSchema = z.object({
  questionCount: z.number().int().min(0),
  topicCount: z.number().int().min(0),
  categoryCount: z.number().int().min(0),
  answerCount: z.number().int().min(0),
  emptyAnswerCount: z.number().int().min(0),
  processingTimeMs: z.number().min(0),
});

export const InterviewDocumentSchema = z.object({
  filename: z.string().min(1),
  categories: z.array(InterviewCategorySchema),
  topics: z.array(InterviewTopicSchema),
  questions: z.array(InterviewQuestionSchema),
  metadata: InterviewExtractionMetadataSchema,
  // Structured, non-fatal issues encountered during extraction (unsupported
  // format, empty document, no questions found, rejected malformed
  // records) — see "ERROR HANDLING" in interview-service.ts. Empty when
  // extraction found nothing to complain about.
  errors: z.array(z.string()),
});
