import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/billing/admin-api-guard";
import { uploadBlogCoverImage } from "@/lib/supabase/storage";

const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "An image file is required" }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported image type. Please upload a PNG, JPEG, WebP, or GIF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = EXTENSION_BY_CONTENT_TYPE[file.type];
    const key = `covers/${randomUUID()}.${extension}`;

    const url = await uploadBlogCoverImage(buffer, key, file.type);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[admin-blogs] Cover image upload failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image upload failed" },
      { status: 500 }
    );
  }
}
