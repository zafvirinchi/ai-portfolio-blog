import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImportableQuestion, QuestionRow } from "./import-types";

// interview_questions has no dedicated column for AI-enrichment metadata
// (experience level, best practices, follow-up questions, important
// concepts, common mistakes) — only question/answer/level/tags/
// code_example/code_language exist (confirmed via live schema
// introspection; see PHASE11_MILESTONE3 docs). Rather than silently
// dropping that data or altering the schema (explicitly out of scope),
// it's folded into the `answer` text as a readable, clearly-delimited
// appendix — the data still ends up in the database, just inside the
// existing free-text column instead of a column that doesn't exist.
function buildStoredAnswer(question: ImportableQuestion): string {
  const sections: string[] = [question.answer];
  const extras: string[] = [];

  if (question.experienceLevel) {
    extras.push(`**Experience Level:** ${question.experienceLevel}`);
  }

  if (question.importantConcepts?.length) {
    extras.push(`**Key Concepts:** ${question.importantConcepts.join(", ")}`);
  }

  if (question.commonMistakes?.length) {
    extras.push(`**Common Mistakes:**\n${question.commonMistakes.map((item) => `- ${item}`).join("\n")}`);
  }

  if (question.bestPractices?.length) {
    extras.push(`**Best Practices:**\n${question.bestPractices.map((item) => `- ${item}`).join("\n")}`);
  }

  if (question.followUpQuestions?.length) {
    extras.push(`**Follow-up Questions:**\n${question.followUpQuestions.map((item) => `- ${item}`).join("\n")}`);
  }

  if (extras.length > 0) {
    sections.push("---", ...extras);
  }

  return sections.join("\n\n");
}

// Difficulty (Easy/Medium/Hard/Expert) maps directly onto the existing
// free-text `level` column — the closest existing fit (the column's
// current values, e.g. "Beginner"/"Medium", are already difficulty tiers,
// not experience-years tiers).
function resolveLevel(question: ImportableQuestion): string {
  return question.difficulty ?? "Medium";
}

const CATEGORY_CODE_LANGUAGE: Record<string, string> = {
  Java: "java",
  "Spring Boot": "java",
  Hibernate: "java",
  JPA: "java",
  Angular: "typescript",
  React: "javascript",
  "Node.js": "javascript",
  SQL: "sql",
  MongoDB: "javascript",
  Kafka: "java",
  Docker: "dockerfile",
};

function resolveCodeLanguage(category: string): string {
  return CATEGORY_CODE_LANGUAGE[category] ?? "java";
}

/**
 * DB I/O for `interview_questions` only. Reuses the existing table exactly
 * as introspected (id, topic_id, question, answer, level, tags,
 * sort_order, is_published, code_example, code_language, ...) — no schema
 * changes. Imported questions are published immediately (`is_published:
 * true`) so they show up on the existing Interview Dashboard right away,
 * per spec.
 */
export async function listQuestionsByTopics(topicIds: string[]): Promise<QuestionRow[]> {
  if (topicIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("interview_questions")
    .select("id, topic_id, question")
    .in("topic_id", topicIds);

  if (error) {
    throw new Error(`Failed to list interview questions: ${error.message}`);
  }

  return data ?? [];
}

// True only for a missing-column error (PostgREST's "could not find the
// column in the schema cache" / raw Postgres 42703) — anything else (bad
// FK, RLS, network) should still surface as a real failure, not be
// silently swallowed by the degradation path below.
function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("column") && (normalized.includes("does not exist") || normalized.includes("could not find"));
}

let warnedMissingReviewColumns = false;

export async function createQuestion(topicId: string, question: ImportableQuestion): Promise<{ id: string }> {
  const basePayload = {
    topic_id: topicId,
    question: question.question,
    answer: buildStoredAnswer(question),
    level: resolveLevel(question),
    tags: question.tags ?? [],
    sort_order: question.order,
    is_published: true,
    code_example: question.codeExample || null,
    code_language: resolveCodeLanguage(question.category),
    diagram_url: question.diagramUrl ?? null,
  };

  // Phase 11.5's answer_source/quality_score columns only exist once
  // supabase/migrations/20260719000000_add_interview_review_columns.sql
  // has been run manually (this repo has no automated migration
  // mechanism — see that file). Until then, degrade gracefully: try with
  // the new fields, and if the DB rejects them specifically because the
  // columns don't exist yet, retry without them rather than failing the
  // whole import.
  const reviewFields =
    question.answerSource !== undefined || question.qualityScore !== undefined
      ? { answer_source: question.answerSource ?? null, quality_score: question.qualityScore ?? null }
      : {};

  let { data, error } = await supabaseAdmin
    .from("interview_questions")
    .insert({ ...basePayload, ...reviewFields })
    .select("id")
    .maybeSingle();

  if (error && Object.keys(reviewFields).length > 0 && isMissingColumnError(error.message)) {
    if (!warnedMissingReviewColumns) {
      console.warn(
        "[interview-import] answer_source/quality_score columns don't exist yet — run " +
          "supabase/migrations/20260719000000_add_interview_review_columns.sql to enable persisting them. " +
          "Continuing without them for this import."
      );
      warnedMissingReviewColumns = true;
    }

    ({ data, error } = await supabaseAdmin.from("interview_questions").insert(basePayload).select("id").maybeSingle());
  }

  if (error || !data) {
    throw new Error(
      `Failed to create interview question "${question.question}": ${error?.message ?? "no row returned"}`
    );
  }

  return data;
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("interview_questions").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to roll back interview question ${id}: ${error.message}`);
  }
}
