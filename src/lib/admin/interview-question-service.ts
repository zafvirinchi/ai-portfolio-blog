import { supabase } from "@/lib/supabase";
import { InterviewQuestion } from "@/types/interview";

export async function getQuestionsByTopic(params: {
  categorySlug: string;
  topicSlug: string;
  search?: string;
  level?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  questions: InterviewQuestion[];
  total: number;
}> {
  const {
    categorySlug,
    topicSlug,
    search = "",
    level = "all",
    page = 1,
    pageSize = 10,
  } = params;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("interview_questions")
    .select(
      `
      *,
      interview_topics!inner(
        slug,
        interview_categories!inner(slug)
      )
    `,
      { count: "exact" }
    )
    .eq("interview_topics.slug", topicSlug)
    .eq("interview_topics.interview_categories.slug", categorySlug)
    .eq("is_published", true);

  if (search.trim()) {
    query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
  }

  if (level !== "all") {
    query = query.eq("level", level);
  }

  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .range(from, to);

  if (error) {
    console.error("getQuestionsByTopic error:", error.message);
    return { questions: [], total: 0 };
  }

  return {
    questions: data || [],
    total: count || 0,
  };
}