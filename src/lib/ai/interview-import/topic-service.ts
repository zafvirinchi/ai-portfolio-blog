import { supabaseAdmin } from "@/lib/supabase/admin";
import { TopicRow } from "./import-types";

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "topic";
}

/**
 * DB I/O for `interview_topics` only. Reuses the existing table exactly
 * as introspected (id, category_id, slug, title, description, sort_order,
 * is_active, created_at, updated_at) — no schema changes.
 */
export async function listTopics(): Promise<TopicRow[]> {
  const { data, error } = await supabaseAdmin.from("interview_topics").select("id, category_id, slug, title");

  if (error) {
    throw new Error(`Failed to list interview topics: ${error.message}`);
  }

  return data ?? [];
}

export async function createTopic(categoryId: string, name: string): Promise<TopicRow> {
  const { data, error } = await supabaseAdmin
    .from("interview_topics")
    .insert({
      category_id: categoryId,
      slug: slugify(name),
      title: name,
      description: `Interview questions on ${name}.`,
    })
    .select("id, category_id, slug, title")
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Failed to create interview topic "${name}": ${error?.message ?? "no row returned"}`);
  }

  return data;
}

export async function deleteTopic(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("interview_topics").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to roll back interview topic ${id}: ${error.message}`);
  }
}
