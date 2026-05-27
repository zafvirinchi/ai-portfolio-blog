export type Blog = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  tags: string[] | null;
  cover_image: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};