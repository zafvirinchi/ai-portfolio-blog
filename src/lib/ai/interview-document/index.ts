import { InterviewUploadInput } from "../interview/interview-types";
import { loadDocument } from "../ingestion/document-loader";
import { parseDocumentLayout, LayoutLine } from "./layout-parser";
import { detectQuestions, DetectedQuestion } from "./question-detector";
import { detectAnswers } from "./answer-detector";
import { detectTopics } from "./topic-detector";
import { normalizeQuestions, DocumentQuestion } from "./interview-normalizer";
import { validateQuestions, RemovedQuestion } from "./document-validator";
import { computeQualityReport, QualityReport } from "./interview-quality";
import { extractPdfImages } from "./pdf-image-extractor";
import { attachDiagrams } from "./diagram-attacher";

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

    // Independent of each other — diagram extraction only needs
    // questions/lines (from layout parsing), not the normalized/reformatted
    // answer text — so running them concurrently instead of one-after-the-
    // other roughly halves this stage's wall-clock time. Both matter for
    // staying under the serverless function's execution time limit.
    const [normalized, diagramUrls] = await Promise.all([
      normalizeQuestions(questions, answers, topics, input.filename),
      this.extractDiagramsIfPdf(input, lines, questions),
    ]);

    diagramUrls?.forEach((url, questionIndex) => {
      if (normalized[questionIndex]) {
        normalized[questionIndex].diagramUrl = url;
      }
    });

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

  /**
   * For PDFs only: extracts embedded images and figures out which question
   * each belongs to (see diagram-attacher.ts), returning questionIndex ->
   * diagram URL. Runs independently of normalizeQuestions() (see process())
   * — deliberately doesn't touch a DocumentQuestion[], so it has nothing to
   * race with the concurrent normalization pass over the same array. A
   * failure here (unsupported PDF structure, storage error, etc.) never
   * fails the whole import — it just leaves diagramUrl unset, same
   * isolation principle as answer generation.
   */
  private async extractDiagramsIfPdf(
    input: InterviewUploadInput,
    lines: LayoutLine[],
    questions: DetectedQuestion[]
  ): Promise<Map<number, string> | null> {
    const loaded = loadDocument(input);

    if (loaded.format !== "pdf") {
      return null;
    }

    try {
      const images = await extractPdfImages(loaded.buffer);

      if (images.length === 0) {
        return null;
      }

      const documentSlug = input.filename.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const diagramUrls = await attachDiagrams(lines, questions, images, documentSlug);

      console.log(`${LOG_PREFIX} Diagrams Attached`, { filename: input.filename, count: diagramUrls.size });

      return diagramUrls;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Diagram extraction failed, continuing without diagrams`, {
        filename: input.filename,
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
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
export {
  normalizeQuestions,
  generateDocumentAnswer,
  formatGeneratedAnswer,
  reformatPreservedAnswer,
} from "./interview-normalizer";
export type { ValidationResult, RemovedQuestion } from "./document-validator";
export { validateQuestions } from "./document-validator";
export type { QualityReport } from "./interview-quality";
export { computeQualityReport } from "./interview-quality";
