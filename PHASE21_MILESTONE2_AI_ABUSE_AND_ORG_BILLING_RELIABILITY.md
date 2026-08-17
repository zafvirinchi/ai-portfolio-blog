# Phase 21 — Milestone 2: Production AI Abuse Protection & Organization Billing Reliability

**Scope:** Fix exactly the three findings Phase 21 Milestone 1 deliberately deferred — anonymous AI cost/abuse exposure on `/api/ai/chat` and `/api/ai/resume` (P0), organization-billing webhook payment-delivery correctness (P1), and organization-billing webhook out-of-order event protection (P1). No broad audit, no new plans/pricing/entitlement system, no unrelated changes. Nothing was committed.

---

## 1. Original M1 Findings (verbatim scope for this milestone)

- **P0** — `/api/ai/resume` and `/api/ai/chat` were fully anonymous-capable, multi-LLM-call-per-request routes with zero rate limiting or input-size bound (only `/api/ai/job-match` had per-IP protection).
- **P1** — Organization billing webhook redelivery could create duplicate `payments`/`invoices` rows (no idempotency check before insert), inflating the admin-facing Total Revenue/ARPU figures.
- **P1** — No out-of-order webhook guard in the organization billing system's subscription upsert (the platform billing system already has one).

Every one of these three was re-traced against current source before any fix — not assumed correct from the M1 report.

---

## 2. Existing Architecture (re-audited before writing any code)

### Rate-limiting architecture

The only pre-existing rate limiter in the repository is `src/lib/ai/job-match/rate-limiter.ts`, backing `/api/ai/job-match`:

| Property | Behavior |
|---|---|
| Storage | Supabase table `job_match_requests` (`ip_address text`, `created_at timestamptz`), migration `20260803000000_add_job_match_rate_limit.sql` |
| Key derivation | `X-Forwarded-For` header, first (leftmost) entry, `"unknown"` if absent |
| Time window | Rolling 24h (`created_at >= now() - 24h`), not a calendar day |
| Concurrency | Plain check-then-insert (`select count` then `insert`) — **not atomic**, no DB constraint |
| Failure behavior | Throws (fails closed) on any Supabase error |
| Anonymous vs. authenticated | Applied to **every** caller regardless of session — this is a deliberate, different design choice from what this milestone needed (see §4) |
| Cleanup | None — rows accumulate forever (no TTL/cron); acceptable at this table's low write volume, re-confirmed still true for the new table (§4) |
| Response format | Plain `{error: string}`, HTTP 429, no `code`/retry field |
| Reusable for `/api/ai/chat` / `/api/ai/resume`? | **Pattern**: yes, directly. **Table**: no — see below. |

**Decision (per this milestone's explicit instruction to determine reuse before introducing anything new):** the *mechanism* — Supabase-table-backed, IP-derived, rolling-window, reserve-before-work — is reused unchanged. The *table* is not: `job_match_requests` is feature-specific by its own documented design (its migration's own comment: "One row per /job-match analysis attempt," no discriminator column). Repurposing it for chat/resume would silently merge three independent free-tier allowances into one shared counter — a Free user who used their 3 job-match analyses would also be wrongly blocked from chat/resume, and vice versa. This is not a safe reuse; it would introduce a real behavioral defect. A new table (`anonymous_ai_requests`, with a `feature` discriminator column) was added instead — one migration, not two, and the identical shape/index style as the existing precedent (§4).

### Organization billing architecture (Phase 14)

Traced completely, `checkout.session.completed → constructEventAsync (signature verify) → billing-service.ts's handleStripeWebhook() dispatch → per-event-type handler → subscription-service.ts/payment-service.ts/invoice-service.ts writes`. Confirmed still accurate against current source:

