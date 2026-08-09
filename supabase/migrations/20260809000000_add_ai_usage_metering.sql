-- Phase 14 Milestone 4 — AI Credit and Usage Metering
--
-- Extends Milestone 3's credit_transactions/usage_tracking tables
-- additively (new nullable columns only — every existing row and every
-- existing query against these two tables keeps working unchanged) and
-- adds one genuinely new table, credit_balances, plus 3 Postgres
-- functions for atomic credit reservation.
--
-- Why a running-balance table + stored procedures, when this project's
-- entire existing pattern (Milestones 1-3) has been pure application-
-- level read-then-write: Milestone 3's credit-service.ts computes
-- "balance" by counting rows on every check, which is fine for its
-- simple per-feature request cap but is NOT safe against two
-- concurrent requests both passing a check before either one's write
-- lands (the exact race condition this milestone's spec explicitly
-- calls out). A single UPDATE ... WHERE ... RETURNING statement is
-- atomic in Postgres without an explicit transaction block — this is
-- the only way to actually close that race, so credit_balances +
-- ai_credits_reserve/commit/release exist specifically for that.
--
-- No RLS on any of these tables/functions, consistent with every
-- existing table in this project: all reads/writes go through the
-- service-role supabaseAdmin client.
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor for this project. Safe to re-run (every
-- statement is if-not-exists / create-or-replace).

-- ---------------------------------------------------------------------------
-- credit_transactions — additive columns for per-operation attribution
-- (Milestone 3 only tracked organization_id/feature_key/amount).
-- ---------------------------------------------------------------------------

alter table credit_transactions add column if not exists user_id uuid references auth.users(id);
alter table credit_transactions add column if not exists subscription_id uuid references subscriptions(id);
alter table credit_transactions add column if not exists operation text;
alter table credit_transactions add column if not exists model text;
alter table credit_transactions add column if not exists request_id text;
alter table credit_transactions add column if not exists input_tokens integer;
alter table credit_transactions add column if not exists output_tokens integer;
alter table credit_transactions add column if not exists total_tokens integer;
alter table credit_transactions add column if not exists status text default 'committed';
alter table credit_transactions add column if not exists metadata jsonb not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credit_transactions_status_check') then
    alter table credit_transactions add constraint credit_transactions_status_check
      check (status in ('reserved', 'committed', 'released', 'failed'));
  end if;
end $$;

create index if not exists credit_transactions_user_idx on credit_transactions (user_id);
create index if not exists credit_transactions_subscription_idx on credit_transactions (subscription_id);
create index if not exists credit_transactions_feature_idx on credit_transactions (feature_key);
create unique index if not exists credit_transactions_request_id_idx on credit_transactions (request_id);

comment on column credit_transactions.request_id is
  'Idempotency key — a plain (non-partial) unique index, since Postgres already treats multiple NULLs as non-conflicting, and a non-partial index is required for supabase-js''s upsert(..., {onConflict: "request_id"}) to generate a matching ON CONFLICT clause. usage-service.ts''s record() upserts by this column: reserve() inserts a row, commit()/release() update that same row rather than inserting a second one.';

-- ---------------------------------------------------------------------------
-- usage_tracking — additive columns; this is the spec's "usage_records"
-- concept, reusing Milestone 3's existing table rather than duplicating it.
-- ---------------------------------------------------------------------------

alter table usage_tracking add column if not exists subscription_id uuid references subscriptions(id);
alter table usage_tracking add column if not exists operation text;
alter table usage_tracking add column if not exists model text;
alter table usage_tracking add column if not exists request_id text;
alter table usage_tracking add column if not exists estimated_credits integer;
alter table usage_tracking add column if not exists actual_credits integer;
alter table usage_tracking add column if not exists input_tokens integer;
alter table usage_tracking add column if not exists output_tokens integer;
alter table usage_tracking add column if not exists status text default 'success';
alter table usage_tracking add column if not exists error_code text;
alter table usage_tracking add column if not exists metadata jsonb not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usage_tracking_status_check') then
    alter table usage_tracking add constraint usage_tracking_status_check
      check (status in ('success', 'failed', 'blocked'));
  end if;
end $$;

