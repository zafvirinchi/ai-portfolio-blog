import { supabaseAdmin } from "@/lib/supabase/admin";
import { InterviewQuestion } from "@/types/interview";
import { getTopicInfo } from "@/lib/admin/interview-topic-service";

export async function getInterviewQuestions(): Promise<InterviewQuestion[]> {
  const { data, error } = await supabaseAdmin
    .from("interview_questions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getInterviewQuestions error:", error.message);
    return [];
  }

  return (data || []).map((item) => ({
    ...item,
    level: item.level || item.difficulty || "Medium",
    topic_id: item.topic_id || null,
    sort_order: item.sort_order || 0,
  }));
}

export async function getInterviewQuestionById(
  id: string
): Promise<InterviewQuestion | null> {
  const { data, error } = await supabaseAdmin
    .from("interview_questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getInterviewQuestionById error:", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    level: data.level || data.difficulty || "Medium",
    topic_id: data.topic_id || null,
    sort_order: data.sort_order || 0,
  };
}

type GetQuestionsByTopicParams = {
  categorySlug: string;
  topicSlug: string;
  search?: string;
  level?: string;
  page?: number;
  pageSize?: number;
};

export async function getQuestionsByTopic({
  categorySlug,
  topicSlug,
  search = "",
  level = "all",
  page = 1,
  pageSize = 10,
}: GetQuestionsByTopicParams): Promise<{
  questions: InterviewQuestion[];
  total: number;
}> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const topicInfo = await getTopicInfo(categorySlug, topicSlug);

  if (!topicInfo) {
    return {
      questions: [],
      total: 0,
    };
  }

  let query = supabaseAdmin
    .from("interview_questions")
    .select("*", { count: "exact" })
    .eq("topic_id", topicInfo.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .range(from, to);

  if (search) {
    query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
  }

  if (level && level !== "all") {
    query = query.eq("level", level);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("getQuestionsByTopic error:", error.message);

    return {
      questions: [],
      total: 0,
    };
  }

  return {
    questions: data || [],
    total: count || 0,
  };
}