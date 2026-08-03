-- AI Job Description Intelligence — rate limiting
--
-- The new /job-match feature (resume vs. job-description AI analysis) is
-- public and calls OpenAI twice per submission (resume parsing + a job-match
-- analysis). This table backs a simple per-IP daily usage cap
-- (src/lib/ai/job-match/rate-limiter.ts) so it can't be hit repeatedly and
-- run up the OpenAI bill before any paywall/monetization exists.
--
-- Deliberately minimal: only IP + timestamp, no resume/JD content — this is
-- a usage counter, not an analysis history/audit log.
--
-- This repo has no migration tooling (see 20260719000000_add_interview_
-- review_columns.sql) — run this file manually once in the Supabase SQL
-- Editor for this project. Safe to re-run.

create table if not exists job_match_requests (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  created_at timestamptz not null default now()
);

create index if not exists job_match_requests_ip_created_idx
  on job_match_requests (ip_address, created_at);

comment on table job_match_requests is
  'One row per /job-match analysis attempt, used only to enforce a per-IP daily rate limit (see rate-limiter.ts). No resume/JD content is stored here.';
