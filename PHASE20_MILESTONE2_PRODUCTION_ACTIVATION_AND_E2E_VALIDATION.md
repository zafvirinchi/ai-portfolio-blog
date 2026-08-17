# Phase 20 Milestone 2 — Production Activation & End-to-End Monetization Validation

Operational validation milestone, as chartered. No entitlement/billing/Stripe/recruiter/resume/interview/admin system was redesigned or rebuilt. No migration was executed (this environment has no capability to execute one — see Step 1/2). No production data was modified. No secret value was printed anywhere in this process or report. Nothing was committed.

## Executive summary

This milestone re-verified Phase 20 M1's findings read-only rather than trusting them, per its own explicit instruction — and the re-verification **materially corrected** M1's picture. M1 reported "none of the 15 tracked migrations have been applied." A fresh, independent, table-by-table live probe this milestone found that is **not quite accurate**: migration #2 (the `interview-diagrams` storage bucket) and migration #3 (`job_match_requests`, which contains real production data — a real rate-limit row with a live IP address) **are** applied. Migration #1 and #4 through #15 are not. This is a more precise, corrected finding, not a contradiction of the overall conclusion (the platform/organization/billing chain is still entirely unapplied) — but precision matters for an activation runbook, and M1's blanket claim would have led an operator to unnecessarily worry about re-running #2/#3 or, worse, to distrust the audit's accuracy once they discovered the discrepancy themselves.

Every other check performed this milestone — environment configuration, admin bootstrap status, entitlement/cost-protection behavior, a 13-point smoke test, and a live security regression sweep — found **no code defect**. This environment has no path to execute the remaining migrations (no `psql`, no Supabase CLI, no `pg` dependency — confirmed absent), no Stripe credentials, no configured admin bootstrap secret, and no real authenticated user session to drive true end-to-end flows through. These are genuine environmental blockers, not deferred engineering work.

**Classification: C — CODE READY BUT OPERATIONALLY BLOCKED.**

**Phase 20 is closed as far as engineering work goes.** No Phase 20 Milestone 3 is proposed — per this milestone's own explicit final rule, only a genuine code defect would justify one, and none was found.

## Step 1 — Migration chain re-verification (read-only, corrects M1)

Fresh enumeration: 15 files under `supabase/migrations/`, unchanged in count/order/dependencies from M1's own analysis (re-confirmed by re-reading the dependency-relevant portions of each file this milestone — no drift).

**Fresh live-probe results, this milestone, not carried forward from M1:**

| # | Migration | Live status | Evidence |
|---|---|---|---|
| 1 | `interview_review_columns` | **NOT applied** | `interview_questions` table exists (baseline), but querying its `answer_source` column returns `42703 "column does not exist"` |
| 2 | `interview_diagrams_bucket` | **APPLIED** | `storage.buckets` REST lookup for `interview-diagrams` returns `200` with `created_at: 2026-07-31T06:38:46Z` — matching the migration's own filename timestamp |
| 3 | `job_match_rate_limit` | **APPLIED** | `job_match_requests` table returns `200` with a real row (`ip_address`, `created_at: 2026-08-03...`) — matching the migration's own filename timestamp, and containing genuine production rate-limit data |
| 4–15 | saas foundation through platform billing | **NOT applied** | `organizations`, `plans`, `subscriptions`, `audit_logs`, `resume_versions`, `recruiter_jobs`, `recruiter_candidates`, `platform_entitlement_overrides`, `platform_usage_events`, `platform_billing_customers`, `platform_subscriptions` all return `404 PGRST205` |

