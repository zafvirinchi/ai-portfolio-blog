-- Phase 18 Milestone 2 — Stripe Platform Billing
--
-- Audited first: src/lib/billing/* (Phase 14 M3) already has a complete,
-- real, working Stripe integration (stripe-provider.ts: checkout/portal/
-- cancel/resume/webhook-signature-verification) — but its `subscriptions`
-- table is organization-scoped (organization_id not null, unique per
-- org) and its checkout flow prices subscriptions dynamically via
-- Stripe's `price_data` (a fresh ad-hoc Price object per checkout,
-- convenient for coupon-adjusted amounts). Neither fits the PLATFORM
-- (individual Supabase user) billing model this milestone adds: a user
-- can hold multiple roles (Step 3, Phase 18 M1) and — per this
-- milestone's own instruction that "billing should therefore be
-- independent of persona" — could in principle hold a paid subscription
-- for MORE THAN ONE role's plan family at once (e.g. Job Seeker Pro AND
-- Recruiter Pro), which the organization schema's "one subscription per
-- tenant" unique constraint cannot represent even if repurposed.
--
-- These two tables are the minimum needed to give
-- entitlement-service.ts's resolveEffectivePlans() (Phase 18 M1,
-- extended in M2) a real, Stripe-synchronized answer instead of always
-- FREE. Genuinely new persistence, not a rename/extension of the
-- organization tables above.
--
-- Deliberately NOT created here: a webhook-event dedup table. Every
-- write this migration's tables receive is an UPSERT keyed on a real
-- unique Stripe id (stripe_customer_id / stripe_subscription_id) —
-- replaying the same webhook event re-writes the identical row, which
-- is already safe without a separate idempotency ledger. See
-- PHASE18_MILESTONE2_STRIPE_BILLING.md, "Idempotency strategy", for the
-- full reasoning. Also deliberately not created: platform-level
-- invoice/payment/coupon tables — out of this milestone's scope (see
-- same document, "Database changes").
--
-- No RLS, consistent with every existing table in this project
-- (organizations, subscriptions, platform_entitlement_overrides,
-- platform_usage_events, etc.) — all reads/writes go through the
-- service-role supabaseAdmin client from platform-stripe-service.ts;
-- enforcement is entirely application-level. Stripe itself remains the
-- payment-provider source of truth; these tables are a synchronized
-- projection only, never authoritative for whether a charge actually
-- succeeded.
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project. Safe to re-run (every
-- statement is if-not-exists).

-- ---------------------------------------------------------------------------
-- platform_billing_customers — one row per Supabase user who has ever
-- started platform checkout, mapping them to their Stripe Customer.
-- ---------------------------------------------------------------------------

create table if not exists platform_billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (stripe_customer_id)
);

comment on table platform_billing_customers is
  'One Stripe Customer per Supabase user (never per-role — a single Stripe Customer can hold multiple subscriptions). email is a snapshot for display only, never re-derived as an identity source; the real, current email always comes from the Supabase session at checkout time. Written only by platform-stripe-service.ts, using supabaseAdmin — never reachable from a client-supplied userId/customerId.';

-- ---------------------------------------------------------------------------
-- platform_subscriptions — one row per real Stripe subscription. A user
-- may have more than one (multi-role — Step 3): user_id is deliberately
-- NOT unique, only stripe_subscription_id is. Preventing two
-- SIMULTANEOUS ACTIVE subscriptions for the same plan family (e.g. two
-- Job Seeker subscriptions at once) is enforced in application code at
-- checkout time (platform-stripe-service.ts), not by a DB constraint —
-- a correct partial-unique-index for "at most one active/trialing/
-- past_due row per (user_id, plan family)" was judged unnecessary
-- complexity for what checkout-time application logic already prevents
-- in the only place a new row is ever created.
-- ---------------------------------------------------------------------------

create table if not exists platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  stripe_price_id text not null,
  plan_id text not null check (plan_id in ('JOB_SEEKER_PRO', 'JOB_SEEKER_PREMIUM', 'RECRUITER_PRO', 'RECRUITER_BUSINESS')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stripe_subscription_id)
);

create index if not exists platform_subscriptions_user_idx on platform_subscriptions (user_id);
create index if not exists platform_subscriptions_status_idx on platform_subscriptions (status);
create index if not exists platform_subscriptions_user_status_idx on platform_subscriptions (user_id, status);

comment on table platform_subscriptions is
  'One row per real Stripe subscription (never fabricated — only ever written from a verified Stripe webhook event, see stripe-webhook-service.ts). plan_id is restricted to the 4 currently Stripe-backed PlatformPlanKeys (platform-plan-registry.ts) — JOB_SEEKER_FREE/RECRUITER_FREE never appear here, since a Free "plan" has no Stripe subscription behind it by definition. status mirrors real Stripe subscription statuses (not the organization subscriptions table''s own invented "grace_period" derived state) — see PHASE18_MILESTONE2_STRIPE_BILLING.md, "Subscription-state mapping", for the exact entitlement policy per status.';
