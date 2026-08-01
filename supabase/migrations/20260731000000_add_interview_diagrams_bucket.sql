-- Interview Document Intelligence — Diagram Extraction
--
-- Creates the Supabase Storage bucket the interview-document import pipeline
-- uploads extracted PDF diagrams to (src/lib/supabase/storage.ts,
-- src/lib/ai/interview-document/diagram-attacher.ts). Public read so the
-- resulting URL can be stored directly in interview_questions.diagram_url
-- and rendered by DynamicQAAccordion.tsx / the AI chat without a signed URL.
--
-- This repo has no migration tooling (see
-- 20260719000000_add_interview_review_columns.sql) — run this file manually
-- once in the Supabase SQL Editor for this project before uploading a
-- document you expect diagrams from. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('interview-diagrams', 'interview-diagrams', true)
on conflict (id) do nothing;

-- Uploads go through supabaseAdmin (the service-role client), which bypasses
-- RLS entirely, so only a read policy is needed here for public viewing.
drop policy if exists "Public read access for interview diagrams" on storage.objects;

create policy "Public read access for interview diagrams"
on storage.objects for select
using (bucket_id = 'interview-diagrams');
