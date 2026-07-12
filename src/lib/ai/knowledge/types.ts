import { RagChunk } from "@/types/ai";

export interface ProjectKnowledge {

  id: string;

  title: string;

  description: string;

  technologies?: string;

  github_url?: string;

  live_url?: string;

  created_at?: string;

}

export interface BlogKnowledge {

  id: string;

  title: string;

  slug: string;

  excerpt?: string;

}

export interface InterviewCategoryKnowledge {

  id: string;

  title: string;

  slug: string;

}

export interface RagKnowledgeResult {

  context: string;

  chunks: RagChunk[];

}