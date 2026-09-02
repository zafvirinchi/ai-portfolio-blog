-- Blog Admin — Cover Image Upload
--
-- Creates the Supabase Storage bucket the admin blog editor uploads cover
-- images to (src/lib/supabase/storage.ts, src/app/api/admin/blogs/upload-image
-- /route.ts). Public read so the resulting URL can be stored directly in
-- blogs.cover_image and rendered by the public blog pages without a signed URL.
--
-- This repo has no migration tooling (see
-- 20260719000000_add_interview_review_columns.sql) — run this file manually
-- once in the Supabase SQL Editor for this project before uploading a blog
-- cover image from the admin dashboard. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

-- Uploads go through supabaseAdmin (the service-role client), which bypasses
-- RLS entirely, so only a read policy is needed here for public viewing.
drop policy if exists "Public read access for blog images" on storage.objects;

create policy "Public read access for blog images"
on storage.objects for select
using (bucket_id = 'blog-images');
