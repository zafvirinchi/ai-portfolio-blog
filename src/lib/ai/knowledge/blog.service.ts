import { supabaseAdmin } from "@/lib/supabase/admin";

export interface BlogKnowledge {

  id: string;

  title: string;

  slug: string;

  excerpt?: string;

  created_at?: string;

}

export class BlogKnowledgeService {

  async getAllBlogs() {

    const { data, error } =
      await supabaseAdmin
        .from("blogs")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (error) throw error;

    return (data ?? []) as BlogKnowledge[];

  }

  async searchBlogs(
    keyword: string
  ) {

    const { data, error } =
      await supabaseAdmin
        .from("blogs")
        .select("*")
        .or(
          `title.ilike.%${keyword}%,excerpt.ilike.%${keyword}%`
        );

    if (error) throw error;

    return (data ?? []) as BlogKnowledge[];

  }

}

export const blogKnowledge =
  new BlogKnowledgeService();