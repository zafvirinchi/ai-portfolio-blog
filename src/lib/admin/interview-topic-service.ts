import { supabase } from "@/lib/supabase";
import { InterviewTopic, InterviewTopicInfo } from "@/types/interview";

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