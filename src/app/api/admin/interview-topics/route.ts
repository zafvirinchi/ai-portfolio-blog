import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("interview_topics")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { category_id, slug, title, description, sort_order, is_active } =
      body;

    if (!category_id || !slug || !title) {
      return NextResponse.json(
        { error: "Category, slug and title are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("interview_topics")
      .insert({
        category_id,
        slug,
        title,
        description: description || null,
        sort_order: sort_order ?? 0,
        is_active: is_active ?? true,
      })
      .select()
      .maybeSingle();

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