- Signature verification: real `stripe.webhooks.constructEventAsync`, raw body never parsed first (`stripe-provider.ts`) — unchanged by this milestone.
- `subscriptions` table: one row per organization (`unique (organization_id)`), upserted by `organization_id` — naturally idempotent for a *replayed* event, but with **no ordering guard** before this milestone (confirmed: `upsertFromProvider()` set `updated_at` to wall-clock `Date.now()` unconditionally on every write).
- `payments` table: `provider_payment_id text`, **no unique constraint**, plain `.insert()` — confirmed still true, a genuine redelivery of the same webhook event creates a second row.
- `invoices` table: no Stripe-derived reference column of any kind — `invoice_number` is a purely internal, sequential id.
- `handleCheckoutCompleted` trusts `session.metadata.organizationId` directly — confirmed non-exploitable (that metadata is set server-side, from a session-derived `organizationId`, at checkout-session creation time — `src/app/api/billing/checkout/route.ts:22`, `getTenantContext()` — never client-suppliable, and only ever reachable inside a signature-verified payload). Left untouched — out of this milestone's two named findings.

---

## 3. Anonymous Abuse Threat Model

Per this milestone's explicit instruction: the smallest protection that materially removes the P0 exposure, not enterprise-grade distributed abuse prevention.

| Threat | Addressed? | Notes |
|---|---|---|
| A single IP hammering the endpoint | Yes | Rolling 24h per-IP cap, reserve-before-work (a failed/rejected attempt still counts) |
| IP rotation (residential proxy pools, mobile carrier NAT churn) | **No** | A determined attacker rotating IPs defeats any per-IP limiter; out of scope for "smallest protection," same limitation `job-match`'s existing limiter already has and was accepted for |
| Shared NAT (office/university networks, CGNAT) | Partially mitigated by generosity | Limits (15/day chat, 3/day resume) are set high enough that ordinary shared-IP legitimate traffic is unlikely to collide, at the cost of a determined single attacker on that IP still getting a real allowance — same tradeoff `job-match` already accepted |
| IPv4 vs. IPv6 | Not distinguished | Whatever string `X-Forwarded-For` supplies is used as-is; an attacker with a large IPv6 block could trivially get a fresh IP per request — a known, explicitly documented limitation, not solved this milestone |
| Missing/absent `X-Forwarded-For` | Falls back to the literal string `"unknown"` | Every request with no header shares ONE bucket — correctly fails toward "more restrictive," not "unlimited," in that edge case |
| Spoofed `X-Forwarded-For` | **Trusted as-is, first entry** | Identical to the pre-existing `job-match` precedent; this app has no reverse-proxy-trust configuration to distinguish a genuine edge-injected header from a client-supplied one. A sophisticated attacker could set an arbitrary value to reset their own counter. Documented, not solved — matches the existing, already-accepted risk posture |
| Bots / scripted abuse | Rate-bounded, not blocked outright | No CAPTCHA, no bot-detection — out of scope ("smallest protection") |
| Concurrent requests | **Race condition exists and is demonstrated, not just claimed** | See §9/§10 — a plain check-then-insert allows a narrow over-limit window under true concurrency |
| Repeated browser sessions (clearing cookies) | N/A | These routes have no session-based limiting to begin with — the IP-based limit is unaffected by cookie/session churn |
| Malformed requests | Rate-limit check runs before request-body-shape validation for resume/chat, so a malformed request still counts against the cap | Intentional (reserve-before-work, matching `job-match`) |
| Retry storms (a client retrying a failed request) | Each retry counts against the cap | Same reserve-before-work design — a legitimate retry after a transient failure does cost one unit of allowance, an accepted tradeoff already present in the reused pattern |

**Honest statement, as instructed:** this repository's existing infrastructure (a Supabase table, no Redis, no edge/CDN-level rate limiting, no bot detection service) **cannot** provide reliable, IP-rotation-resistant, distributed abuse prevention. What was implemented removes the specific, evidenced P0 condition M1 found — *zero* cost control on two multi-LLM-call anonymous routes — and bounds the worst case to a knowable, small multiple of the intended daily allowance. It does not, and does not claim to, stop a sophisticated, motivated attacker with IP rotation available.

---

## 4. Rate-Limit Design

New module: `src/lib/ai/rate-limiting/anonymous-ai-rate-limiter.ts`. New table: `anonymous_ai_requests` (migration `20260818000000_add_anonymous_ai_rate_limits.sql`, feature + ip_address + created_at, indexed on `(feature, ip_address, created_at)` — identical shape/style to `job_match_requests`, plus the one added discriminator column).

