import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

    const { slug, title, description, icon, sort_order, is_active } = body;

    if (!slug || !title) {
      return NextResponse.json(
        { error: "Slug and title are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("interview_categories")
      .update({
        slug,
        title,
        description: description || null,
        icon: icon || null,
        sort_order: sort_order ?? 0,
        is_active: is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    revalidatePath("/interview-questions");

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("interview_categories")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  revalidatePath("/interview-questions");

  return NextResponse.json({ message: "Category deleted successfully" });
}