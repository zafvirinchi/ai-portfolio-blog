import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils/slugify";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(req: Request, { params }: Params) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const { title, slug, excerpt, content, cover_image, tags, is_published } =
      body;

    if (!title || !slug || !content) {
      return NextResponse.json(
        { error: "Title, slug and content are required" },
        { status: 400 }
      );
    }

    const normalizedSlug = slugify(slug);

    if (!normalizedSlug) {
      return NextResponse.json(
        { error: "Slug must contain at least one letter or number" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("blogs")
      .update({
        title,
        slug: normalizedSlug,
        excerpt,
        content,
        cover_image,
        tags: tags || [],
        is_published: is_published ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Blog ID is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("blogs").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: "Blog deleted successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}