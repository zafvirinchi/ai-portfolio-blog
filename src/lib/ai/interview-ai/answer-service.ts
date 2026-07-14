// import type — see answer-types.ts for why this matters across the
// interview <-> interview-ai boundary.
import type { InterviewExtractionResult, InterviewQuestion } from "../interview";
import { generateAnswer } from "./answer-generator";
import type { EnrichedInterviewDocument, EnrichedInterviewQuestion } from "./answer-types";

const LOG_PREFIX = "[interview-ai]";

// Cap on simultaneous in-flight OpenAI requests — "use Promise.all(),
// limit concurrency, avoid overwhelming OpenAI." A handful of parallel
// requests is enough to meaningfully speed up a multi-question document
// without risking rate limits.
const MAX_CONCURRENT_GENERATIONS = 3;

/**
 * Runs `worker` over every item with at most `limit` calls in flight at
 * once, using a small fixed pool of Promise.all-awaited "lanes" that each
 * pull the next item off the queue as they finish. Order of `results` is
 * preserved regardless of completion order.
 */
async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function lane(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  const lanes = Array.from({ length: Math.min(limit, items.length) }, () => lane());
  await Promise.all(lanes);

  return results;
}

function hasExistingAnswer(question: InterviewQuestion): boolean {
  return question.answer != null && question.answer.trim().length > 0;
}

/**
 * Generates enterprise-quality answers for every question in an already-
 * extracted InterviewDocument that doesn't already have one. Never
 * overwrites an existing answer. A failed generation for one question
 * never fails the batch — that question is simply left as-is (answer
 * stays empty, `aiGenerated: false`) and every other question still gets
 * processed.
 */
export class AnswerGenerationService {
  async generateAnswers(interviewDocument: InterviewExtractionResult): Promise<EnrichedInterviewDocument> {
    const startedAt = Date.now();

    console.log(`${LOG_PREFIX} Generation Started`, {
      filename: interviewDocument.filename,
      questionCount: interviewDocument.questions.length,
    });

    const questions = await mapWithConcurrencyLimit(
      interviewDocument.questions,
      MAX_CONCURRENT_GENERATIONS,
      (question) => this.generateForQuestion(question)
    );

    const generatedCount = questions.filter((question) => question.aiGenerated).length;

    console.log(`${LOG_PREFIX} Generation Completed`, {
      filename: interviewDocument.filename,
      generated: generatedCount,
      skipped: questions.length - generatedCount,
      totalMs: Date.now() - startedAt,
    });

    return { ...interviewDocument, questions };
  }

  private async generateForQuestion(question: InterviewQuestion): Promise<EnrichedInterviewQuestion> {
    const preview = question.question.slice(0, 60);

    if (hasExistingAnswer(question)) {
      console.log(`${LOG_PREFIX} Question Skipped`, { question: preview });

      return { ...question, aiGenerated: false };
    }

    try {
      const generated = await generateAnswer(question);

      console.log(`${LOG_PREFIX} Question Generated`, { question: preview });

      return {
        ...question,
        answer: generated.answer,
        shortAnswer: generated.shortAnswer,
        codeExample: generated.codeExample,
        difficulty: generated.difficulty,
        experienceLevel: generated.experienceLevel,
        importantConcepts: generated.importantConcepts,
        commonMistakes: generated.commonMistakes,
        followUpQuestions: generated.followUpQuestions,
        bestPractices: generated.bestPractices,
        tags: generated.tags,
        confidence: generated.confidence,
        aiGenerated: true,
      };
    } catch (error) {
      console.warn(`${LOG_PREFIX} Answer generation failed, keeping answer empty`, {
        question: preview,
        error: error instanceof Error ? error.message : String(error),
      });

      return { ...question, aiGenerated: false };
    }
  }
}

export const answerGenerationService = new AnswerGenerationService();
