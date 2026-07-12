import { supabaseAdmin } from "@/lib/supabase/admin";

import { ProjectKnowledge } from "./types";

export class ProjectKnowledgeService {

  async getAllProjects(): Promise<ProjectKnowledge[]> {

    const { data, error } =
      await supabaseAdmin
        .from("projects")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (error) throw error;

    return (data ?? []) as ProjectKnowledge[];
  }

  async searchProjects(
    keyword: string
  ): Promise<ProjectKnowledge[]> {

    const { data, error } =
      await supabaseAdmin
        .from("projects")
        .select("*")
        .or(
          `title.ilike.%${keyword}%,description.ilike.%${keyword}%`
        );

    if (error) throw error;

    return (data ?? []) as ProjectKnowledge[];
  }

  async getProjectCount() {

    const { count } =
      await supabaseAdmin
        .from("projects")
        .select("*", {
          count: "exact",
          head: true,
        });

    return count ?? 0;
  }

}

export const projectKnowledge =
  new ProjectKnowledgeService();