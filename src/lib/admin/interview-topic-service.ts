import { supabase } from "@/lib/supabase";
import { InterviewTopic, InterviewTopicInfo } from "@/types/interview";
import { supabaseAdmin } from "@/lib/supabase/admin";


export async function getInterviewTopics(): Promise<InterviewTopic[]> {
  const { data, error } = await supabaseAdmin
    .from("interview_topics")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("getInterviewTopics error:", error.message);
    return [];
  }

  return data || [];
}

export async function getInterviewTopicById(
  id: string
): Promise<InterviewTopic | null> {
  const { data, error } = await supabaseAdmin
    .from("interview_topics")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getInterviewTopicById error:", error.message);
    return null;
  }

  return data;
}

export async function getAdminTopics() {
  const { data, error } = await supabaseAdmin
    .from("interview_topics")
    .select(`
      id,
      slug,
      title,
      interview_categories (
        id,
        slug,
        title
      )
    `)
    .order("title");

  if (error) {
    console.error("getAdminTopics error:", error.message);
    return [];
  }

  return (data || []).map((topic) => ({
    ...topic,
    interview_categories: Array.isArray(topic.interview_categories)
      ? topic.interview_categories[0] || null
      : topic.interview_categories,
  }));
}

export async function getTopicsByCategory(
  categorySlug: string
): Promise<InterviewTopic[]> {
  const { data, error } = await supabase
    .from("interview_topics")
    .select(
      `
      id,
      category_id,
      slug,
      title,
      description,
      sort_order,
      is_active,
      created_at,
      updated_at,
      interview_categories!inner(slug)
    `
    )
    .eq("interview_categories.slug", categorySlug)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("getTopicsByCategory error:", error.message);
    return [];
  }

  return (data || []) as InterviewTopic[];
}

export async function getTopicInfo(
  categorySlug: string,
  topicSlug: string
): Promise<InterviewTopicInfo | null> {
  const { data, error } = await supabase
    .from("interview_topics")
    .select(
      `
      id,
      slug,
      title,
      description,
      interview_categories!inner(
        title,
        slug
      )
    `
    )
    .eq("slug", topicSlug)
    .eq("interview_categories.slug", categorySlug)
    .single();

  if (error) {
    console.error("getTopicInfo error:", error.message);
    return null;
  }

  return data as InterviewTopicInfo;
}