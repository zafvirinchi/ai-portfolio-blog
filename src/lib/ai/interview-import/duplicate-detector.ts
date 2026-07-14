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

export function findCategoryMatch(categories: CategoryRow[], name: string): CategoryRow | undefined {
  const target = normalizeForComparison(name);

  return categories.find((category) => normalizeForComparison(category.title) === target);
}

export function findTopicMatch(topics: TopicRow[], categoryId: string, name: string): TopicRow | undefined {
  const target = normalizeForComparison(name);

  return topics.find((topic) => topic.category_id === categoryId && normalizeForComparison(topic.title) === target);
}

export function isDuplicateQuestion(existing: QuestionRow[], topicId: string, questionText: string): boolean {
  const target = normalizeForComparison(questionText);

  return existing.some((question) => question.topic_id === topicId && normalizeForComparison(question.question) === target);
}