- **Scope**: anonymous callers only. The module is never invoked at all when a platform session resolves — `if (!authUser)` / `if (!platformUserId)` gates at each call site. This was a deliberate deviation from `job-match`'s own precedent (which rate-limits *everyone*, authenticated or not) — this milestone's explicit instruction ("Authenticated users MUST continue using the existing Phase 18/19 entitlement/quota system... Anonymous users must not accidentally become subject to authenticated subscription logic") reads as a one-directional guarantee that is most cleanly satisfied by never calling the new limiter for an authenticated request at all, rather than calling it and trusting it to no-op.
- **Limits** (provisional, a cost-abuse floor, not a pricing decision): `resume_analyze` = 3/day (identical to `job-match`'s own established precedent — a directly comparable multi-OpenAI-call-per-submission profile). `ai_chat` = 15/day (higher, since one chat message is a lighter individual ask even though it can internally fan out to ~6 LLM calls — this still bounds the previously-*unbounded* worst case to ≤90 LLM calls/day/IP).
- **Failure semantics — refined beyond a direct port** (see §14 for why): fails **closed** (throws, blocks the request) on a genuine transient Supabase error, identical to `job-match`. Fails **open** (allows, logs loudly) specifically when the table doesn't exist yet (`PGRST205`/`42P01`) — this is the expected, common state in an un-migrated environment (this repo's own established, migration-tooling-free convention), not an abuse signal, and failing closed here would make this milestone's own fix hard-break anonymous chat/resume for every caller until an operator manually runs the migration — a direct violation of "do NOT break anonymous functionality unnecessarily."
- **Response shape**: `{error: string, code: "RATE_LIMITED", retryAfterSeconds?: number}`, HTTP 429, `Retry-After` header when a reset estimate could be computed (a cheap, reject-path-only extra query for the oldest row in the window — never on the common allow path). `RATE_LIMITED` is a new, distinct code — never `QUOTA_EXCEEDED` (the entitlement system's real code), so `UpgradePrompt`/`readEntitlementError()` never misinterprets an anonymous rate-limit rejection as a paid-plan quota rejection.
- **No secret/infrastructure leakage**: the response contains only the limit, the reset estimate, and a plain-language message — no table name, no IP address, no internal error detail.

---

## 5. Chat Protection (`/api/ai/chat`)

Traced the complete request: body parse → **[new] auth resolution moved earlier, anonymous rate-limit gate]** → tool-context wiring → `checkCredits` (org-scoped, no-op without an org) → `requireFeature`/`requireQuota` (per-user, no-op for anonymous) → multi-agent graph → `recordUsage`.

- `authUser` resolution (`createSupabaseServerClient().auth.getUser()`) was moved earlier in the function — still exactly one call, never duplicated — specifically so the new gate can run before any tool-context closures, `checkCredits`, or the graph itself.
- Gate: `if (!authUser) { checkAndRecordAnonymousUsage("ai_chat", ip) }` — zero LLM calls on rejection (verified by test: `askMock` never called).
- **Alternate entry points**: `grep`-confirmed `conversationService.ask()` (the graph entry point) has exactly one caller in the entire repository — this route. No chat-tool, legacy route, or direct service import can reach the graph any other way.
- **No double-charging**: the gate and the entitlement/quota system are mutually exclusive by construction (`if (!authUser)` vs. `if (authUser)`) — an authenticated request never even calls `checkAndRecordAnonymousUsage`, confirmed by a dedicated test.
- **No LLM call to determine allowance**: the rate-limit check is a pure Supabase read/write, never an LLM invocation.

---

## 6. Resume AI Protection (`/api/ai/resume`)

