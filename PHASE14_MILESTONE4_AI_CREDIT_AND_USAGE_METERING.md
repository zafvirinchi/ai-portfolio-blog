# Phase 14 Milestone 4 — AI Credit and Usage Metering

## Goal

Answer, for every AI operation in the platform: how many credits does
the user have, what did each feature/model/operation actually cost,
who consumed it (user + organization), should the operation be
allowed, and what happens when credits run out — without touching
LangGraph, `ConversationService`, the resume/interview/RAG engines, or
any protected file, and without duplicating Milestone 3's billing
schema.

## Key decision: two credit layers, not one

Milestone 3 already shipped a **request-count** credit system
(`credit_transactions` / `usage_tracking`, `checkCredits()` /
`consumeCredits()` in `src/lib/billing/credit-service.ts`) — "you get N
resume uploads this month." This milestone adds a **token-cost**
credit system on top, in the new `src/lib/ai/usage/` package, because
the spec's actual ask — "8 credits for this rewrite, 2 for that
lookup, converted from real `gpt-4o-mini` token pricing" — is a
fundamentally different calculation that M3's flat per-feature counter
cannot produce. Both run side by side in every instrumented route:
M3's check gates *how many times* a feature can be called, M4's check
gates the *shared monthly credit pool* the org has actually paid for.
Neither replaces the other; this was the only way to satisfy "reuse
the existing subscription/plan service" while still implementing
real, configurable, token-based pricing.

## Architecture

```
usageRequestContext (AsyncLocalStorage, usage-context.ts)
  Set by withUsageContext() around a route's whole handler (or
  directly by 3 call sites that need a per-chunk requestId — see
  Knowledge Pipeline below). Never threaded through GraphState,
  ConversationService, or any protected file's signature.
        │
        ▼
usage-meter.ts — meterOpenAiClient(openai) / meterChatModel(llm)
  Wraps .chat.completions.create() / .embeddings.create() / .invoke()
  IN PLACE on the two existing shared client singletons
  (src/lib/ai/openai.ts, src/lib/ai/langchain.ts). Every one of the
  ~44 existing call sites is unchanged — same method, same args, same
  return shape, same thrown errors. When no usageRequestContext is
  set, the wrapped call is the original call, verbatim.
        │
        ▼ (only when a context is set)
usage-service.ts   reserve() → real call → commit() / release()
        │
        ▼
credit-service.ts (src/lib/ai/usage/) — the ONLY caller of the 3
  Postgres RPC functions below. One atomic UPDATE...RETURNING per
  call — this is what actually closes the race condition the spec
  calls out; "check then update" in application code cannot.
        │
        ▼
ai_credits_reserve / ai_credits_commit / ai_credits_release
  (Postgres functions, this milestone's migration) operating on the
  new credit_balances table — one row per (organization, calendar
  month), the whole org's shared AI credit pool.
```

Usage attribution (per-operation history, for `/billing/usage` and
`/admin/usage`) is recorded separately by `usage-service.ts`'s
`record()`, upserting into Milestone 3's existing `usage_tracking` and
`credit_transactions` tables (extended with new columns — see
Migration below), keyed by `request_id` for idempotency.

## Integration points (narrowest shared boundary, per the spec)

Rather than touching `ResumeAnalyzer`, `ATS Engine`, `JD Matcher`,
`Interview Engine`, `PortfolioChain`, or any multi-agent class, metering
was added at the **two shared OpenAI/LangChain client singletons**:

- `src/lib/ai/openai.ts` — `export const openai = meterOpenAiClient(new OpenAI(...))`
- `src/lib/ai/langchain.ts` — `export const llm = meterChatModel(new ChatOpenAI(...), "gpt-4o-mini")`

Every feature that already calls `openai.chat.completions.create()`,
`openai.embeddings.create()`, or `llm.invoke()` is metered automatically,
with zero code changes in the feature itself. Routes only needed one
addition — wrapping their handler body in `withUsageContext(feature,
operation, fn)` to label *which* feature is spending:

