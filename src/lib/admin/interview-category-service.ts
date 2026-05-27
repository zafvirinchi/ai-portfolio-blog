import { supabase } from "@/lib/supabase";
import { InterviewCategory } from "@/types/interview";

export async function getInterviewCategories(): Promise<InterviewCategory[]> {
  console.log("Fetching interview categories...");

  const { data, error } = await supabase
    .from("interview_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("CATEGORY ERROR:", error.message);
    return [];
  }

  console.log("CATEGORY DATA:", data);

  return data || [];
}