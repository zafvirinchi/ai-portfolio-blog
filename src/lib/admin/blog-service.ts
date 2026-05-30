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

export async function getAllBlogs(): Promise<Blog[]> {
  const { data, error } = await supabase
    .from("blogs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAllBlogs error:", error.message);
    return [];
  }

  return (data as Blog[]) || [];
}

export async function getBlogById(id: string): Promise<Blog | null> {
  const { data, error } = await supabase
    .from("blogs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getBlogById error:", error.message);
    return null;
  }

  return data as Blog;
}

export async function getBlogBySlug(slug: string): Promise<Blog | null> {
  const { data, error } = await supabase
    .from("blogs")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("getBlogBySlug error:", error.message);
    return null;
  }

  return data as Blog;
}