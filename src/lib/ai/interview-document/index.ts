import { InterviewUploadInput } from "../interview/interview-types";
import { parseDocumentLayout } from "./layout-parser";
import { detectQuestions } from "./question-detector";
import { detectAnswers } from "./answer-detector";
import { detectTopics } from "./topic-detector";
import { normalizeQuestions, DocumentQuestion } from "./interview-normalizer";
import { validateQuestions, RemovedQuestion } from "./document-validator";
import { computeQualityReport, QualityReport } from "./interview-quality";

const LOG_PREFIX = "[interview-document]";

export interface InterviewDocumentResult {
  filename: string;
  questions: DocumentQuestion[];
  removed: RemovedQuestion[];
  quality: QualityReport;
}

/**
 * Orchestrates the full Interview Document Intelligence pipeline: Layout
 * Extraction -> Question Detection -> Answer Boundary Detection -> Category
 * Detection (reused from ../interview, unchanged) -> Topic Detection ->
 * Preserve Original Answer / Generate Missing Answer -> Validation ->
 * Quality Score. Produces a reviewable question list — it does NOT write
 * to the database; that's interview-import's job, invoked separately once
 * an admin has reviewed and approved this output (see Admin Review).
 */
export class InterviewDocumentService {
  async process(input: InterviewUploadInput): Promise<InterviewDocumentResult> {
    const lines = await parseDocumentLayout(input);
    console.log(`${LOG_PREFIX} Layout Parsed`, { filename: input.filename, lineCount: lines.length });

    const questions = detectQuestions(lines);
    console.log(`${LOG_PREFIX} Questions Detected`, { filename: input.filename, count: questions.length });

    const answers = detectAnswers(lines, questions);

    const topics = detectTopics(lines);
    console.log(`${LOG_PREFIX} Topics Extracted`, { filename: input.filename, count: topics.length });

    const normalized = await normalizeQuestions(questions, answers, topics, input.filename);

    const { valid, removed } = validateQuestions(normalized);

    const quality = computeQualityReport(valid, removed);
    console.log(`${LOG_PREFIX} Import Ready`, {
      filename: input.filename,
      questionCount: valid.length,
      qualityScore: quality.qualityScore,
    });

    return {
      filename: input.filename,
      questions: valid,
      removed,
      quality,
    };
  }
}

export const interviewDocumentService = new InterviewDocumentService();

export type { LayoutLine } from "./layout-parser";
export { parseLayout, parseDocumentLayout } from "./layout-parser";
export type { DetectedQuestion } from "./question-detector";
export { detectQuestions } from "./question-detector";
export type { DetectedAnswer } from "./answer-detector";
export { detectAnswers } from "./answer-detector";
export type { DetectedTopic } from "./topic-detector";
export { detectTopics, findTopicForLine, isKnownTopicHeading } from "./topic-detector";
export type { DocumentQuestion, AnswerSource, GeneratedAnswer } from "./interview-normalizer";
export { normalizeQuestions, generateDocumentAnswer, formatGeneratedAnswer } from "./interview-normalizer";
export type { ValidationResult, RemovedQuestion } from "./document-validator";
export { validateQuestions } from "./document-validator";
export type { QualityReport } from "./interview-quality";
export { computeQualityReport } from "./interview-quality";
