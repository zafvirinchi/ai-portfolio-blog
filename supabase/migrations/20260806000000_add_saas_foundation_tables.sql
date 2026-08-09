-- Phase 14 Milestone 1 — Enterprise SaaS Foundation
--
-- Introduces real multi-tenancy: Organizations own Workspaces and have
-- Members with roles (RBAC), invitations, and two separate logs —
-- activity_logs (feature usage, e.g. "Resume Uploaded") and audit_logs
-- (security-relevant admin actions with IP/user-agent). This is the
-- first milestone in this project to create real, foreign-keyed
-- relational tables — every table before this was either flat CRUD
-- with no relationships beyond interview_questions -> interview_topics
-- -> interview_categories, or pure in-memory (Phase 13's AI features).
--
-- Identity is Supabase Auth's own auth.users — there is no separate
-- public users/profiles table in this project, so every user_id column
-- below references auth.users(id) directly, matching how the existing
-- /admin login already relies solely on supabase.auth.getUser().
--
-- No RLS on any of these tables, consistent with every existing table
-- in this project: all reads/writes go through the service-role
-- supabaseAdmin client (src/lib/supabase/admin.ts), and permission
-- enforcement is entirely application-level (src/lib/saas/
-- permission-service.ts), not database-level.
--
-- This repo has no migration tooling (see 20260803000000_add_job_match_
-- rate_limit.sql) — run this file manually once in the Supabase SQL
-- Editor for this project. Safe to re-run (every statement is
-- if-not-exists / or-replace).

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_owner_idx on organizations (owner_id);

comment on table organizations is
  'A tenant. Owns workspaces and members. status=suspended blocks all member access except the owner reactivating it (enforced in tenant-context.ts, not RLS).';

-- ---------------------------------------------------------------------------
-- organization_roles — per-org, seeded from DEFAULT_ROLE_PERMISSIONS on
-- create, editable later (permission-service.ts reads this table, not a
-- hardcoded TS matrix, so one org's role permissions can diverge from
-- another's).
-- ---------------------------------------------------------------------------

create table if not exists organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  role_key text not null check (role_key in ('Owner', 'Admin', 'Recruiter', 'Hiring Manager', 'HR', 'Interviewer', 'Candidate', 'Viewer')),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (organization_id, role_key)
);

create index if not exists organization_roles_org_idx on organization_roles (organization_id);

comment on table organization_roles is
  'Per-organization permission set for each of the 8 named roles, seeded from DEFAULT_ROLE_PERMISSIONS at organization creation and editable per-org thereafter.';

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role_key text not null default 'Viewer',
  status text not null default 'active' check (status in ('active', 'suspended')),
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_org_idx on organization_members (organization_id);
create index if not exists organization_members_user_idx on organization_members (user_id);

comment on table organization_members is
  'One row per (organization, user) membership. role_key must match a role_key seeded into organization_roles for the same organization_id.';

-- ---------------------------------------------------------------------------
-- organization_invitations
-- ---------------------------------------------------------------------------

create table if not exists organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role_key text not null default 'Viewer',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'revoked', 'expired')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists organization_invitations_org_idx on organization_invitations (organization_id);
create index if not exists organization_invitations_email_idx on organization_invitations (email);

comment on table organization_invitations is
  'Invitation-by-email records with a shareable accept token (/invite/[token]). Actual email delivery is out of scope (no mail provider configured in this project) — the token/link is surfaced in the UI for manual sharing. Expiry is enforced lazily on read, not by a DB job.';

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists workspaces_org_idx on workspaces (organization_id);

comment on table workspaces is
  'A sub-division of an organization (e.g. "Engineering Hiring", "Campus Hiring"). Slug is unique per organization, not globally.';

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role_key text not null default 'Viewer',
  added_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_workspace_idx on workspace_members (workspace_id);
create index if not exists workspace_members_user_idx on workspace_members (user_id);

comment on table workspace_members is
  'One row per (workspace, user) membership. A user must already be an organization_members row for that workspace''s organization_id before being added here (enforced in membership-service.ts).';

-- ---------------------------------------------------------------------------
-- activity_logs — feature usage (Resume Uploaded, Job Created, etc.)
-- ---------------------------------------------------------------------------

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete set null,
  user_id uuid references auth.users(id),
  activity_type text not null,
  description text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_org_idx on activity_logs (organization_id, created_at desc);

comment on table activity_logs is
  'Feature-usage events (Resume Uploaded, Candidate Added, Job Created, Knowledge Uploaded, Interview Scheduled, Cover Letter Generated, LinkedIn Optimized, Resume Rewritten). organization_id/user_id are nullable because the underlying AI features remain usable anonymously — a row is only written when a logged-in user with an active organization is present.';

-- ---------------------------------------------------------------------------
-- audit_logs — security-relevant admin/org actions with IP/browser
-- ---------------------------------------------------------------------------

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  object_type text,
  object_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_idx on audit_logs (organization_id, created_at desc);

comment on table audit_logs is
  'Security-relevant SaaS actions (organization/workspace/member/invitation create-update-delete) with requester IP and user-agent. Distinct from activity_logs, which tracks feature usage rather than administrative actions.';