| Route | Feature | Operation |
|---|---|---|
| `/api/ai/chat` | `AI_CHAT` | `LLM_CALL` |
| `/api/ai/resume` | `RESUME_ANALYSIS` | `LLM_CALL` |
| `/api/ai/resume/jd-match` | `JD_MATCHING` | `JD_ANALYSIS` |
| `/api/ai/resume-rewriter/[id]/section` | `RESUME_REWRITE` | `REWRITE` |
| `/api/ai/interview-prep` | `INTERVIEW_GENERATION` | `INTERVIEW_GENERATION` |
| `/api/ai/mock-interview`, `.../answer` | `MOCK_INTERVIEW` | `LLM_CALL` |
| `/api/admin/rag-documents` (per chunk) | `KNOWLEDGE_INGESTION` | `EMBEDDING` |

Inside a chat request, the 3 multi-agent classes (`research-agent.ts`,
`reviewer-agent.ts`, `summarizer-agent.ts`) and `rag.tool.ts` each
re-label their own call via `usageFeatureOverrideContext` (one line,
nested inside the outer `AI_CHAT` context) to `MULTI_AGENT_RESEARCH`
/`_REVIEW`/`_SUMMARY` and `KNOWLEDGE_SEARCH` respectively, so per-agent
and RAG-search cost is visible in the breakdown instead of collapsing
into one `AI_CHAT` line.

## Credit model

- **Fixed cost** (`usage-policy.ts` `DEFAULT_FEATURE_COSTS`) — used for
  deterministic operations with no meaningful token count.
- **Token cost** (`usage-calculator.ts` `calculateTokenCost`) — `input
  tokens × input price + output tokens × output price` (config-driven
  via `usage-policy.ts` `modelPricing` map), converted to credits at a
  fixed `CREDITS_PER_DOLLAR = 100` rate (1 credit ≈ $0.01), rounded up
  so any nonzero cost is at least 1 credit.
- **Hybrid** (`calculateHybridCost`) — token-based whenever a real
  model + token counts are available (every real LLM/embedding
  response), falling back to fixed otherwise.

Both feature costs and model pricing are runtime-mutable (in-memory
maps, `updateFeatureCost()` / `updateModelPricing()`) — never
hardcoded inside a feature file — with a minimal config UI at
`/admin/usage` (`UsagePolicyEditor.tsx` → `PATCH
/api/billing/usage/admin/feature-costs` and `.../model-pricing`).

## Reservation, commit, release

