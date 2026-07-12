import { supabaseAdmin } from "@/lib/supabase/admin";

export class InterviewKnowledgeService {

  async getAllQuestions() {

    const { data } = await supabaseAdmin
      .from("interview_questions")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    return data ?? [];
  }

  async searchQuestions(keyword: string) {

    const { data } = await supabaseAdmin
      .from("interview_questions")
      .select("*")
      .or(
        `
        category.ilike.%${keyword}%,
        topic.ilike.%${keyword}%,
        question.ilike.%${keyword}%,
        answer.ilike.%${keyword}%
        `
      );

    return data ?? [];
  }

  async getByCategory(category: string) {

    const { data } = await supabaseAdmin
      .from("interview_questions")
      .select("*")
      .eq("category", category);

    return data ?? [];
  }

  async getByTopic(topic: string) {

    const { data } = await supabaseAdmin
      .from("interview_questions")
      .select("*")
      .eq("topic", topic);

    return data ?? [];
  }

}

export const interviewKnowledge =
  new InterviewKnowledgeService();