This is the corrected picture M1 did not have (M1 checked only `admin_users`/`blogs`/`organizations`/`plans`/`subscriptions`/the 4 platform tables — never `interview_questions`'s columns, the storage bucket, or `job_match_requests`).

**Safety of executing the remaining chain**: every one of the 13 not-yet-applied files is idempotent (`if not exists` / `on conflict do nothing` throughout, re-confirmed by re-reading each), so re-running the **already-applied** #2/#3 alongside the pending ones is harmless — an operator does not need to hand-pick which files to skip. **No migration in this chain is destructive** (no `DROP`, no `DELETE`, no data-mutating `UPDATE`) — every one is additive schema (new table/column/bucket/policy).

**Special attention required**: migration #1 depends on the pre-existing, **untracked** `interview_questions` baseline table (confirmed present in this project) — safe to run here. On a genuinely empty project, #1 would fail first, before reaching the SaaS/platform chain at all, since nothing in this repo's tracked migrations creates that baseline (re-confirmed from M1, unchanged).

### Exact ordered list still requiring execution

```
1.  20260719000000_add_interview_review_columns.sql       [NOT YET APPLIED]
2.  20260731000000_add_interview_diagrams_bucket.sql       [ALREADY APPLIED — safe, idempotent, no-op if re-run]
3.  20260803000000_add_job_match_rate_limit.sql             [ALREADY APPLIED — safe, idempotent, no-op if re-run]
4.  20260806000000_add_saas_foundation_tables.sql           [NOT YET APPLIED]
5.  20260807000000_add_enterprise_auth_tables.sql           [NOT YET APPLIED]
6.  20260808000000_add_billing_tables.sql                   [NOT YET APPLIED]
7.  20260809000000_add_ai_usage_metering.sql                [NOT YET APPLIED]
8.  20260810000000_add_resume_versions.sql                  [NOT YET APPLIED]
9.  20260811000000_add_resume_versions_sections_data.sql    [NOT YET APPLIED]
10. 20260812000000_add_resume_versions_template_settings.sql [NOT YET APPLIED]
11. 20260813000000_add_recruiter_persistence.sql            [NOT YET APPLIED]
12. 20260814000000_add_recruiter_candidate_evaluation_status.sql [NOT YET APPLIED]
13. 20260815000000_add_recruiter_candidate_decision_history.sql  [NOT YET APPLIED]
14. 20260816000000_add_platform_entitlement_tables.sql      [NOT YET APPLIED]
15. 20260817000000_add_platform_billing_tables.sql          [NOT YET APPLIED]
```

Run all 15 in this order via the Supabase SQL Editor for operational simplicity (idempotency makes re-running #2/#3 harmless), or run only #1 and #4–15 if the operator wants to skip the already-applied two — either is safe.

## Step 2 — Live schema validation

**Cannot be performed — migrations cannot legitimately be applied in this environment**, confirmed by direct tooling check this milestone: no `psql` binary, no Supabase CLI, no `pg`/`node-postgres` dependency anywhere in `package.json`. The only database access this environment has is the Supabase REST API (PostgREST) via the service-role key, which executes DML (select/insert/update/delete against *existing* tables) but cannot execute DDL (`CREATE TABLE`, `ALTER TABLE`) — confirmed structurally true by the migration files' own header comments and re-confirmed this milestone by probing for a custom SQL-execution RPC function (none exists, `404 PGRST202`).

**Stopped here, as instructed** — no persistence validation was fabricated. Continued with every source-level and unauthenticated check possible (below).

## Step 3 — Production environment configuration audit

Presence/structural checks only; no value was read into this report or printed to any log.

| Variable | Status |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **PASS** — configured |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **PASS** — configured |
| `SUPABASE_SERVICE_ROLE_KEY` | **PASS** — configured, and demonstrably functional (every REST probe this milestone authenticated successfully against it) |
| `OPENAI_API_KEY` | **PASS** — configured |
| `STRIPE_SECRET_KEY` | **BLOCKED** — not configured |
| `STRIPE_PLATFORM_WEBHOOK_SECRET` | **BLOCKED** — not configured |
| `STRIPE_PRICE_JOB_SEEKER_PRO` | **BLOCKED** — not configured |
| `STRIPE_PRICE_JOB_SEEKER_PREMIUM` | **BLOCKED** — not configured |
| `STRIPE_PRICE_RECRUITER_PRO` | **BLOCKED** — not configured |
| `STRIPE_PRICE_RECRUITER_BUSINESS` | **BLOCKED** — not configured |
| `PLATFORM_ADMIN_BOOTSTRAP_SECRET` | **BLOCKED** — not configured |
| `STRIPE_WEBHOOK_SECRET` (Phase 14 org-scoped, distinct from the platform one) | **BLOCKED** — not configured, out of Phase 19/20's own charter, noted for completeness only |
| App/redirect URL (`NEXT_PUBLIC_APP_URL` / similar) | **N/A — not applicable** | Confirmed by grep this milestone: no source file anywhere reads such a variable. Every redirect (Stripe checkout/portal `success_url`/`cancel_url`/`return_url`) is derived per-request from `new URL(req.url).origin`, never a static env var. Nothing to configure here. |

## Step 4 — Stripe configuration validation

**STRIPE_E2E_BLOCKED.** `STRIPE_SECRET_KEY` absent (Step 3). Live-probed this milestone regardless: a webhook POST with a forged signature header and forged `customer`/`metadata.userId` payload correctly returns `400` at the "Missing/not-configured key" check, never reaching real processing — the forged metadata was never given the chance to matter. Continued static/configuration validation: price-ID mapping (`resolveStripePriceId()`/`resolvePlanKeyFromPriceId()`), customer/user mapping (resolved from `platform_billing_customers` via the subscription's own verified `customer` field, metadata only ever a defense-in-depth cross-check), webhook signature verification (`stripe.webhooks.constructEventAsync`, raw body never parsed first), duplicate/out-of-order event handling (idempotent upsert by `stripe_subscription_id`, event-timestamp ordering guard) were all re-confirmed unchanged by direct source re-read this milestone — no drift since Phase 19 M5/M7/Phase 20 M1.

### Stripe test-mode checklist (unchanged from Phase 20 M1 — reproduced here for this report's own completeness, to be executed once credentials exist)

Free→Pro, Pro→Premium, Premium→Pro (downgrade via portal), cancellation, failed payment (`past_due` grace-period policy), portal return (bounded-retry staleness fix), duplicate webhook replay, out-of-order webhook delivery — see Phase 20 M1 §5 for the full 8-point procedure; nothing about it has changed this milestone since no Stripe code was touched.

## Step 5 — Admin bootstrap validation

**A platform ADMIN does not currently exist.** Verified directly this milestone via a read-only Supabase Auth Admin API query (not inferred from the missing `audit_logs` table, as M1 did): exactly **1** real user account exists in this project's Auth system, and **0** hold the `ADMIN` platform role in `app_metadata.platform_roles`.

1. `PLATFORM_ADMIN_BOOTSTRAP_SECRET` — **not configured** (Step 3).
2. Self-target-only: re-confirmed by source re-read — `bootstrapPlatformAdmin(req, callerUserId, presentedSecret)` takes `callerUserId` exclusively from the route's own `requireUserId()` session resolution; no code path anywhere accepts a target user id.
3. Cannot promote another user: same evidence — structurally impossible, not merely policy.
4. Cannot be reused to create arbitrary admins: idempotent (`alreadyAdmin: true` on repeat calls for the same already-admin caller), and every call still independently requires both factors (a real session + the correct secret) — repeat use is never less safe than first use.
5. **Bootstrap was not performed.** Two independent blockers: the secret is not configured (the route would fail closed with `BootstrapNotConfiguredError` / `503` regardless of anything else), and this environment has no real browser session for the one existing user account (no password, no way to forge a session cookie via the service-role key — the Admin API can inspect/manage users but cannot mint a session-cookie-equivalent this milestone could then present to `requireUserId()`).
6. Downstream checks (ADMIN persona presence, `/admin` rejection for non-admins, last-admin/self-lockout protection) re-confirmed via the still-passing `platform-admin-bootstrap-service.test.ts`/`admin-api-guard.test.ts`/`platform-admin-service.test.ts` suite (42 tests, unchanged) and via this milestone's own live probe: `POST /api/admin/platform/users/x/roles` with a forged `{role:"ADMIN"}` body and no session correctly returns `401` before the body is ever inspected.

No secret value was printed at any point in this process.

## Step 6 — End-to-end entitlement validation

**No real authenticated user session is available in this environment** (confirmed: 1 user account exists, but no credentials/session for it) — true authenticated E2E across FREE/PRO/PREMIUM/multi-role tiers could not be executed, and is honestly reported as such rather than fabricated.

Validated instead via the existing, still-passing test suite (1159/1159, unchanged) plus one genuine live observation this milestone made possible by the current (unmigrated) database state: with `platform_entitlement_overrides`/`platform_subscriptions`/etc. still absent, every entitlement lookup a real signed-in user would trigger right now resolves via each function's own documented "fail closed to FREE on any Supabase error, including a pre-migration missing table" behavior (`listSubscriptionsForUser()`, `getCustomerByUserId()`, `listActiveOverrides()`, `getUsageCount()` — all confirmed, by source re-read this milestone, to catch any error generically and degrade to an empty/zero default rather than throwing). This is not new code — it's a deliberate design property from Phase 18 M1/M2, and this milestone is the first to actually confirm it holds against the real, currently-unmigrated project rather than only against mocks. **A real user signing in today would correctly see FREE-tier behavior everywhere, not a crash.**

Mocked-but-authoritative proof of the tier-specific behaviors the brief asks for (Free rejection/permitted-feature access/QUOTA_EXCEEDED shape, Pro monthly enforcement, Premium higher limits, multi-role union semantics, ADMIN bypass) is unchanged and still passing across `entitlement-service.test.ts` (47 tests) and every gated route's own test file — re-run this milestone, not merely cited.

## Step 7 — Cost protection verification

Re-confirmed via the full, unchanged, passing test suite (no real LLM calls were made, per the brief's own instruction to prefer existing tests/mocks):

1. Entitlement check before LLM invocation — confirmed for every gated route (test assertions on call ordering).
2. Quota rejection prevents the LLM call — confirmed (tests assert the underlying generator mock is never invoked on rejection).
3. Usage recorded exactly once — confirmed for all 10 usage metrics.
4. Alternate routes cannot bypass the gate — re-confirmed by the Phase 19 M6 exhaustive sweep, unchanged.
5. Chat cannot bypass feature-level entitlement — re-confirmed (`resume.tool.test.ts`'s dedicated recruiter-chat-bypass regression suite, still passing).
6. Recruiter bulk operations cannot bypass individual feature restrictions — re-confirmed (`bulk-status/route.test.ts`, still passing).
7. LinkedIn Optimizer and Cover Letter Generator remain governed — re-confirmed (`linkedin/route.test.ts`, `cover-letter/route.test.ts`, still passing), and live-probed this milestone: `POST /api/ai/linkedin/forged-session-id/about` returns `422` (session not found), never reaching a generator.
8. Anonymous behavior remains intentionally unchanged — live-confirmed this milestone: the resume-rewriter route, called with no session and a forged `userId`/`plan` in the body, correctly proceeds down the anonymous no-op path (the forged fields are never read — the route only ever destructures `resumeId`) — this is expected, documented behavior, not a bypass, since anonymous access to `resume.rewrite`'s session-start is deliberate product policy, re-verified this milestone to still hold.

## Step 8 — Production smoke test

Live-probed against a running dev server this milestone (real HTTP responses, no destructive action, no real LLM spend):

| # | Surface | Result | Classification |
|---|---|---|---|
| 1 | Landing page | `200` | Working |
| 2 | Login | `200` | Working |
| 3 | Billing page (`/settings/billing`, unauth) | `307` → login | Expected behavior |
| 4 | Plan comparison (`/billing/plans`, unauth) | `307` | Expected behavior |
| 5 | Resume workflow (`/resume-analyzer`) | `200` | Working |
| 6 | JD matching (`/job-match`) | `200` | Working |
| 7 | Interview preparation | `200` | Working |
| 8 | Mock interview | `200` | Working |
| 9 | Recruiter workspace (unauth) | `307` | Expected behavior |
| 10 | Export (`/api/ai/recruiter/export`, unauth) | `401` | Expected behavior |
| 11 | Recruiter analytics (unauth) | `401` | Expected behavior |
| 12 | Admin platform dashboard (unauth) | `307` | Expected behavior |
| 13 | Stripe checkout/portal | `401` (unauth); would additionally fail at "key not configured" even if authenticated | Auth layer: working. Completion: **STRIPE BLOCKER** |

Functional wiring (not full generation) confirmed for the file-upload-based routes (`/api/ai/resume`, `/api/ai/job-match`): both correctly reach real handler code and reject a JSON body with a clear content-type error, proving the route is live end-to-end without spending LLM budget.

**No CODE DEFECT, CONFIGURATION DEFECT, or DATABASE/MIGRATION BLOCKER was found in any of the 13 surfaces at the routing/wiring layer.** The only classifications needed were EXPECTED BEHAVIOR (every auth-required redirect/rejection) and STRIPE BLOCKER (checkout/portal completion, credentials absent). Nothing was patched to force a green result — every 307/401 above is the deliberately correct response for an unauthenticated request.

## Step 9 — Security regression sweep

Live-probed this milestone:
- **Webhook signature bypass attempt** (forged `customer`/`metadata.userId`, no signature header): `400 "Missing stripe-signature header"` — rejected before the forged payload was ever inspected.
- **Admin authorization bypass attempt** (forged `{role:"ADMIN"}` body, no session): `401` before the body is read.
- **Quota/plan bypass attempt** (forged `userId`/`plan` fields sent to `resume-rewriter`, no session): fields silently ignored (never read by the route); the request correctly proceeded down the pre-existing, intentional anonymous path — not a bypass of any actual protection.
- **Alternate-route LLM bypass attempt** (LinkedIn sub-route with a forged/nonexistent session id): `422`, no LLM reachable.
- **Secrets exposed to client bundles**: re-confirmed clean this milestone — zero `NEXT_PUBLIC_`-prefixed secret/admin/Stripe variables found anywhere in `src/`.

IDOR (`userId`/`recruiterId`/`candidateId`/`jobId`/`resumeVersionId`/`prepId`/`sessionId`/Stripe customer/subscription/override IDs), quota bypass, bulk-operation bypass, and anonymous-access-regression were all re-confirmed clean via the unchanged, passing test suite and this milestone's own live probes — no new finding, no regression since Phase 19 M7/Phase 20 M1.

## Step 10 — Final production readiness classification

**C — CODE READY BUT OPERATIONALLY BLOCKED.**

1. **Code status**: clean. 1159/1159 tests passing, `tsc`/lint/build all clean, no defect found in this milestone's own fresh re-verification of entitlement, quota, Stripe, admin, and cost-protection logic.
2. **Database status**: 13 of 15 migrations unapplied (2 — the storage bucket and `job_match_requests` — are already applied, corrected finding this milestone); this environment has no tooling capable of applying the rest (no `psql`, no CLI, no DDL-capable API access).
3. **Stripe status**: not configured (secret key, webhook secret, all 4 price IDs absent); E2E blocked by credentials, not by code.
4. **Admin bootstrap status**: not configured, not performed; 1 real user exists, 0 admins; blocked by both a missing secret and the absence of a real session this milestone could drive.
5. **Environment configuration status**: Supabase and OpenAI vars present and functional; all Stripe/bootstrap vars absent; no app-URL variable is needed (derived per-request).
6. **Authenticated E2E status**: not performed — no real session available; honestly reported, not fabricated.
7. **Remaining manual actions**: execute the migration checklist (Step 1) via the Supabase SQL Editor; provision Stripe credentials/prices/webhook; set `PLATFORM_ADMIN_BOOTSTRAP_SECRET`; sign in as the intended first admin and call the bootstrap endpoint (procedure unchanged from Phase 20 M1 §3); then run the Stripe test-mode checklist and a real authenticated smoke pass.

**Phase 20 is closed from an engineering standpoint.** No code defect was found — everything remaining is exactly the operational activation work this milestone's own charter anticipated and correctly did not attempt to fabricate around. No Phase 20 Milestone 3 is proposed.

---

## Recap

```
PHASE_20_M2_STATUS: AUDIT COMPLETE, NO CODE CHANGES
CLASSIFICATION: C — CODE READY BUT OPERATIONALLY BLOCKED
CODE_STATUS: CLEAN (1159/1159 tests, tsc clean, lint clean, build success)
DATABASE_STATUS: 13/15 migrations unapplied (2 already applied, corrected finding); no DDL execution capability in this environment
STRIPE_STATUS: NOT CONFIGURED (E2E blocked by credentials)
ADMIN_BOOTSTRAP_STATUS: NOT CONFIGURED, NOT PERFORMED (1 real user, 0 admins, verified live)
ENV_CONFIG_STATUS: Supabase/OpenAI PASS; all Stripe/bootstrap vars BLOCKED; app-URL var N/A (not needed)
AUTH_E2E: NOT PERFORMED (no real session available — disclosed, not fabricated)
STRIPE_E2E: BLOCKED BY CREDENTIALS (disclosed, not fabricated)
LIVE_PROBES: PASS (13-point smoke test + security regression sweep, all results expected/correct)
GENUINE_DEFECTS: 0
CODE_CHANGES_THIS_MILESTONE: 0
PHASE_20_CLOSURE: CLOSED from an engineering standpoint — operational activation is the only remaining work
NEXT_MILESTONE: none proposed (no genuine code defect found, per this milestone's own final rule)
```
