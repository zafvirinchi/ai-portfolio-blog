export type InterviewQuestion = {
  id: string;
  topic_id: string | null;
  category: string;
  topic: string;
  question: string;
  answer: string;
  level: string | null;
  difficulty: string | null;
  tags: string[] | null;
  sort_order: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};