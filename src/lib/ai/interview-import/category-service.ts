import { supabaseAdmin } from "@/lib/supabase/admin";
import { CategoryRow } from "./import-types";

// Pure, deterministic — same name always produces the same slug.
function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "category";
}

/**
 * DB I/O for `interview_categories` only — no matching/dedup logic here,
 * that's duplicate-detector.ts's job. Reuses the existing table exactly as
 * introspected (id, slug, title, description, icon, sort_order,
 * is_active, created_at, updated_at) — no schema changes.
 */
export async function listCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabaseAdmin.from("interview_categories").select("id, slug, title");

  if (error) {
    throw new Error(`Failed to list interview categories: ${error.message}`);
  }

  return data ?? [];
}

export async function createCategory(name: string): Promise<CategoryRow> {
  const { data, error } = await supabaseAdmin
    .from("interview_categories")
    .insert({
      slug: slugify(name),
      title: name,
      description: `Interview questions related to ${name}.`,
    })
    .select("id, slug, title")
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Failed to create interview category "${name}": ${error?.message ?? "no row returned"}`);
  }

  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("interview_categories").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to roll back interview category ${id}: ${error.message}`);
  }
}
