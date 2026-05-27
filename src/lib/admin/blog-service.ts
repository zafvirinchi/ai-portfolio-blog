import { supabase } from "@/lib/supabase";
import { Blog } from "@/types/blog";

export async function getPublishedBlogs(): Promise<Blog[]> {
  const { data, error } = await supabase
    .from("blogs")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getPublishedBlogs error:", error.message);
    return [];
  }

  return (data as Blog[]) || [];
}

export async function getBlogBySlug(slug: string): Promise<Blog | null> {
  const { data, error } = await supabase
    .from("blogs")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error) {
    console.error("getBlogBySlug error:", error.message);
    return null;
  }

  return data as Blog;
}