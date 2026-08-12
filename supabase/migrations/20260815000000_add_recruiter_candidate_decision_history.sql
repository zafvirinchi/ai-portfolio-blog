-- Phase 16 Milestone 7 — Recruiter Shortlist & Candidate Decision Workflow
--
-- One additive, non-null-default column on the existing
-- recruiter_candidates table (Phase 16 Milestone 3), following the
-- exact same pattern its own `notes` column already established: an
-- append-only JSONB array, never queried by structure, only ever read
-- back whole and appended to.
--
-- Audited before writing this: Phase 14's activity_logs table
-- (20260806000000_add_saas_foundation_tables.sql) already logs
-- feature-usage events, but activity-service.ts's record() function
-- silently no-ops whenever organizationId is null (see its own "true
-- for every anonymous request" doc comment) — and the Recruiter
-- Workspace is deliberately individual-recruiter-scoped, not
-- organization-scoped (Phase 16 Milestone 2's own design decision), so
-- a recruiter's candidate-status changes would almost always have no
-- organizationId to attribute them to. That table is therefore not a
-- safe reuse target for this milestone's decision-history requirement
-- — hence this small, focused, additive column instead of a new table.
--
-- Every entry is {id, recruiterId, previousStatus, newStatus, note,
-- timestamp} — status values and a short optional recruiter-authored
-- note, exactly mirroring what `notes` already stores. Never resume
-- text, JD text, prompts, LLM payloads, or tokens.
--
-- This repo has no migration tooling — run this file manually in the
-- Supabase SQL Editor for this project, after
-- 20260813000000_add_recruiter_persistence.sql and
-- 20260814000000_add_recruiter_candidate_evaluation_status.sql (both
-- still unapplied as of this milestone — see PHASE16_MILESTONE7's own
-- documentation). Safe to re-run (if-not-exists).

alter table recruiter_candidates add column if not exists decision_history jsonb not null default '[]';

comment on column recruiter_candidates.decision_history is
  'Append-only log of status changes: [{id, recruiterId, previousStatus, newStatus, note, timestamp}, ...]. recruiterId is always server-derived (requireRecruiterId()), never client-supplied. Never stores resume/JD text, prompts, or tokens.';
