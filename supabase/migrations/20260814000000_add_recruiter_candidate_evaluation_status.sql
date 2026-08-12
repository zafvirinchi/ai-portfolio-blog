-- Phase 16 Milestone 4 — Recruiter Job Workspace + Candidate Ingestion & Evaluation
--
-- One additive, nullable column on the existing recruiter_candidates
-- table (Phase 16 Milestone 3). Milestone 3's updated_at is bumped by
-- every mutation (adding a note, changing status/tags) — not only by
-- an actual JD-match recomputation — so it cannot reliably answer
-- "when was this candidate last evaluated against its job's current
-- JD?" evaluated_at is set ONLY when jd_match_result is actually
-- (re)computed (candidate import with a job attached, an explicit
-- match, or the new re-evaluate action), so a candidate's evaluation
-- can be compared against its job's own updated_at to detect staleness
-- (see PHASE16_MILESTONE4 doc §12) without adding any new AI call.
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project (after
-- 20260813000000_add_recruiter_persistence.sql, which must already be
-- applied). Safe to re-run (if-not-exists). Existing rows get NULL,
-- which the application layer correctly treats as "not yet evaluated
-- under this tracking" — never backfilled with a guessed timestamp.

alter table recruiter_candidates add column if not exists evaluated_at timestamptz;

comment on column recruiter_candidates.evaluated_at is
  'Set only when jd_match_result is actually (re)computed — compared against the attached job''s updated_at to detect a stale evaluation (the job''s JD changed since this candidate was last matched against it). Null until the candidate has been matched against a job at least once.';
