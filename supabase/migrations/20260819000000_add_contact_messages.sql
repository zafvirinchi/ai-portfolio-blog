-- Phase 24 Milestone 2 — Contact form durability
--
-- Prior state: POST /api/contact only console.log'd a submission and
-- returned {success: true} — a real visitor's message was invisible to
-- anyone unless someone was watching server logs at that exact moment,
-- and was lost forever on the next deploy/restart. No external email
-- provider is configured anywhere in this repo (no nodemailer/sendgrid/
-- resend/mailer dependency) — adding one is a business decision (which
-- provider, whose inbox), not something this migration/route change
-- should presume. This table is the safest minimal fix reachable with
-- existing architecture: durable storage via the same supabaseAdmin
-- service-role client every other table in this project already uses,
-- queryable via the Supabase SQL Editor (this project's own established,
-- already-relied-upon operational tool) until a real notification
-- pipeline is decided.
--
-- No RLS, consistent with every other table in this project — the
-- service-role route is the only writer, and there is no reader UI yet
-- (see docs/SAAS_LEGAL_REQUIREMENTS.md / the Milestone 2 report's
-- Contact/Support section for the deferred admin-UI decision).
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project. Safe to re-run (every
-- statement is if-not-exists).

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_idx
  on contact_messages (created_at desc);

comment on table contact_messages is
  'Durable storage for /contact form submissions (Phase 24 Milestone 2) — replaces console.log-only capture. No email is sent from this table yet; query it directly via the Supabase SQL Editor until a real notification/email-provider decision is made.';
