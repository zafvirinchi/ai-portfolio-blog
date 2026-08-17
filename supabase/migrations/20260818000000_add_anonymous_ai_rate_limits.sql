-- Phase 21 Milestone 2 — anonymous AI abuse protection for /api/ai/chat
-- and /api/ai/resume (Phase 21 Milestone 1's two deferred P0 findings:
-- both routes were fully anonymous-capable, multi-LLM-call-per-request,
-- with zero cost control for an unauthenticated caller).
--
-- Generalizes the existing job_match_requests pattern
-- (src/lib/ai/job-match/rate-limiter.ts,
-- 20260803000000_add_job_match_rate_limit.sql) with a `feature`
-- discriminator column, rather than reusing that table directly — it is
-- feature-specific by its own documented design (no discriminator
-- column, and its own comment says "One row per /job-match analysis
-- attempt"), so repurposing it for chat/resume would incorrectly merge
-- three independent free-tier allowances into one shared counter.
--
-- Deliberately minimal: feature + IP + timestamp only, no message/resume
-- content — a usage counter, not an audit log, matching the existing
-- precedent exactly. Same reserve-before-work concurrency approach, same
-- rolling-window/fail-closed-on-DB-error semantics as job_match_requests
-- — see anonymous-ai-rate-limiter.ts.
--
-- This repo has no migration tooling (see 20260719000000_add_interview_
-- review_columns.sql) — run this file manually once in the Supabase SQL
-- Editor for this project. Safe to re-run.
--
-- OPERATIONAL BLOCKER: this migration has not been applied to any live
-- database as part of this milestone (no DDL capability was available in
-- this environment). It must be run manually before the anonymous rate
-- limits it backs can take effect in a deployed environment.

create table if not exists anonymous_ai_requests (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (feature in ('ai_chat', 'resume_analyze')),
  ip_address text not null,
  created_at timestamptz not null default now()
);

create index if not exists anonymous_ai_requests_feature_ip_created_idx
  on anonymous_ai_requests (feature, ip_address, created_at);

comment on table anonymous_ai_requests is
  'One row per anonymous (unauthenticated) request to a rate-limited AI feature (ai_chat, resume_analyze), used only to enforce a per-IP daily cap. No message/resume content is stored here. See anonymous-ai-rate-limiter.ts.';
