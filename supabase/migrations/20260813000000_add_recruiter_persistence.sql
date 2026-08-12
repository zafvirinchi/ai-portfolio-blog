-- Phase 16 Milestone 3 — Persistent Recruiter Jobs & Candidate Records
--
-- Phase 16 Milestone 2 established recruiter identity/ownership but
-- deliberately kept the Recruiter Workspace (Phase 13 Milestone 8) in
-- memory — this migration is the durable store that replaces it.
--
-- Every existing recruiter engine (candidate-ranking.ts, candidate-
-- score.ts, candidate-summary.ts, the ATS engine, the JD parser/
-- matcher/optimizer, the resume parser) is UNCHANGED by this file —
-- these two tables only persist the already-computed output of those
-- engines, the same "snapshot, don't rebuild" precedent
-- resume_versions (20260810000000_add_resume_versions.sql) already
-- established for personal resumes. resumeService/jdMatchService/
-- prepService (src/lib/ai/resume, job-description, interview-prep)
-- remain fully in-memory/2h-TTL/unpersisted — recruiter_candidates
-- snapshots what those services produced at the moment of import/
-- match/generation, rather than referencing their ephemeral records,
-- so a candidate survives past that 2-hour window and across server
-- restarts.
--
-- No RLS, consistent with every existing table in this project — all
-- reads/writes go through the service-role supabaseAdmin client;
-- ownership is enforced entirely application-level (every
-- recruiter-job-service.ts / candidate-service.ts method takes an
-- authenticated recruiterId, resolved server-side via
-- requireRecruiterId(), and filters/verifies every row by it — never
-- trusts a recruiterId from the request).
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project. Safe to re-run (every
-- statement is if-not-exists).

-- ---------------------------------------------------------------------------
-- recruiter_jobs
-- ---------------------------------------------------------------------------

create table if not exists recruiter_jobs (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references auth.users(id) on delete cascade,

  title text not null,
  company text,

  -- The pasted/uploaded JD's raw text (same field this milestone
  -- replaces — Milestone 2's per-recruiter activeJobDescriptions Map).
  job_description_text text not null,
  -- jd-parser.ts's JobDescription (job-description/jd-schema.ts),
  -- parsed once at job-creation time — candidate matches against this
  -- job reuse this normalized JD (computeJdMatchForNormalizedJd)
  -- instead of re-parsing the same text on every match.
  normalized_jd jsonb,

  status text not null default 'Active' check (status in ('Active', 'Closed', 'Archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruiter_jobs_recruiter_idx on recruiter_jobs (recruiter_id, created_at desc);

comment on table recruiter_jobs is
  'A recruiter-owned job posting. job_description_text is the source of truth; normalized_jd is jd-parser.ts''s parsed JobDescription, cached here so candidate matches against this job never re-parse the same text.';

-- ---------------------------------------------------------------------------
-- recruiter_candidates
-- ---------------------------------------------------------------------------

create table if not exists recruiter_candidates (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references auth.users(id) on delete cascade,

  -- Nullable: a candidate can be imported before being attached to any
  -- job (matches the existing import flow); set null (not cascaded)
  -- when its job is deleted — candidates are reusable references, not
  -- job-specific records (see PHASE16_MILESTONE3 doc §22).
  job_id uuid references recruiter_jobs(id) on delete set null,

  filename text not null,
  -- Best-effort pointer into resumeService's in-memory 2h-TTL store
  -- (src/lib/ai/resume/resume-service.ts, unchanged/protected) — used
  -- only for the "Rewrite this resume" deep link. Expected to go stale
  -- well before this row does; never read for scoring/display, which
  -- use resume_data below instead.
  resume_id text,
  -- Full snapshot of the parsed Resume JSON (resume-schema.ts) at
  -- import time — same snapshot-not-reference pattern
  -- resume_versions.resume_data already uses, so candidate display/
  -- scoring never depends on resumeService's ephemeral store surviving.
  resume_data jsonb not null,

  -- resume-score.ts's resumeScorer output, .overall only (candidate-
  -- score.ts's computeScoreBreakdown never read the per-category
  -- breakdown).
  ats_score integer,
  -- Full JdMatchResult (job-description/jd-schema.ts) snapshot from
  -- the most recent match against job_id — null until matched.
  jd_match_result jsonb,
  -- interview-prep's readinessScore.overall only (the one field
  -- candidate-service.ts ever read from a full prep report).
  interview_readiness_score integer,
  -- candidate-insights.ts's CandidateInsights (LLM-generated) — an
  -- expensive result preserved as-is, never silently regenerated.
  insights jsonb,

  status text not null default 'Pending Review' check (status in (
    'Pending Review', 'Shortlisted', 'Interview Scheduled', 'On Hold', 'Offer', 'Hired', 'Rejected'
  )),
  tags text[] not null default '{}',
  notes jsonb not null default '[]',
  notice_period text,
  expected_salary text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruiter_candidates_recruiter_idx on recruiter_candidates (recruiter_id, created_at desc);
create index if not exists recruiter_candidates_job_idx on recruiter_candidates (job_id);

comment on table recruiter_candidates is
  'A recruiter-owned candidate. resume_data/jd_match_result/insights are snapshots of already-computed output from the unmodified resume parser / JD matcher / candidate-insights engines — this table never re-derives or duplicates those engines, only persists what they already produced.';