- `resumeService.analyzeUpload()` (`resume-service.ts`) is the *only* method this route's service exposes — the whole route IS the expensive operation, not a sub-path within it, so gating the entire route (before `checkCredits`, before the LLM call) is correct and requires no finer-grained distinction.
- **Alternate entry points searched**: `grep -rn "analyzeUpload"` across the whole repo found exactly 2 real callers — `src/app/api/ai/resume/route.ts` (this route, now protected) and `src/lib/ai/recruiter/candidate-service.ts` (the recruiter candidate-import path, which requires a real `requireRecruiterId()` session and its own `RECRUITER_CANDIDATES` quota check — already gated by an entirely different, unrelated mechanism, not an anonymous bypass of this fix). `src/lib/ai/tools/resume.tool.ts` was also checked directly: it only ever calls `resumeService.get(resumeId)` (a cheap lookup of an *already-analyzed* record), never `analyzeUpload` — the chat tool cannot trigger a new analysis at all, so it cannot bypass this gate.
- **Multiple operations cannot multiply the allowance**: there is only one operation in this file to protect; no sibling deterministic endpoint exists to accidentally double-gate or leave open.
- Gate: `if (!platformUserId) { checkAndRecordAnonymousUsage("resume_analyze", ip) }`, positioned before `checkCredits`/the LLM call. Authenticated behavior (`requireQuota("ATS_CHECKS")`) is completely unchanged and untouched by this gate.

---

## 7. Organization Billing Defect (re-confirmed, not assumed)

Both M1-reported defects were independently re-verified against current source before writing any fix (§2) — both were still present, exactly as described. No other defect was introduced or found in this narrow re-trace.

---

## 8. Payment-Delivery Correction

**Root cause**: `payment-service.ts`'s `record()` was a plain, unconditional `.insert()` — any handler reached by a redelivered Stripe webhook event (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` all call it) wrote a second row for the same real-world payment.

**Fix**: `record()` now looks up an existing row by `(organization_id, provider_payment_id)` before inserting. `provider_payment_id` is the real Stripe `payment_intent`/invoice id — a stable identifier a genuine redelivery of the *same* event always carries unchanged. A match returns `null` (no new row) instead of throwing — a duplicate delivery is expected Stripe behavior, not an error. `billing-service.ts`'s `handleCheckoutCompleted`/`handleInvoicePaid` now capture that return value and **skip the paired `invoiceService.create()` call** when the payment was a duplicate, so a redelivered event never creates a duplicate invoice either — without touching the `invoices` table's schema at all (it has no Stripe-derived reference column to dedup against directly; making invoice creation *conditional on the payment write actually being new* solves the real problem without needing one).

**Why no migration**: a DB-level unique constraint + atomic upsert would be strictly stronger, but `provider_payment_id` has no unique index today, and adding one (plus switching to a partial-index-aware upsert, since the column is nullable) is more schema surface than "the minimum correction required" calls for. The threat model this protects against — Stripe's own redelivery — is **sequential**, not concurrent (a retry only fires after a prior delivery attempt has already finished, succeeded or failed), so a plain check-then-insert is judged sufficient for the actual risk. This is a real, considered tradeoff, not an oversight — documented in the function's own comment and in §10 below.

**Fail-open, deliberately different from the rate limiter's fail-closed choice**: the dedup *lookup* itself fails open (proceeds to insert) on a Supabase error. Losing/blocking a genuine financial record is judged worse than the rare residual risk of a duplicate row when the dedup check can't be evaluated; the insert itself is unchanged and still throws normally on failure (correctly surfacing as a retry-worthy failure to Stripe).

---

## 9. Out-of-Order Protection

**Root cause**: `subscription-service.ts`'s `upsertFromProvider()` and `markCanceled()` both wrote `updated_at = new Date().toISOString()` (wall-clock) unconditionally, with no comparison against the row's prior state — a delayed webhook carrying an older snapshot could silently overwrite newer state (e.g. reverting a just-renewed subscription back to a stale `past_due`, or a late `subscription.deleted` canceling an already-reactivated subscription).

**Fix — reused an existing column, no migration**: this repository already solved the identical problem once, in its *other* billing system — `platform-subscription-service.ts`'s `upsertSubscription()` repurposes its own `updated_at` column to store the Stripe event's own `created` timestamp (`eventCreatedAt`) instead of wall-clock write time, comparing it against the existing row before writing. That exact pattern (same log wording, same comment structure) is ported here unchanged: `handleStripeWebhook()` now computes `eventCreatedAt = new Date(event.created * 1000).toISOString()` once and threads it into `upsertFromProvider()`/`markCanceled()`, which skip the write (log a warning, return the existing row) whenever the existing row's `updated_at` is already equal-or-newer.

