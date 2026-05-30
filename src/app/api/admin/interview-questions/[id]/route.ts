import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
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
      .update({
        topic_id,
        question,
        answer,
        level: level || "Beginner",
        tags: tags || [],
        sort_order: sort_order ?? 0,
        is_published: is_published ?? true,
        code_example: code_example || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Interview question not found" },
        { status: 404 }
      );
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
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Interview question ID is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("interview_questions")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: "Interview question deleted successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}