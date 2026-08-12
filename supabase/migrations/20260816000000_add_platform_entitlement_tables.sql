-- Phase 18 Milestone 1 — Billing, Plans & Entitlement Architecture
--
-- Audited first: src/lib/billing/* (Phase 14 Milestone 3) already has a
-- complete plans/subscriptions/credit-metering system — but it is
-- ORGANIZATION-scoped end to end (subscriptions.organization_id not
-- null, credit-service.ts's checkCredits()/consumeCredits() both
-- silently no-op whenever no organization resolves — see their own doc
-- comments). organizations are never auto-created on signup
-- (confirmed: the only creation path is POST /api/saas/organizations, a
-- deliberate user action), so the overwhelming majority of this
-- platform's actual usage — every anonymous ephemeral-tool session
-- (resume analyzer, job match, interview prep, mock interview) plus
-- every logged-in individual user who has never created/joined an
-- organization — has NO organization and is therefore untouched by
-- that entire system today.
--
-- This migration adds the two tables genuinely needed for the NEW,
-- parallel, per-USER entitlement layer (platform-plan-registry.ts /
-- entitlement-service.ts) that fills that gap — and only those two.
-- Deliberately NOT created here (see PHASE18_MILESTONE1's own
-- documentation, "Database decision"): a user-level `subscriptions`
-- table (no real subscription exists without a payment provider — FREE
-- is always the correct default, exactly like organizations' own
-- implicit-Free pattern in subscription-service.ts), `billing_events`,
-- or any payment/transaction table.
--
-- No RLS on either table, consistent with every existing table in this
-- project (organizations, subscriptions, recruiter_candidates, etc.):
-- all reads/writes go through the service-role supabaseAdmin client;
-- enforcement is entirely application-level (entitlement-service.ts
-- never accepts a userId from a request body — always server-derived
-- from the Supabase session, mirroring resume-version-auth.ts's
-- requireUserId()).
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project. Safe to re-run (every
-- statement is if-not-exists).

-- ---------------------------------------------------------------------------
-- platform_entitlement_overrides — admin-granted/revoked feature access
-- for one user, independent of their resolved plan. The ONE piece of
-- entitlement state that must be genuinely persisted even before any
-- payment provider exists (promotional access, beta access, manually
-- honoring an enterprise/support agreement) — everything else this
-- milestone needs (plan catalog, role-to-plan defaults) is a pure,
-- static, in-code definition (platform-plan-registry.ts), not a table.
-- ---------------------------------------------------------------------------

create table if not exists platform_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_id text not null,
  access text not null check (access in ('GRANTED', 'REVOKED')),
  reason text,
  granted_by uuid references auth.users(id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists platform_entitlement_overrides_user_idx on platform_entitlement_overrides (user_id, feature_id);

comment on table platform_entitlement_overrides is
  'Admin-only grant/revoke of one featureId for one user, layered on top of their resolved plan (entitlement-service.ts checks this BEFORE falling back to the plan matrix). expires_at null = permanent; revoked_at non-null = manually deactivated without deleting the audit row. granted_by is always the acting admin''s own server-derived userId, never client-supplied. Never written to by any client-facing route — only by a future admin-only API (not built in this milestone).';

-- ---------------------------------------------------------------------------
-- platform_usage_events — one row per billable operation actually
-- performed (never per request merely received — see
-- entitlement-service.ts's recordUsage(), only ever called after the
-- real work succeeds). Deliberately minimal columns: this milestone's
-- quota checks only need "how many of metric X has this user triggered
-- since period start", not a duration/cost ledger like the
-- organization-scoped usage_tracking table already has.
-- ---------------------------------------------------------------------------

create table if not exists platform_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists platform_usage_events_lookup_idx on platform_usage_events (user_id, metric, occurred_at desc);

comment on table platform_usage_events is
  'One row per successfully-completed billable operation (checkQuota()/recordUsage() in entitlement-service.ts). Never written on a validation failure, an auth failure, or a requireFeature()/requireQuota() rejection. Counted by period (DAY/MONTH/LIFETIME, see UsageDefinition) via occurred_at range queries — no separate monthly-reset job needed.';