- **`subscription-analytics.ts` cross-check**: this file already reads `subscriptions.updated_at` as an *approximation* of "when a cancellation happened" for churn calculation, and its own comment already acknowledges this is an approximation, not a strict wall-clock guarantee. Using the Stripe event's own clock instead of webhook-processing race timing makes that approximation *more* accurate, not less — confirmed this is a safe, even improving, reuse.
- **Requirements checklist**: newer state is never overwritten by older delivery (tested, §11) · duplicate delivery remains idempotent (upsert-by-`organization_id`, unchanged, tested) · a legitimate newer event still applies (tested) · unrelated organizations remain isolated (tested — a stale event for org1 never touches org2) · forged metadata cannot control ownership (§2 — non-exploitable by construction, signature verification gates everything before metadata is ever read; tested) · signature verification remains mandatory and unmodified.
- **No migration was needed or added for this finding.**

---

## 10. Security Model

- Signature verification is unchanged, still mandatory, still runs before any event data is parsed — proven by test: a rejected signature results in zero calls to any subscription/payment-writing function.
- Forged organization/user metadata: structurally unreachable unless signature verification already succeeded (the mocked `verifyAndConstructWebhookEvent` is the *only* place raw body becomes a parsed event) — proven by test.
- Anonymous rate limiting cannot be used to forge an authenticated identity: chat's request body has no `userId`/`authUser`-shaped field read anywhere in the route; a test sending a body with plausible-looking identity fields alongside `message` proves it has zero effect — identity is resolved exclusively from the session cookie.
- Cross-organization isolation: proven by test for both the payment-dedup scope (keyed by `(organization_id, provider_payment_id)`, not `provider_payment_id` alone) and the ordering guard (keyed by `organization_id`).

---

## 11. Tests (46 new, 0 modified/weakened)

| File | New/modified | Count |
|---|---|---|
| `src/lib/ai/rate-limiting/anonymous-ai-rate-limiter.test.ts` | new | 10 |
| `src/app/api/ai/chat/route.test.ts` | extended (6 pre-existing tests untouched, all still pass) | +6 |
| `src/app/api/ai/resume/route.test.ts` | new (no test previously existed for this route) | 4 |
| `src/lib/billing/subscription-service.test.ts` | new (no test previously existed for this file) | 8 |
| `src/lib/billing/payment-service.test.ts` | new (no test previously existed for this file) | 6 |
| `src/lib/billing/billing-service.test.ts` | new (no test previously existed for this file) | 12 |

Covers, per §9's checklist: anonymous chat allowed under limit / rejected after limit / rejection before LLM invocation / authenticated users ungated by the new limiter / identity cannot be forged via request body / alternate entry point (chat tool, recruiter import path) confirmed unable to bypass · resume: same shape, plus the legacy/alternate-route search documented in §6 · billing: genuine signature accepted / invalid signature rejected / forged metadata unreachable / duplicate event idempotent (both payment-level and, separately, subscription-upsert-level) / older event cannot overwrite newer state / newer event applies / malformed event fails safe / payment failure grants nothing / cross-organization isolation.

All new test files were added to `vitest.config.mts`'s explicit include allowlist (a file not listed there silently never runs, per this repo's own established convention).

---

## 12. Live Validation

**AI (performed)**: a local `next dev` server was probed with real, unauthenticated HTTP requests (anonymous chat messages and an anonymous resume upload) against the actual current code. Confirmed via the server's own log file (not inferred): both the `ai_chat` and `resume_analyze` code paths executed, correctly detected the not-yet-applied migration, logged the exact `OPERATIONAL BLOCKER` warning this milestone's code was written to emit, and **failed open** — every anonymous request still received a normal response (chat: 200 with a real answer; resume: 422 for an intentionally-malformed test PDF, i.e. it reached real parsing, not a rate-limit rejection). No secret or infrastructure detail appeared in any response body. This is a genuine, log-confirmed live execution of the new code, not an assumption. A second, fully independent `next dev` instance could not be started for a from-scratch multi-request rate-limit-exhaustion probe — Next.js's dev-server lock detected a pre-existing dev server (from an earlier, unrelated session) already running against this same project directory and refused to bind a second instance; that pre-existing process was left untouched rather than inspected or stopped, per direct instruction during this session not to manage it. The probes above were instead sent to that already-running, already-serving process, which — as demonstrated by the log evidence above — was already running this milestone's current code.

