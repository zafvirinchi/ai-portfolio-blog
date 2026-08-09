-- Phase 14 Milestone 3 — Subscription and Billing
--
-- Introduces real subscription billing, scoped to the Organization
-- (not the individual user) — matches "Organization seats" in the
-- spec and how this app already models tenancy (Milestone 1).
-- Payment processing goes through a provider abstraction
-- (src/lib/billing/billing-provider.ts); Stripe is the only real
-- adapter implemented, so provider_customer_id/provider_subscription_id/
-- provider_payment_id are free-text columns keyed by `provider`, not
-- Stripe-specific foreign keys — a future Razorpay/PayPal/Paddle/
-- LemonSqueezy adapter needs no schema change.
--
-- Every organization implicitly has a Free plan the moment one is
-- asked for (see subscription-service.ts's getActiveSubscription()) —
-- a `subscriptions` row is only ever created for a *paid* or
-- explicitly-trialing plan, so an organization with no row here is by
-- definition on the Free plan. This is the same fallback pattern
-- Milestone 1 used for organization_roles defaulting to
-- DEFAULT_ROLE_PERMISSIONS.
--
-- No RLS on any of these tables, consistent with every existing table
-- in this project: all reads/writes go through the service-role
-- supabaseAdmin client, and enforcement is entirely application-level.
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project. Safe to re-run (every
-- statement is if-not-exists).

-- ---------------------------------------------------------------------------
-- plans — seeded at app startup from plan-service.ts's PLAN_DEFINITIONS
-- constant (Free/Professional/Premium/Enterprise), editable afterward.
-- ---------------------------------------------------------------------------

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('free', 'professional', 'premium', 'enterprise')),
  name text not null,
  monthly_price_cents integer not null default 0,
  yearly_price_cents integer not null default 0,
  limits jsonb not null default '{}',
  priority_support boolean not null default false,
  api_access boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table plans is
  'The 4 plan tiers. Seeded from plan-service.ts''s PLAN_DEFINITIONS constant. limits is a jsonb map of feature_key -> monthly allotment (null = unlimited).';

-- ---------------------------------------------------------------------------
-- subscriptions — one per organization on a paid or explicitly-trialing
-- plan. No row = implicit Free plan (see header comment above).
-- ---------------------------------------------------------------------------

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled', 'grace_period')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'yearly')),
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at timestamptz,
  grace_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create index if not exists subscriptions_org_idx on subscriptions (organization_id);
create index if not exists subscriptions_provider_sub_idx on subscriptions (provider_subscription_id);

comment on table subscriptions is
  'One row per organization (unique constraint) — an org can only have one active subscription at a time. provider/provider_*_id are free-text, not FKs, so new payment providers need no schema change.';

-- ---------------------------------------------------------------------------
-- payments — reconciled from provider webhook events.
-- ---------------------------------------------------------------------------

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  provider text not null default 'stripe',
  provider_payment_id text,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null default 'succeeded' check (status in ('succeeded', 'failed', 'pending', 'refunded')),
  created_at timestamptz not null default now()
);

create index if not exists payments_org_idx on payments (organization_id, created_at desc);

comment on table payments is
  'One row per payment attempt reconciled from a provider webhook (checkout.session.completed / invoice.paid / invoice.payment_failed for Stripe).';

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  invoice_number text not null unique,
  amount_cents integer not null,
  tax_cents integer not null default 0,
  discount_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'paid' check (status in ('paid', 'open', 'void', 'uncollectible')),
  created_at timestamptz not null default now()
);

create index if not exists invoices_org_idx on invoices (organization_id, created_at desc);

comment on table invoices is
  'PDF is rendered on demand from this row (invoice-pdf-renderer.ts, pdfkit) — never stored as a file.';

-- ---------------------------------------------------------------------------
-- credit_transactions — every AI-credit deduction, for credit history
-- and the low-credit-warning UI.
-- ---------------------------------------------------------------------------

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  feature_key text not null,
  amount integer not null,
  balance_after integer,
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_org_idx on credit_transactions (organization_id, created_at desc);

comment on table credit_transactions is
  'One row per credit deduction. amount is negative for a consumption, positive for a monthly reset/grant. balance_after is the running total for that feature_key after this transaction.';

-- ---------------------------------------------------------------------------
-- usage_tracking — one row per AI feature invocation (broader than
-- credit_transactions, which only covers the credit ledger).
-- ---------------------------------------------------------------------------

create table if not exists usage_tracking (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  feature_key text not null,
  credits_consumed integer not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists usage_tracking_org_idx on usage_tracking (organization_id, created_at desc);

comment on table usage_tracking is
  'Feature-level usage log (timestamp, credits consumed, processing duration) backing /billing/history.';

-- ---------------------------------------------------------------------------
-- coupons — reusable definitions, mirrors Stripe's own Coupon object.
-- ---------------------------------------------------------------------------

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage', 'flat')),
  value integer not null,
  max_redemptions integer,
  redemption_count integer not null default 0,
  recurring boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table coupons is
  'value is a percentage (1-100) when discount_type=percentage, or cents when discount_type=flat. max_redemptions null = unlimited.';

-- ---------------------------------------------------------------------------
-- discounts — the applied instance of a coupon on an organization's
-- subscription, mirrors Stripe's own Discount object.
-- ---------------------------------------------------------------------------

create table if not exists discounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  coupon_id uuid not null references coupons(id),
  subscription_id uuid references subscriptions(id) on delete set null,
  applied_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists discounts_org_idx on discounts (organization_id);

comment on table discounts is
  'One row per coupon redemption on a specific organization''s subscription.';
