import { supabaseAdmin } from "./admin";

// Requires the `interview-diagrams` bucket to exist — see
// supabase/migrations/20260731000000_add_interview_diagrams_bucket.sql (this
// repo has no automated migration tooling; run it manually once in the
// Supabase SQL editor).
const INTERVIEW_DIAGRAM_BUCKET = "interview-diagrams";

// Requires the `blog-images` bucket to exist — see
// supabase/migrations/20260820000000_add_blog_images_bucket.sql (this
// repo has no automated migration tooling; run it manually once in the
// Supabase SQL editor).
const BLOG_IMAGES_BUCKET = "blog-images";

function sniffImageContentType(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  return "image/png";
}

/** Uploads an extracted interview diagram to Supabase Storage and returns its public URL. */
export async function uploadInterviewDiagram(buffer: Buffer, key: string): Promise<string> {
  const contentType = sniffImageContentType(buffer);

  const { error } = await supabaseAdmin.storage
    .from(INTERVIEW_DIAGRAM_BUCKET)
    .upload(key, buffer, { contentType, upsert: true });

  if (error) {
    throw new Error(`Failed to upload interview diagram "${key}": ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from(INTERVIEW_DIAGRAM_BUCKET).getPublicUrl(key);

  return data.publicUrl;
}

/** Uploads an admin-supplied blog cover image to Supabase Storage and returns its public URL. */
export async function uploadBlogCoverImage(buffer: Buffer, key: string, contentType: string): Promise<string> {
  const { error } = await supabaseAdmin.storage
    .from(BLOG_IMAGES_BUCKET)
    .upload(key, buffer, { contentType, upsert: true });

  if (error) {
    throw new Error(`Failed to upload blog cover image "${key}": ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from(BLOG_IMAGES_BUCKET).getPublicUrl(key);

  return data.publicUrl;
}
