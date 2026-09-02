import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils/slugify";

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

    // A slug with spaces/uppercase/special characters produces a URL Next.js's
    // dynamic route resolves inconsistently between generateMetadata and the
    // page component (one decodes it, the other doesn't) — the published post
    // becomes permanently unreachable (404) even though it shows correctly
    // everywhere else. Normalize to a URL-safe slug at this boundary so no
    // blog can ever be saved with a slug that breaks its own detail page.
    const normalizedSlug = slugify(slug);

    if (!normalizedSlug) {
      return NextResponse.json(
        { error: "Slug must contain at least one letter or number" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("blogs")
      .insert({
        title,
        slug: normalizedSlug,
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