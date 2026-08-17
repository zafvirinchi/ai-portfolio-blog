import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();

    const { title, slug, excerpt, content, cover_image, tags, is_published } =
      body;

    if (!title || !slug || !content) {
      return NextResponse.json(
        { error: "Title, slug and content are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("blogs")
      .insert({
        title,
        slug,
        excerpt,
        content,
        cover_image,
        tags: tags || [],
        is_published: is_published ?? false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}