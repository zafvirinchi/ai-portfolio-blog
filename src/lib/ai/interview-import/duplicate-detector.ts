import { CategoryRow, QuestionRow, TopicRow } from "./import-types";

/**
 * Normalizes text for duplicate comparison — ignores whitespace
 * differences, case, and trailing punctuation, per spec. Pure function,
 * no hidden state.
 */
export function normalizeForComparison(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.!?,:;]+$/, "")
    .replace(/\s+/g, " ");
}

// Mirrors category-service.ts/topic-service.ts's slugify exactly — used
// here only to predict what slug createCategory()/createTopic() would
// generate for `name`, so a match can be found even when an existing row's
// *title* text differs from `name` but would collide on the DB's unique
// slug constraint (e.g. an existing category titled "General Interview
// Questions" with slug "general" vs. a new lookup for "General" — same
// slug, different title, title-only matching missed it and the insert
// crashed the whole import instead of reusing the row).
function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "item";
}

export function findCategoryMatch(categories: CategoryRow[], name: string): CategoryRow | undefined {
  const targetTitle = normalizeForComparison(name);
  const targetSlug = slugify(name);

  return categories.find(
    (category) => normalizeForComparison(category.title) === targetTitle || category.slug === targetSlug
  );
}

export function findTopicMatch(topics: TopicRow[], categoryId: string, name: string): TopicRow | undefined {
  const targetTitle = normalizeForComparison(name);
  const targetSlug = slugify(name);

  return topics.find(
    (topic) =>
      topic.category_id === categoryId &&
      (normalizeForComparison(topic.title) === targetTitle || topic.slug === targetSlug)
  );
}

export function isDuplicateQuestion(existing: QuestionRow[], topicId: string, questionText: string): boolean {
  const target = normalizeForComparison(questionText);

  return existing.some((question) => question.topic_id === topicId && normalizeForComparison(question.question) === target);
}
