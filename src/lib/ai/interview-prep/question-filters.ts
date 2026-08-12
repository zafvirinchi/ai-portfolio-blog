import type { BrowsableQuestion, CoverageCategory, PriorityLevel } from "./interview-coverage";

// Phase 17 Milestone 4, §7/§8 — ONE reusable, deterministic, client-side
// filtering utility (audited first: no filtering/search utility existed
// anywhere in interview-prep/* before this milestone — category
// separation via tabs is the closest existing analogue, and remains
// unchanged/untouched). Difficulty options intentionally use this
// codebase's own existing vocabulary (Easy/Medium/Hard — DIFFICULTIES,
// prep-schema.ts) rather than substituting new labels ("Beginner/
// Intermediate/Advanced") the underlying question data was never
// tagged with — introducing a parallel label set would require
// inventing a mapping not present in the real data.

export type QuestionCategoryFilter = CoverageCategory | "All";
export type QuestionPriorityFilter = PriorityLevel | "All";
export type QuestionDifficultyFilter = string | "All";

export interface QuestionFilters {
  category: QuestionCategoryFilter;
  priority: QuestionPriorityFilter;
  difficulty: QuestionDifficultyFilter;
  search: string;
}

export const DEFAULT_QUESTION_FILTERS: QuestionFilters = { category: "All", priority: "All", difficulty: "All", search: "" };

/** Searches question text, topic, category, evidence source, and reason — never raw resume/JD text beyond what's already surfaced on the question itself. */
export function filterQuestions(questions: BrowsableQuestion[], filters: QuestionFilters): BrowsableQuestion[] {
  const searchTerm = filters.search.trim().toLowerCase();

  return questions.filter((question) => {
    if (filters.category !== "All" && question.category !== filters.category) return false;
    if (filters.priority !== "All" && question.priority !== filters.priority) return false;
    if (filters.difficulty !== "All" && question.difficulty !== filters.difficulty) return false;

    if (searchTerm) {
      const haystack = [question.question, question.topic, question.category, question.evidenceSource ?? "", question.reason]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }

    return true;
  });
}