**Stripe (not performed, as instructed)**: no Stripe test/live keys or webhook secret are configured in this environment. No live Stripe E2E is claimed. All billing correctness above was verified by unit/integration tests against mocked Stripe event payloads, not a live Stripe connection.

**Supabase (read-only only)**: no DDL capability was available in this environment. The new migration was written, reviewed, and is included in the repository, but was **not** applied to any live database.

**OPERATIONAL BLOCKER**: Migration `20260818000000_add_anonymous_ai_rate_limits.sql` requires manual application in the Supabase SQL Editor before anonymous rate limiting actually takes effect. Until then, `checkAndRecordAnonymousUsage()` deliberately fails open (§4) — anonymous chat/resume remain exactly as functional as before this milestone, but without the new cost protection, which is the correct, intentional interim state rather than a broken one.

---

## 13. Operational Requirements

- Run `20260818000000_add_anonymous_ai_rate_limits.sql` manually in the Supabase SQL Editor (this repo's only migration-application method) to activate anonymous rate limiting.
- No new environment variable, secret, or Stripe configuration is required by this milestone's fixes — the org-billing corrections (payment dedup, ordering guard) are pure application-code changes against the existing `payments`/`subscriptions` tables and require no operational action beyond a normal deploy.

---

## 14. Known Limitations

- **Anonymous rate limiting is not IP-rotation-resistant** and trusts `X-Forwarded-For` as-is (§3) — an explicitly accepted limitation matching the pre-existing `job-match` precedent, not a new gap introduced this milestone.
- **The anonymous rate limiter's check-then-insert is not atomic under true concurrency** — §10's own test (`Promise.all` of two concurrent calls against a shared "1 remaining" state) demonstrates, not merely claims, that both can be allowed, landing one row over the intended limit. This mirrors the platform billing system's own already-accepted tradeoff for its structurally identical out-of-order guard. Judged acceptable: the realistic threat (a script making sequential or lightly-parallel requests) is still bounded by the window on every subsequent request; this is not a claim of strict enforcement.
- **The payment-dedup check is also not atomic** (§8) — judged acceptable specifically because Stripe's own redelivery behavior is sequential, not concurrent, unlike the anonymous-traffic threat model.
- **Fails open before the migration is applied** (§4, §12) — a deliberate, documented choice favoring "don't break working anonymous functionality" over "protect from cost exposure that only reopens until an operator runs one SQL file" — but it does mean the P0 finding is not actually mitigated in *any* environment until that manual step happens.
- **`resume-rewriter`/`linkedin-optimizer`/`cover-letter` are not anonymous-capable** at all (session required already) — not in scope for this milestone, mentioned only to confirm no other anonymous-capable AI route was missed.

---

## 15. Deferred Items

None within this milestone's own three named findings — all three were addressed. Items explicitly out of scope, carried forward as still-valid future work (not manufactured, not newly discovered):
- Full IP-rotation-resistant / distributed anonymous abuse protection (would require infrastructure this milestone was explicitly told not to introduce).
- A DB-level unique constraint for `payments.provider_payment_id` (would make payment dedup atomic instead of best-effort) — not required given the sequential-redelivery threat model, but a reasonable future hardening if ever revisited.
- The M1-identified P2/P3 items not part of this milestone's three named findings (Resume Versions' missing `UpgradePrompt` wiring, candidate-import per-file quota granularity, login/signup nav discoverability, etc.) remain exactly as M1 left them — untouched, per this milestone's explicit "only these three findings" scope.

---

## Final Report

