import { extractDocumentText } from "./document-extractor";
import { detectTopics, isIgnorableLine } from "./topic-detector";
import { extractQuestions } from "./question-parser";
import { detectCategory } from "./category-detector";
import {
  InterviewCategorySchema,
  InterviewDocumentSchema,
  InterviewQuestionSchema,
  InterviewTopicSchema,
} from "./interview-schema";
import {
  DEFAULT_CATEGORY,
  DEFAULT_TOPIC,
  DetectedTopic,
  InterviewCategory,
  InterviewExtractionMetadata,
  InterviewExtractionResult,
  InterviewQuestion,
  InterviewTopic,
  InterviewUploadInput,
} from "./interview-types";
// Phase 11 Milestone 2 — optional post-extraction step, see extract()'s
// `options.generateAnswers`. Nothing above this line changed for
// Milestone 2; the extraction pipeline itself is untouched.
import { answerGenerationService } from "../interview-ai";

const LOG_PREFIX = "[interview-extractor]";

export interface ExtractOptions {
  /** When true, runs AnswerGenerationService over the extracted questions before returning. Defaults to false — identical to Milestone 1's behavior. */
  generateAnswers?: boolean;
}

const FALLBACK_TOPIC_CONFIDENCE = 0.5;

/** Nearest preceding topic heading for a given line, or DEFAULT_TOPIC if none precedes it. */
function findTopicForLine(topics: DetectedTopic[], lineIndex: number): DetectedTopic {
  let current: DetectedTopic = { topic: DEFAULT_TOPIC, lineIndex: -1, confidence: FALLBACK_TOPIC_CONFIDENCE };

  for (const topic of topics) {
    if (topic.lineIndex > lineIndex) {
      break;
    }

    current = topic;
  }

  return current;
}

// Only explicit, known-vocabulary topic headings (Java, Spring, Docker,
// etc. — topic-detector.ts's KNOWN_TOPIC_CONFIDENCE) are treated as hard
// section boundaries that close out whatever question is currently
// accumulating an answer. The generic heuristic ("short title-cased line")
// is far weaker and, in practice, matches labels/sub-headings that appear
// *inside* an answer's own body — "Answer", "Key Points", "Example",
// "3. Use DevTools" — none of which are real document sections. Letting
// those force-close an open question was truncating its answer exactly
// like the interrogative-keyword bug did. A heuristic topic can still be
// used to categorize a question (findTopicForLine looks at the full list
// regardless of what's claimed here) — it just can't cut an answer short.
const CLAIMED_TOPIC_CONFIDENCE_THRESHOLD = 0.98;

function buildClaimedLineIndexes(lines: string[], topics: DetectedTopic[]): Set<number> {
  const claimed = new Set<number>(
    topics
      .filter((topic) => topic.confidence >= CLAIMED_TOPIC_CONFIDENCE_THRESHOLD)
      .map((topic) => topic.lineIndex)
  );

  lines.forEach((line, index) => {
    if (isIgnorableLine(line)) {
      claimed.add(index);
    }
  });

  return claimed;
}

// Deterministic, pure slug — the same name always produces the same id,
// which is what keeps catalog de-duplication (and future unit tests)
// simple and predictable, unlike a randomly generated id would be.
function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "unknown";
}

function buildEmptyMetadata(processingTimeMs: number): InterviewExtractionMetadata {
  return {
    questionCount: 0,
    topicCount: 0,
    categoryCount: 0,
    answerCount: 0,
    emptyAnswerCount: 0,
    processingTimeMs,
  };
}

function buildErrorResult(
  filename: string,
  startedAt: number,
  errors: string[]
): InterviewExtractionResult {
  return {
    filename,
    categories: [],
    topics: [],
    questions: [],
    metadata: buildEmptyMetadata(Date.now() - startedAt),
    errors,
  };
}

/**
 * Orchestrates the Interview Document Extraction Pipeline:
 * load -> parse -> normalize -> detect topics -> extract questions ->
 * detect categories -> validate -> return structured records.
 *
 * Extraction only — no OpenAI calls, no embeddings, no database writes.
 * Missing answers are returned as empty strings, never invented.
 *
 * Error handling: expected/recoverable failures (unsupported format,
 * empty document, no questions found, a malformed record, an invalid
 * topic/category) are captured in the returned result's `errors` array
 * instead of being thrown, so a bad upload never crashes a caller that
 * forgot a try/catch. `extract()` only throws if the fully-assembled,
 * already-validated result itself somehow fails final validation — a
 * genuinely unexpected, fatal condition.
 *
 * Not a singleton: instantiate with `new InterviewExtractionService()`.
 * The class holds no state of its own — every method call is independent
 * — so there is nothing gained by sharing one instance, and not doing so
 * keeps this trivially easy to unit test in isolation.
 */
