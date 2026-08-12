-- Phase 13 — Resume Version Management
--
-- The FIRST persistent, user-owned resume storage in this project.
-- Every existing resume/JD-matching/optimization/rewrite engine (Phase
-- 12, Phase 13 Milestones 1-5 — resume-parser.ts, resume-analyzer.ts,
-- resume-score.ts, jd-parser.ts, jd-matcher.ts, ats-engine.ts,
-- optimizer.ts, resume-optimizer.ts, rewrite-service.ts) is entirely
-- in-memory with a 2-hour TTL and no user association — this table
-- doesn't change any of that. It's a pure snapshot store: a version
-- row captures the already-computed output of those unchanged engines
-- (the parsed Resume JSON, ATS/JD-match scores, matched/missing
-- skills, optimized/rewritten section text) at the moment a logged-in
-- user chooses to save it, so it survives past that 2-hour window and
-- across requests.
--
-- No RLS, consistent with every existing table in this project — all
-- reads/writes go through the service-role supabaseAdmin client;
-- ownership is enforced entirely application-level (every
-- resume-version-service.ts method takes an authenticated userId,
-- resolved server-side, and filters/verifies every row by it — never
-- trusts a userId from the request).
--
-- Deliberately does NOT touch rag_documents / rag_document_chunks —
-- uploaded resumes and their versions are never Knowledge Base
-- documents.
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project. Safe to re-run (every
-- statement is if-not-exists).

create table if not exists resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  version_name text not null,
  version_number integer not null,

  is_master boolean not null default false,
  is_archived boolean not null default false,

  -- The version this one was cloned from — null only for a user's very
  -- first (master) version. Kept even if the source is later archived,
  -- so "how did this resume evolve" (Master v1 -> UAE JD v2 -> ...) is
  -- always reconstructable.
  source_version_id uuid references resume_versions(id) on delete set null,

  target_job_title text,
  target_company text,
  target_location text,
  -- The pasted/uploaded JD's raw text, if this version was created
  -- against one. No separate job-description table exists anywhere in
  -- this project (JD matches are ephemeral, per jd-service.ts) — this
  -- column is the smallest addition that preserves "which JD generated
  -- this version" without inventing one.
  job_description_text text,

  -- Full snapshot of Phase 12's Resume JSON (resume-schema.ts) at the
  -- time this version was created or last explicitly edited.
  resume_data jsonb not null,

  -- General ATS score (resume-score.ts's resumeScorer, no JD needed)
  -- when no job description is attached; the JD-specific ATS score
  -- (job-description/ats-engine.ts, via computeJdMatch) when one is.
  ats_score integer,
  -- computeJdMatch(...)'s overallMatch — null until a JD has been analyzed for this version.
  jd_match_score integer,
  matched_skills jsonb not null default '[]',
  missing_skills jsonb not null default '[]',
  -- Snapshot of the JD-driven optimization output (optimizer.ts's
  -- optimizedSummary/Experience/Projects/Skills, assembled the same
  -- way jd-service.ts's own JdMatchResult already is) — captured once,
  -- never silently recomputed.
  optimized_sections jsonb,
  -- Snapshot of accepted section content from an existing
  -- resume-rewriter.ts session, saved into this version explicitly by
  -- the user — never generated automatically.
  rewritten_sections jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_versions_user_idx on resume_versions (user_id, created_at desc);
create index if not exists resume_versions_source_idx on resume_versions (source_version_id);

-- Exactly one ACTIVE master per user, enforced at the database level
-- (not just application code) — a partial unique index so a demoted
-- former-master (is_master set back to false during "restore as
-- master") can coexist in history without ever violating this.
create unique index if not exists resume_versions_one_master_per_user
  on resume_versions (user_id)
  where is_master and not is_archived;

comment on table resume_versions is
  'Persistent, per-user resume versions — the canonical master plus any number of job/company/role-tailored copies. resume_data is a full snapshot of the Phase 12 Resume JSON; ats_score/jd_match_score/matched_skills/missing_skills/optimized_sections/rewritten_sections are snapshots from the existing, unmodified JD-matching/optimization/rewrite engines. Exactly one row per user may have is_master=true and is_archived=false at once (enforced by resume_versions_one_master_per_user). Never written to rag_documents/rag_document_chunks.';