Every metered call goes through `reserve() → real call → commit() /
release()` (`usage-meter.ts`'s `meteredCall()`):

1. **`reserve`** — before the call, reserves the feature's fixed cost
   (the real token count isn't known yet) against the org's monthly
   pool via `ai_credits_reserve`. Throws `InsufficientAiCreditsError`
   (never a generic error) if the pool is exhausted.
2. **`commit`** — on success, computes the real cost from the
   response's actual token usage and calls `ai_credits_commit`, which
   shrinks `reserved` by the original estimate and grows `consumed` by
   the real (usually different) amount in one atomic statement.
3. **`release`** — on failure (OpenAI timeout/4xx/5xx, network error,
   thrown exception), returns the unused reservation via
   `ai_credits_release`. No consumption is recorded — the org is never
   charged for a call that never produced a usable response — and the
   original error is re-thrown unchanged, so every existing catch
   block downstream behaves exactly as before this milestone.

## Concurrency

`ai_credits_reserve` is a single `UPDATE credit_balances SET reserved
= reserved + amount WHERE ... AND reserved + consumed + amount <=
monthly_limit RETURNING *` — atomic in Postgres without an explicit
transaction block. Two concurrent requests racing the same pool cannot
both succeed past the limit: the second `UPDATE`'s `WHERE` clause
re-evaluates against whatever the first one already committed, so one
of them deterministically updates 0 rows (`allowed = false`). This is
the only way to close the race the spec calls out; `if (credits >
required)` followed by a separate `update` in application code cannot.

## Idempotency

Every usage record carries a `requestId` (generated once per HTTP
request, or once per embedding chunk in the ingestion loop).
`usage-service.ts`'s `record()` upserts into `usage_tracking` and
`credit_transactions` with `onConflict: "request_id"` — `reserve()`
inserts the row, `commit()`/`release()` update that same row rather
than inserting a second one. Both tables have a non-partial unique
index on `request_id` (Postgres already treats multiple `NULL`s as
non-conflicting, and a non-partial index is what `supabase-js`'s
`upsert(..., {onConflict})` needs to generate a matching `ON CONFLICT`
clause). Reprocessing the same request cannot double-write or
double-charge.

## Plan integration

`MONTHLY_CREDIT_ALLOWANCE` (`usage-policy.ts`) maps Milestone 3's
`PlanKey` (`free` / `professional` / `premium` / `enterprise`) to a
monthly credit pool (500 / 5,000 / 20,000 / unlimited), read via the
existing `getActiveSubscription()` — no new plan table, no duplicated
plan definitions. The pool is **one shared row per organization per
calendar month** (`credit_balances`, unique on `organization_id,
period_start`), matching "each plan owns monthly AI credits" as a
singular pool; per-feature/per-model breakdowns are answered from
`usage_tracking`/`credit_transactions` (which do carry `feature_key`),
not by fragmenting the enforcement pool itself.

## Organization & admin usage

- `/billing` — current plan, monthly/used/remaining credits, reset
  date, usage-percent bar, low/exhausted warnings with Upgrade links.
- `/billing/usage` — total credits used, remaining, estimated cost,
  daily usage chart, usage by feature/model/operation — all computed
  live from `usage_tracking`, with an honest empty state when there's
  no data yet (no invented values).
- `/admin/usage` — platform-wide: total credits/requests, active
  users, failed requests, average cost/user, usage by
  feature/model/organization/day, plus the feature-cost/model-pricing
  config editor.
- Chat integration — "how many credits do I have," "which feature uses
  the most credits," "how much AI usage did I have this month" are
  answered by `resume.tool.ts`'s `handleBillingMessage()` from real
  `usage-service.getSummary()` / `getBalance()` data, reusing the
  existing chat/tool infrastructure (no second AI system).

## Security

Every usage/billing route resolves identity from the authenticated
session (`getTenantContext()`, `createSupabaseServerClient().auth.getUser()`)
— never from the request body or query string. `/admin/usage` and the
config-editing routes are gated the same way every other `/admin/*`
page in this single-operator site already is (authenticated session
required at `AdminLayout`), consistent with the existing convention —
there is no separate platform-admin role system elsewhere in this
codebase to integrate with.

## Observability & privacy

Structured `[ai-usage]` logs at every stage (checked, reserved,
committed, released, recorded, insufficient credits) — feature,
operation, model, amounts, and ids only. No prompt content, resume
text, AI responses, or other PII is ever logged.

## Backward compatibility

`isEnforcementEnabled()` (`usage-policy.ts`) is always `true` in
production; `AI_USAGE_ENFORCEMENT=false` is honored only outside
production, so an empty local/dev billing table never blocks AI
features. Anonymous and no-organization requests never enter
`usageRequestContext` at all (`withUsageContext()` is a pure pass-
through when `getTenantContext()` resolves nothing) — identical to
this milestone never having been added, for every request that isn't
signed in with an organization.

## Migration

`supabase/migrations/20260809000000_add_ai_usage_metering.sql` —
additive only:
- New nullable columns on Milestone 3's existing `credit_transactions`
  and `usage_tracking` tables (this *is* the spec's
  `credit_transactions`/`usage_records` concept — reused, not
  duplicated), plus indexes on `user_id`, `subscription_id`,
  `feature_key`, `model`, and a unique index on `request_id`.
- One new table, `credit_balances` (the running reserved/consumed pool).
- 3 Postgres functions: `ai_credits_reserve`, `ai_credits_commit`,
  `ai_credits_release`.

No RLS (consistent with every existing table in this project — all
reads/writes go through the service-role `supabaseAdmin` client). No
migration tooling exists in this repo; the file is written to be safe
to run manually, more than once, in the Supabase SQL editor.

## Testing

This repository had no test runner at all prior to this milestone.
Added `vitest` (dev dependency only) plus `npm test`, scoped to
`src/lib/ai/usage/**/*.test.ts`:

- `usage-calculator.test.ts` — token-cost math, minimum-1-credit
  rounding, unknown-model fallback, admin-pricing-update reflection,
  fixed/hybrid selection.
- `usage-policy.test.ts` — model pricing / feature cost config
  mutation, hybrid-vs-fixed cost-mode selection per operation,
  `AI_USAGE_ENFORCEMENT` behavior (including the production override).
- `credit-service.test.ts` (mocked Supabase RPC) — reserve
  allow/reject, `InsufficientAiCreditsError` payload correctness,
  commit/release never throwing on a DB error, `getBalance()`
  arithmetic, `UsageReservationError` on RPC failure.
- `usage-service.test.ts` (mocked Supabase + credit-service) —
  no-op reservation when there's no organization or enforcement is
  off, commit/release delegating the right amounts, `record()`'s
  idempotent upsert-by-`request_id` shape, and that a recording
  failure never throws.

35 tests, all passing. **Not covered by an automated test**: the
Postgres functions' actual atomicity under real concurrent
connections — that requires a live database and two real concurrent
sessions, which this environment doesn't have. The atomicity claim
rests on the SQL itself (a single `UPDATE ... WHERE ... RETURNING`
statement, which Postgres always executes as one atomic operation) and
should be verified against a real Supabase instance before relying on
it in production — see Live Verification below.

## Validation

- `npm run lint` — 0 errors (1 pre-existing, unrelated warning: `<img>`
  usage in the blog post template).
- `npx tsc --noEmit` — 0 errors. (Fixed 3 real pre-existing errors in
  `resume.tool.ts` found during this pass: `handleBillingMessage()`
  referenced `getUsageSummary`, `getAiCreditBalance`, and
  `detectUsageFeatureMention` without importing/defining them — wired
  up to `usage-service.ts`'s `getSummary`/`getBalance` and added the
  missing detector function.)
- `npm run build` — succeeds. One benign pre-existing log during static
  generation (`[billing] Plan listing failed, using static fallback`)
  — Milestone 3's own graceful-degradation path when the build
  sandbox has no live `plans` table, unrelated to this milestone.
- `npm test` — 35/35 passing.

## Limitations / not done in this pass

- **Live verification against a real Supabase project** (the 16-step
  checklist in the spec: login, chat, resume upload, JD match,
  rewrite, exhaust credits, upgrade plan) was not run — this sandbox
  has no live Supabase credentials or seeded `plans`/`subscriptions`
  data. The code paths are unit-tested and type-checked, but real
  end-to-end behavior against a live database has not been observed.
- **Rate limiting hooks** (requests/minute/hour, daily, plan-specific)
  were not added — no existing rate-limiter infrastructure was found
  in this codebase to extend, and building a new one was out of scope
  for "reuse existing infrastructure, don't build a second one."
- **KNOWLEDGE_SEARCH / RAG_SEARCH** are metered only when reached
  through the chat tool (`rag.tool.ts`); a hypothetical direct
  RAG-search entry point outside chat would need its own
  `withUsageContext` call.
- Concurrency is guaranteed by the Postgres functions' atomicity, not
  by an automated concurrent-load test (see Testing above).

## Future extensions

- Per-department/team consumption breakdowns, once organization data
  models teams/departments beyond workspaces.
- A real platform-admin role check for `/admin/*`, if this ever
  becomes a genuinely multi-operator platform rather than a
  single-operator site.
- Wiring the rate-limiting hooks once a shared rate-limiter exists
  elsewhere in the codebase.