export class InterviewExtractionService {
  async extract(input: InterviewUploadInput, options?: ExtractOptions): Promise<InterviewExtractionResult> {
    const startedAt = Date.now();

    let normalizedText: string;

    try {
      normalizedText = await extractDocumentText(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load or parse document";

      console.log(`${LOG_PREFIX} Extraction Complete`, { filename: input.filename, success: false, message });

      return buildErrorResult(input.filename, startedAt, [message]);
    }

    const lines = normalizedText.split("\n");
    const errors: string[] = [];

    console.log(`${LOG_PREFIX} Extracting Topics`, { filename: input.filename });
    const detectedTopics = detectTopics(lines);

    const claimedLineIndexes = buildClaimedLineIndexes(lines, detectedTopics);

    console.log(`${LOG_PREFIX} Extracting Questions`, { filename: input.filename });
    const questionBlocks = extractQuestions(lines, claimedLineIndexes);

    if (questionBlocks.length === 0) {
      errors.push(`No questions found in "${input.filename}".`);
    }

    console.log(`${LOG_PREFIX} Extracting Categories`, { filename: input.filename });

    const topicConfidenceByName = new Map<string, number>();
    const topicCategoryByName = new Map<string, string>();
    const categoryConfidenceByName = new Map<string, number>();

    const questions: InterviewQuestion[] = [];

    for (const block of questionBlocks) {
      const matchedTopic = findTopicForLine(detectedTopics, block.lineIndex);
      const { category: categoryName, confidence: categoryConfidence } = detectCategory(
        matchedTopic.topic,
        `${block.question} ${block.answer}`
      );

      const candidate = {
        category: categoryName,
        topic: matchedTopic.topic,
        question: block.question,
        answer: block.answer,
        confidence: block.confidence,
        order: block.order,
        documentName: input.filename,
      };

      const parsed = InterviewQuestionSchema.safeParse(candidate);

      if (!parsed.success) {
        const message = `Rejected malformed question at order ${block.order}: ${parsed.error.message}`;
        errors.push(message);
        console.warn(`${LOG_PREFIX} ${message}`);
        continue;
      }

      questions.push(parsed.data);

      // Do NOT create duplicate topics/categories — track the strongest
      // confidence seen for each distinct name, deduplicated below.
      topicConfidenceByName.set(
        matchedTopic.topic,
        Math.max(topicConfidenceByName.get(matchedTopic.topic) ?? 0, matchedTopic.confidence)
      );
      topicCategoryByName.set(matchedTopic.topic, categoryName);
      categoryConfidenceByName.set(
        categoryName,
        Math.max(categoryConfidenceByName.get(categoryName) ?? 0, categoryConfidence)
      );
    }

    const categories: InterviewCategory[] = [];

    for (const [name, confidence] of categoryConfidenceByName) {
      const parsed = InterviewCategorySchema.safeParse({ id: slugify(name), name, confidence });

      if (parsed.success) {
        categories.push(parsed.data);
      } else {
        errors.push(`Rejected invalid category "${name}": ${parsed.error.message}`);
      }
    }

    categories.sort((a, b) => a.name.localeCompare(b.name));

    const topics: InterviewTopic[] = [];

    for (const [name, confidence] of topicConfidenceByName) {
      const parsed = InterviewTopicSchema.safeParse({
        id: slugify(name),
        category: topicCategoryByName.get(name) ?? DEFAULT_CATEGORY,
        name,
        confidence,
      });

      if (parsed.success) {
        topics.push(parsed.data);
      } else {
        errors.push(`Rejected invalid topic "${name}": ${parsed.error.message}`);
      }
    }

    topics.sort((a, b) => a.name.localeCompare(b.name));

    const answerCount = questions.filter((question) => question.answer.trim().length > 0).length;
    const emptyAnswerCount = questions.length - answerCount;

    const metadata: InterviewExtractionMetadata = {
      questionCount: questions.length,
      topicCount: topics.length,
      categoryCount: categories.length,
      answerCount,
      emptyAnswerCount,
      processingTimeMs: Date.now() - startedAt,
    };

    const result: InterviewExtractionResult = {
      filename: input.filename,
      categories,
      topics,
      questions,
      metadata,
      errors,
    };

    const validated = InterviewDocumentSchema.safeParse(result);

    console.log(`${LOG_PREFIX} Validation Complete`, { filename: input.filename, valid: validated.success });

    if (!validated.success) {
      // Every piece of `result` was already validated individually above,
      // so reaching here means something genuinely unexpected happened —
      // the one case this method allows itself to throw for.
      throw new Error(`Interview extraction result failed validation: ${validated.error.message}`);
    }

    console.log(`${LOG_PREFIX} Extraction Complete`, {
      filename: input.filename,
      success: true,
      questionCount: validated.data.metadata.questionCount,
      categoryCount: validated.data.metadata.categoryCount,
      topicCount: validated.data.metadata.topicCount,
      errorCount: validated.data.errors.length,
    });

    // Milestone 2, optional: generate answers for any question the
    // extraction pipeline found with an empty answer. Off by default —
    // omitting `options` (or passing `generateAnswers: false`) returns
    // exactly what Milestone 1 always returned. AnswerGenerationService
    // never overwrites an answer that was already present, and its result
    // is a structural superset of InterviewExtractionResult (every
    // question gains optional AI fields on top of the Milestone 1 shape),
    // so it can be returned here unchanged.
    if (options?.generateAnswers) {
      return answerGenerationService.generateAnswers(validated.data);
    }

    return validated.data;
  }
}