create index if not exists usage_tracking_subscription_idx on usage_tracking (subscription_id);
create index if not exists usage_tracking_feature_idx on usage_tracking (feature_key);
create index if not exists usage_tracking_model_idx on usage_tracking (model);
create unique index if not exists usage_tracking_request_id_idx on usage_tracking (request_id);

-- ---------------------------------------------------------------------------
-- credit_balances — running total per (organization, month) — ONE
-- shared pool across every feature, matching "Each plan owns monthly
-- AI credits" (singular pool) in the spec. Per-feature/per-model/
-- per-operation breakdowns are reporting concerns, answered from
-- credit_transactions/usage_tracking (which do carry feature_key) —
-- not a reason to fragment the enforcement pool itself.
-- ---------------------------------------------------------------------------

create table if not exists credit_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_start timestamptz not null,
  monthly_limit integer,
  reserved integer not null default 0,
  consumed integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, period_start)
);

create index if not exists credit_balances_org_idx on credit_balances (organization_id, period_start desc);

comment on table credit_balances is
  'Running reserved/consumed totals for the token-cost-derived credit pool (distinct from credit_transactions'' request-count ledger). monthly_limit null = unlimited. One row per (org, calendar month), shared across every feature, only ever mutated through the 3 functions below.';

-- ---------------------------------------------------------------------------
-- Atomic reserve/commit/release — each a single UPDATE ... RETURNING
-- statement, atomic in Postgres without an explicit transaction block.
-- ---------------------------------------------------------------------------

create or replace function ai_credits_reserve(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_monthly_limit integer,
  p_amount integer
) returns table(allowed boolean, reserved integer, consumed integer, monthly_limit integer) as $$
declare
  v_row credit_balances%rowtype;
begin
  insert into credit_balances (organization_id, period_start, monthly_limit, reserved, consumed)
  values (p_organization_id, p_period_start, p_monthly_limit, 0, 0)
  on conflict (organization_id, period_start) do nothing;

  update credit_balances
  set reserved = credit_balances.reserved + p_amount,
      monthly_limit = p_monthly_limit,
      updated_at = now()
  where organization_id = p_organization_id
    and period_start = p_period_start
    and (p_monthly_limit is null or credit_balances.reserved + credit_balances.consumed + p_amount <= p_monthly_limit)
  returning * into v_row;

  if v_row.organization_id is null then
    select * into v_row from credit_balances cb
      where cb.organization_id = p_organization_id and cb.period_start = p_period_start;
    return query select false, v_row.reserved, v_row.consumed, v_row.monthly_limit;
  else
    return query select true, v_row.reserved, v_row.consumed, v_row.monthly_limit;
  end if;
end;
$$ language plpgsql;

comment on function ai_credits_reserve is
  'Atomically increments reserved by p_amount only if the resulting total stays within monthly_limit — 0 rows updated (allowed=false) means insufficient credits, race-free under concurrent callers.';

create or replace function ai_credits_commit(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_reserved_amount integer,
  p_actual_amount integer
) returns table(reserved integer, consumed integer) as $$
declare
  v_row credit_balances%rowtype;
begin
  update credit_balances
  set reserved = greatest(0, credit_balances.reserved - p_reserved_amount),
      consumed = credit_balances.consumed + p_actual_amount,
      updated_at = now()
  where organization_id = p_organization_id
    and period_start = p_period_start
  returning * into v_row;

  return query select v_row.reserved, v_row.consumed;
end;
$$ language plpgsql;

comment on function ai_credits_commit is
  'Converts a reservation into real consumption in one atomic statement — reserved shrinks by the original estimate, consumed grows by the real (usually different) cost computed from actual token usage.';

create or replace function ai_credits_release(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_amount integer
) returns table(reserved integer, consumed integer) as $$
declare
  v_row credit_balances%rowtype;
begin
  update credit_balances
  set reserved = greatest(0, credit_balances.reserved - p_amount),
      updated_at = now()
  where organization_id = p_organization_id
    and period_start = p_period_start
  returning * into v_row;

  return query select v_row.reserved, v_row.consumed;
end;
$$ language plpgsql;

comment on function ai_credits_release is
  'Returns an unused reservation (failed/errored operation) atomically — no consumption is recorded, since no tokens were actually billed by the provider.';
