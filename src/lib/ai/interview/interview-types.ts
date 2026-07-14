import { z } from "zod";

import {
  InterviewCategorySchema,
  InterviewDocumentSchema,
  InterviewExtractionMetadataSchema,
  InterviewQuestionSchema,
  InterviewTopicSchema,
} from "./interview-schema";

// Public types, derived from interview-schema.ts's Zod schemas — this file
// is the canonical place other future milestones import these names from.
export type InterviewCategory = z.infer<typeof InterviewCategorySchema>;
export type InterviewTopic = z.infer<typeof InterviewTopicSchema>;
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;
export type InterviewExtractionMetadata = z.infer<typeof InterviewExtractionMetadataSchema>;
export type InterviewDocument = z.infer<typeof InterviewDocumentSchema>;

// `extract(file)`'s public return type — an alias of InterviewDocument.
// Kept as a distinct exported name because it's what future milestones
// will import when calling the service, while InterviewDocument/
// InterviewDocumentSchema stay the validation-layer's own naming.
export type InterviewExtractionResult = InterviewDocument;

/** A single upload, mirroring ingestion/resume's RawFileInput shape. */
export interface InterviewUploadInput {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

// --- Internal working types (never part of the public output schema) ---
// These carry line-position information needed to resolve "which topic is
// this question under," which the public InterviewQuestion/InterviewTopic
// shapes above don't need to expose.

/** A heading/topic line found anywhere in the document, with its position. */
export interface DetectedTopic {
  topic: string;
  lineIndex: number;
  confidence: number;
}

/** A question + whatever answer text (if any) followed it, before topic/category resolution. */
export interface ExtractedQuestionBlock {
  question: string;
  answer: string;
  lineIndex: number;
  order: number;
  confidence: number;
}

export const DEFAULT_TOPIC = "General";
export const DEFAULT_CATEGORY = "General";
