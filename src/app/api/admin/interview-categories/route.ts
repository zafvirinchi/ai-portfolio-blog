import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("interview_categories")
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

    const { slug, title, description, icon, sort_order, is_active } = body;

    if (!slug || !title) {
      return NextResponse.json(
        { error: "Slug and title are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("interview_categories")
      .insert({
        slug,
        title,
        description: description || null,
        icon: icon || null,
        sort_order: sort_order ?? 0,
        is_active: is_active ?? true,
      })
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // See confirm-import/route.ts — /interview-questions is statically
    // prerendered and needs an explicit revalidate after any category write.
    revalidatePath("/interview-questions");

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}