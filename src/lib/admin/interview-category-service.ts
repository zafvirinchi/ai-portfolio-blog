import { supabaseAdmin } from "@/lib/supabase/admin";
import { InterviewCategory } from "@/types/interview";

export async function getInterviewCategories(): Promise<InterviewCategory[]> {
  const { data, error } = await supabaseAdmin
    .from("interview_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("getInterviewCategories error:", error.message);
    return [];
  }

  return data || [];
}

export async function getInterviewCategoryById(
  id: string
): Promise<InterviewCategory | null> {
  const { data, error } = await supabaseAdmin
    .from("interview_categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getInterviewCategoryById error:", error.message);
    return null;
  }

  return data;
}