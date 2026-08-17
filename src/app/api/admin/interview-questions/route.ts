import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  const { data, error } = await supabaseAdmin
    .from("interview_questions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();

    const {
      topic_id,
      question,
      answer,
      level,
      tags,
      sort_order,
      is_published,
      code_example,
    } = body;

    if (!topic_id || !question || !answer) {
      return NextResponse.json(
        { error: "Topic ID, question and answer are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("interview_questions")
      .insert({
        topic_id,
        question,
        answer,
        level: level || "Beginner",
        tags: tags || [],
        sort_order: sort_order ?? 0,
        is_published: is_published ?? true,
        code_example: code_example || null,
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