**FILES MODIFIED**
- `src/app/api/ai/chat/route.ts` — anonymous rate-limit gate, `authUser` resolution moved earlier
- `src/app/api/ai/chat/route.test.ts` — extended with 6 new tests, 6 pre-existing tests unmodified
- `src/app/api/ai/resume/route.ts` — anonymous rate-limit gate
- `src/lib/billing/subscription-service.ts` — out-of-order guard on `upsertFromProvider()`/`markCanceled()`
- `src/lib/billing/payment-service.ts` — duplicate-payment dedup in `record()`
- `src/lib/billing/billing-service.ts` — threads `event.created` through; skips duplicate invoice writes
- `vitest.config.mts` — added 6 new test files to the include allowlist

**FILES CREATED**
- `supabase/migrations/20260818000000_add_anonymous_ai_rate_limits.sql`
- `src/lib/ai/rate-limiting/anonymous-ai-rate-limiter.ts`
- `src/lib/ai/rate-limiting/anonymous-ai-rate-limiter.test.ts`
- `src/app/api/ai/resume/route.test.ts`
- `src/lib/billing/subscription-service.test.ts`
- `src/lib/billing/payment-service.test.ts`
- `src/lib/billing/billing-service.test.ts`
- `PHASE21_MILESTONE2_AI_ABUSE_AND_ORG_BILLING_RELIABILITY.md`

**FILES DELETED**: none

**BASELINE TESTS**: 1169
**FINAL TESTS**: 1215
**NEW TESTS**: 46
**FAILURES**: 0 / 1215

**TYPESCRIPT**: PASS (`npx tsc --noEmit`, 0 errors)
**LINT**: PASS (`npx eslint .`, 0 errors, 2 warnings — 1 pre-existing/unrelated `<img>` warning, 1 fixed during this milestone before the final run)
**BUILD**: PASS (`npm run build`, full 182+ route manifest generated, no new errors/warnings)

**LIVE VALIDATION**: AI abuse protection — performed and log-confirmed against a real running server (§12); both rate-limit code paths executed exactly as designed. Stripe — not performed, no test credentials available, not fabricated. Supabase DDL — not performed, no DDL capability available; migration written but not applied (flagged as an explicit OPERATIONAL BLOCKER, §12).

**SECURITY FINDINGS**: none new. The three findings this milestone was scoped to fix are now fixed (chat/resume anonymous cost exposure closed pending migration application; payment redelivery no longer double-counts; stale webhook events can no longer overwrite newer subscription state). No regression was introduced in signature verification, forged-metadata resistance, or cross-organization isolation — all re-verified by test.

**OPERATIONAL BLOCKERS**:
```
OPERATIONAL BLOCKER:
Migration 20260818000000_add_anonymous_ai_rate_limits.sql requires manual
application in the Supabase SQL Editor. Until applied, anonymous rate
limiting fails open by design (see §4/§14) — chat/resume remain exactly
as functional as before this milestone, without the new protection.
```

**DEFERRED ITEMS**: see §15 — none within this milestone's three named findings; broader IP-rotation-resistant abuse infrastructure and an atomic (DB-constraint-backed) payment dedup are named, reasonable future hardening, not required by the actual threat model traced this milestone.

---

# PHASE CLASSIFICATION:
**B** — All three scoped findings genuinely fixed with real, tested, minimal corrections reusing existing architecture; not "A" because the AI-abuse fix's actual protection is contingent on a manual migration step not yet performed in any live environment, and two documented, non-atomic best-effort tradeoffs remain (judged acceptable, not eliminated).

# CODE STATUS:
**COMPLETE** — all three M1-deferred findings are fixed in code, tested, and validated (tsc/lint/tests/build all clean). Nothing in this milestone's own scope remains unfixed.

# OPERATIONAL STATUS:
**PREREQUISITES** — one manual step (run the new migration) is required before the AI-abuse protection actually takes effect; the org-billing fixes require no operational action.

# NEXT MILESTONE:
No further code milestone is required by this task's own three findings — all are resolved. A future milestone would only be justified by a genuinely new P0/P1/P2 finding (e.g., a decision to invest in IP-rotation-resistant abuse infrastructure, or to make payment dedup DB-atomic) — neither is proposed here as required work, only named as available future hardening per §15.
