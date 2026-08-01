import { supabaseAdmin } from "@/lib/supabase/admin";
import { InterviewCandidate } from "./interview-types";

// Candidate pool size before ranking narrows it down to the top 10 —
// generous enough that a relevant match rarely gets missed by the broad
// keyword filter below, without pulling the whole table.
const CANDIDATE_POOL_SIZE = 60;

const STOPWORDS = new Set([
  "what", "is", "are", "the", "a", "an", "how", "why", "explain", "describe",
  "difference", "differences", "between", "and", "or", "in", "of", "to", "do",
  "does", "you", "your", "give", "me", "real", "example", "examples", "project",
  "code", "generate", "again", "easier", "please", "tell", "about", "for",
  "with", "this", "that", "can", "i", "my", "should", "avoid", "mistakes",
  "follow-up", "followup", "questions", "question",
]);

/** Extracts meaningful search terms from a user question — strips stopwords/short tokens. Pure. */
export function extractKeywords(question: string): string[] {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));

  return Array.from(new Set(words));
}

// PostgREST's `.or()` filter syntax is comma-delimited — strip characters
// that could break out of it or inject wildcards (same rule already used
// in Knowledge Manager's search, api/admin/knowledge/route.ts).
function sanitizeForIlike(term: string): string {
  return term.replace(/[,()%*]/g, "").trim();
}

interface RawInterviewRow {
  id: string;
  topic_id: string;
  question: string;
  answer: string;
  level: string;
  tags: string[] | null;
  code_example: string | null;
  code_language: string | null;
  diagram_url: string | null;
  diagram_caption: string | null;
  interview_topics:
    | { title: string; interview_categories: { title: string } | { title: string }[] | null }
    | { title: string; interview_categories: { title: string } | { title: string }[] | null }[]
    | null;
}

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

function toCandidate(row: RawInterviewRow): InterviewCandidate {
  const topic = firstOf(row.interview_topics);
  const category = firstOf(topic?.interview_categories);

  return {
    id: row.id,
    topicId: row.topic_id,
    question: row.question,
    answer: row.answer,
    level: row.level,
    tags: row.tags ?? [],
    codeExample: row.code_example,
    codeLanguage: row.code_language,
    diagramUrl: row.diagram_url,
    diagramCaption: row.diagram_caption,
    topicTitle: topic?.title ?? "General",
    categoryTitle: category?.title ?? "General",
  };
}

/**
 * Searches the existing Interview Database (interview_questions, joined
 * with its topic and category) for a broad candidate pool matching the
 * user's question — no new tables, no embeddings, just the same kind of
 * `ilike` keyword search already used elsewhere in this codebase (e.g.
 * Knowledge Manager, admin question search). Ranking (interview-ranking.ts)
 * narrows this down to the best 10 matches.
 */
export async function searchInterviewQuestions(question: string): Promise<InterviewCandidate[]> {
  const keywords = extractKeywords(question).map(sanitizeForIlike).filter(Boolean);

  let query = supabaseAdmin
    .from("interview_questions")
    .select(
      "id, topic_id, question, answer, level, tags, code_example, code_language, diagram_url, diagram_caption, interview_topics(title, interview_categories(title))"
    )
    .eq("is_published", true)
    .limit(CANDIDATE_POOL_SIZE);

  if (keywords.length > 0) {
    const orFilter = keywords
      .flatMap((term) => [`question.ilike.%${term}%`, `answer.ilike.%${term}%`, `tags.cs.{${term}}`])
      .join(",");

    query = query.or(orFilter);
  } else {
    const term = sanitizeForIlike(question);
    query = query.or(`question.ilike.%${term}%,answer.ilike.%${term}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Interview search failed: ${error.message}`);
  }

  return ((data ?? []) as unknown as RawInterviewRow[]).map(toCandidate);
}
