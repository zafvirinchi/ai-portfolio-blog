export type InterviewCategory = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type InterviewTopic = {
  id: string;
  category_id: string;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type InterviewQuestion = {
  id: string;
  topic_id: string;
  question: string;
  answer: string;
  level: string;
  tags: string[];
  sort_order: number;
  is_published: boolean;

  code_example?: string | null;
  code_language?: string | null;

  diagram_url?: string | null;
  diagram_caption?: string | null;

  created_at?: string;
  updated_at?: string;
};

export type InterviewTopicInfo = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  interview_categories:
    | {
        title: string;
        slug: string;
      }
    | {
        title: string;
        slug: string;
      }[];
};