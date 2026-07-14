import { listCategories, createCategory, deleteCategory } from "./category-service";
import { listTopics, createTopic, deleteTopic } from "./topic-service";
import { listQuestionsByTopics, createQuestion, deleteQuestion } from "./question-service";
import { findCategoryMatch, findTopicMatch, isDuplicateQuestion } from "./duplicate-detector";
import { CategoryRow, ImportableDocument, ImportDuplicate, ImportResult, TopicRow } from "./import-types";

const LOG_PREFIX = "[interview-import]";

/**
 * Imports an already-extracted (and optionally AI-enriched) interview
 * document into the existing Interview CRUD tables — no new tables, no
 * schema changes. Categories/topics are reused when a matching one
 * already exists (see duplicate-detector.ts for the whitespace/case/
 * trailing-punctuation-insensitive matching rule) and created otherwise;
 * identical questions under the same topic are skipped, never
 * duplicated.
 *
 * Transactions: Supabase's REST API (PostgREST) does not expose
 * multi-statement DB transactions to a client, so true BEGIN/COMMIT/
 * ROLLBACK isn't available here without adding a database function —
 * which would itself be a schema change, out of scope for this
 * milestone. Instead, every row created during a run is tracked, and if
 * a fatal database error occurs, those specific rows (and only those —
 * pre-existing, reused rows are never touched) are deleted in
 * FK-safe order (questions, then topics, then categories) before the
 * error is re-thrown. This is an application-level compensating
 * rollback, not a real ACID transaction — see PHASE11_MILESTONE3 docs
 * for the trade-off and the future alternative (a Postgres RPC function).
 */
export class InterviewImportService {
  async import(document: ImportableDocument): Promise<ImportResult> {
    const startedAt = Date.now();

    console.log(`${LOG_PREFIX} Import Started`, {
      filename: document.filename,
      questionCount: document.questions.length,
    });

    const createdCategoryIds: string[] = [];
    const createdTopicIds: string[] = [];
    const createdQuestionIds: string[] = [];

    try {
      const categories = await listCategories();
      const topics = await listTopics();
      const existingQuestions = await listQuestionsByTopics(topics.map((topic) => topic.id));

      const touchedCategoryIds = new Set<string>();
      const newCategoryIds = new Set<string>();
      const touchedTopicIds = new Set<string>();
      const newTopicIds = new Set<string>();

      let importedQuestions = 0;
      let skippedQuestions = 0;
      const duplicates: ImportDuplicate[] = [];

      for (const question of document.questions) {
        if (!question.question?.trim() || !question.category?.trim() || !question.topic?.trim()) {
          skippedQuestions++;
          duplicates.push({
            category: question.category ?? "",
            topic: question.topic ?? "",
            question: question.question ?? "",
            reason: "invalid-record",
          });
          continue;
        }

        // Resolve category: reuse if a matching one exists, else create.
        let categoryRow: CategoryRow | undefined = findCategoryMatch(categories, question.category);

        if (!categoryRow) {
          categoryRow = await createCategory(question.category);
          categories.push(categoryRow);
          createdCategoryIds.push(categoryRow.id);
          newCategoryIds.add(categoryRow.id);
          console.log(`${LOG_PREFIX} Categories Imported`, { category: question.category, created: true });
        }

        touchedCategoryIds.add(categoryRow.id);

        // Resolve topic under that category: reuse if a matching one exists, else create.
        let topicRow: TopicRow | undefined = findTopicMatch(topics, categoryRow.id, question.topic);

        if (!topicRow) {
          topicRow = await createTopic(categoryRow.id, question.topic);
          topics.push(topicRow);
          createdTopicIds.push(topicRow.id);
          newTopicIds.add(topicRow.id);
          console.log(`${LOG_PREFIX} Topics Imported`, { topic: question.topic, created: true });
        }

        touchedTopicIds.add(topicRow.id);

        // Duplicate question detection (same topic, normalized text match).
        if (isDuplicateQuestion(existingQuestions, topicRow.id, question.question)) {
          skippedQuestions++;
          duplicates.push({
            category: question.category,
            topic: question.topic,
            question: question.question,
            reason: "duplicate-question",
          });
          console.log(`${LOG_PREFIX} Duplicates Skipped`, { question: question.question.slice(0, 60) });
          continue;
        }

        const created = await createQuestion(topicRow.id, question);
        createdQuestionIds.push(created.id);
        existingQuestions.push({ id: created.id, topic_id: topicRow.id, question: question.question });
        importedQuestions++;
        console.log(`${LOG_PREFIX} Questions Imported`, { question: question.question.slice(0, 60) });
      }

      const result: ImportResult = {
        createdCategories: newCategoryIds.size,
        existingCategories: touchedCategoryIds.size - newCategoryIds.size,
        createdTopics: newTopicIds.size,
        existingTopics: touchedTopicIds.size - newTopicIds.size,
        importedQuestions,
        skippedQuestions,
        duplicates,
        processingTimeMs: Date.now() - startedAt,
      };

      console.log(`${LOG_PREFIX} Import Completed`, { filename: document.filename, ...result, duplicates: duplicates.length });

      return result;
    } catch (error) {
      console.error(`${LOG_PREFIX} Database error — rolling back`, error);
      await this.rollback(createdQuestionIds, createdTopicIds, createdCategoryIds);
      throw error;
    }
  }

  private async rollback(questionIds: string[], topicIds: string[], categoryIds: string[]): Promise<void> {
    // Children first — FK-safe order.
    for (const id of questionIds) {
      await deleteQuestion(id).catch((rollbackError) =>
        console.error(`${LOG_PREFIX} Rollback failed for question ${id}`, rollbackError)
      );
    }

    for (const id of topicIds) {
      await deleteTopic(id).catch((rollbackError) =>
        console.error(`${LOG_PREFIX} Rollback failed for topic ${id}`, rollbackError)
      );
    }

    for (const id of categoryIds) {
      await deleteCategory(id).catch((rollbackError) =>
        console.error(`${LOG_PREFIX} Rollback failed for category ${id}`, rollbackError)
      );
    }
  }
}

export const interviewImportService = new InterviewImportService();
