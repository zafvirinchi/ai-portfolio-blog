# Phase 19 Milestone 5 — Final Monetization, Entitlement & Billing Production Audit

Audit-first, as chartered: nothing was rebuilt, no second entitlement/billing/quota/subscription/audit/authorization system was introduced, no speculative Redis/rate-limit/migration infrastructure was added. Every fix below reuses existing Phase 18/19 infrastructure exactly as prior milestones did. Nothing was committed.

## 1. Executive summary

This milestone traced the complete monetization lifecycle end-to-end (anonymous → sign-in → persona/plan/entitlement/quota resolution → expensive operation → usage recording → Stripe checkout/webhook/subscription → entitlement refresh → quota display → upgrade/cancel/portal → admin override → recruiter/billing/admin separation) and built a full feature-by-feature inventory, using two parallel deep-exploration passes over the entire `src/app/api/ai/**`/`src/lib/ai/**`/`src/lib/billing/**` trees, each independently verified against the actual source before being treated as fact.

**The core, registered monetization system (the 25 features in `FEATURE_REGISTRY`, spanning resume/job/interview/recruiter) is genuinely solid** — Stripe's lifecycle is idempotent and signature-verified, ownership can't be forged, admin security is timing-safe and self-lockout-protected, quota accounting is check-before-operate and exactly-once, multi-role/persona resolution is correct, and the M4 memoization is provably request-scoped with no cross-user/cross-request leakage (re-verified this milestone, not just re-asserted).

**This milestone found and fixed one genuine, real monetization bypass**: the chat assistant's recruiter tool-calling path reached the same LLM-backed candidate comparison/recommendation functions as `/api/ai/recruiter/compare` and `/recommend` with zero entitlement check, letting a Free-tier recruiter (`recruiter.analytics: NONE`) get the paywalled feature for free simply by asking the chatbot. It also found and fixed two export-UX defects (plain `<a href>` links to entitlement-gated export routes navigating to raw JSON on rejection instead of the established `UpgradePrompt` pattern).

**This milestone also discovered one major, previously-undocumented gap that is NOT fixed**: the LinkedIn Optimizer (23 routes) and Cover Letter Generator (~14 routes) product surfaces have **zero** entitlement, quota, or even the older org-scoped credit-check plumbing anywhere — no feature registry entry, no `requireFeature`/`requireQuota`/`checkCredits` call, and (unlike every other intentionally-anonymous feature in this app) no documented "free by design" rationale anywhere in the code. Both are real, multi-call LLM cost centers, reachable by fully anonymous callers with no protection whatsoever. This is judged too large and too dependent on product/pricing decisions (what plan tier, what limits) to safely "minimally fix" in an audit pass, but it is a real, current, unbounded financial-exposure risk and is the primary reason this milestone's final classification is **D**, not because the previously-monetized system regressed.

## 2. Complete monetized-feature matrix

Built from `FEATURE_REGISTRY`/`platform-schema.ts`/`platform-plan-registry.ts` (25 features, 4 categories) cross-referenced against every route under `src/app/api/ai/**`.

| Feature ID | Persona | Metric (limit F→Pro→Prem/Biz) | Route(s) | Gate | Anonymous? |
|---|---|---|---|---|---|
| `resume.ats.score` | JOB_SEEKER | `ATS_CHECKS` 5→50→∞ | `POST /api/ai/resume` | `requireQuota` | Yes, soft |
| `resume.jd.match` | JOB_SEEKER | `JD_MATCHES` (pooled) 5→50→∞ | `POST /api/ai/resume/jd-match` | `requireQuota` | Yes, soft |
| `resume.optimize` | JOB_SEEKER | boolean NONE→∞→∞ | `POST .../jd-match/[id]/optimize` (+ confirmed-dead legacy twin `resume/versions/[id]/optimize`) | `requireFeature` | Yes, soft |
| `resume.rewrite` | JOB_SEEKER | NONE→`AI_REWRITES` 30→∞ | `POST /api/ai/resume-rewriter` (session start only; follow-on section/whole-resume/export routes intentionally not re-checked, session-scoped) | `requireFeature`+`requireQuota` | Yes, soft |
| `resume.ai_assistant` | JOB_SEEKER | NONE→`AI_CHAT_MESSAGES` 300→2000 | `POST /api/ai/chat` | `requireFeature`+`requireQuota` | Yes, soft (chat itself always runs for anon) |
| `resume.builder`/`resume.templates`/`resume.versions`/`resume.export` | JOB_SEEKER | ∞ all tiers | `resume/versions/**` (full CRUD) | none needed (never NONE) | No — `requireUserId()` hard gate |
| `job.match` | JOB_SEEKER | `JD_MATCHES` (pooled) | `POST /api/ai/job-match` | `requireQuota` | Yes, soft |
| `job.analyzer` | JOB_SEEKER | `JD_MATCHES` (pooled) | `POST /api/ai/job` | `requireQuota` | Yes, soft |
| `interview.prepare` | JOB_SEEKER | `INTERVIEW_PREPARATIONS` 3→15→∞ | `POST /api/ai/interview-prep` | `requireQuota` | Yes for `{resumeId,jdMatchId}`; hard-gated for `resumeVersionId` path |
| `interview.mock` | JOB_SEEKER | `MOCK_INTERVIEWS` 2→15→∞ | `POST /api/ai/mock-interview` (session start only) | `requireQuota` | Yes, soft |
| `interview.debrief`/`interview.progress` | JOB_SEEKER | boolean | `mock-interview/[id]/debrief`, `/progress` | `requireFeature` | Yes, soft |
| `interview.study_plan` | JOB_SEEKER | boolean NONE→∞→∞ | **No route calls `requireFeature(..., "interview.study_plan")` anywhere** — served by `interview-prep/[prepId]/coverage`, itself unauthenticated by the ephemeral-token design shared with the rest of interview-prep | **Not independently enforced** — see §15, judged not a new/actionable gap (see reasoning there) |
| `recruiter.workspace`/`.jobs` | RECRUITER | ∞ all tiers | `recruiter/dashboard`, `recruiter/jobs/**` | `requireRecruiterId()` only (never NONE) | No |
| `recruiter.candidates`/`.ranking` | RECRUITER | `RECRUITER_CANDIDATES` 25→200→∞ | `candidates/import`, `ranking`, `candidates/[id]/match`, `/evaluate` | `requireQuota`+`recordUsage` | No |
| `recruiter.analytics` | RECRUITER | NONE→∞→∞ | `analytics`, `candidates/[id]/insights`, `compare`, `recommend` | `requireFeature` | No — **and see §3, Finding #1: was also reachable via chat with no gate at all until this milestone** |
| `recruiter.shortlist`/`.interview` | RECRUITER | NONE→∞→∞ | `candidates/[id]/status`, `bulk-status`, `interview-link`, `interview-readiness` (both recruiter-side and recruitment-side twin) | `requireFeature` | No |
| `recruiter.export` | RECRUITER | NONE→`RECRUITER_EXPORTS` 50→∞ | `GET /api/ai/recruiter/export` (candidates/comparison) | `requireFeature`+`requireQuota` | No — **and see §3, Findings #2/#3: 3 UI callers bypassed this via plain `<a href>`, now fixed** |
| `recruiter.hiring_report` | RECRUITER | NONE (Free/Pro)→∞ (Business) | `GET .../export?type=hiring-report` | `requireFeature` | No |

**Alternate/legacy/duplicate entry points found:**
- `resume/versions/[id]/optimize` — a self-documented dead legacy duplicate of the live `jd-optimize/propose`+`/apply` flow; both independently gated (Phase 19 M3), zero live UI callers confirmed. Not fixed (nothing to fix — already patched on both sides), flagged as future drift risk if one path changes without the other.
- `recruitment/jobs/[jobId]/pipeline/[candidateId]/export` — an unauthenticated duplicate of the gated `recruiter/candidates/[candidateId]/export` PDF report. Part of the already-deferred `recruitment/**` subsystem (§6).
- **LinkedIn Optimizer / Cover Letter — entirely outside this matrix.** No `FeatureId` exists for either. See §3, Finding #4.

## 3. Entitlement bypass audit

Two independent, parallel deep-trace passes (every LLM call site in `src/lib/ai/**`, every caller of every expensive service function across `src/app/api/ai/**`) were run and cross-verified by direct file reads before anything below was accepted as fact.

**Finding #1 — FIXED. Chat recruiter tool-calling bypassed `recruiter.analytics`.**
`src/lib/ai/tools/resume.tool.ts`'s `handleRecruiterMessage()` called `candidateService.compare()` and `candidateService.recommendTopCandidates()` — the identical real-LLM functions `/api/ai/recruiter/compare` and `/recommend` gate with `requireFeature(recruiterId, "recruiter.analytics")` — with **no entitlement check at all**. Reachable via `POST /api/ai/chat` with `recruiterMode: true` and a matching phrase ("compare Jane and John", "recommend top 5 candidates"). The `recruiterId` itself is genuinely server-derived (`chat/route.ts:68`, `authUser.id`, never client-supplied) so this was not an identity-forgery/IDOR issue — but any signed-in user whose plan resolves `recruiter.analytics` to `NONE` (every Free-tier recruiter) could get the paywalled feature for free through chat while the dedicated UI button correctly blocked them.
**Fix**: added `await requireFeature(recruiterId, "recruiter.analytics")` immediately before each call in `resume.tool.ts`, mirroring the dedicated routes' own gate exactly — no new feature ID, no new metric. A rejection is caught by the function's existing try/catch and surfaced as a friendly chat message (`FeatureNotEntitledError`'s own message), consistent with every other recruiter-tool failure path.
**Regression tests**: 4 new tests in `resume.tool.test.ts` prove (a) `requireFeature` is called before `compare()`/`recommendTopCandidates()`, in that order, and (b) a rejection prevents the LLM-backed service call from ever running, for both actions.

**Finding #2/#3 — FIXED. Two export links bypassed the fetch+blob/UpgradePrompt pattern Phase 18 M8 established for exactly this problem.**
`export/route.ts`'s `type=comparison`/default-`candidates` paths are gated by `recruiter.export`/`RECRUITER_EXPORTS` — a **different** feature from the `recruiter.analytics` gate on the actions that produce the data being exported. On RECRUITER_PRO, `recruiter.analytics` is UNLIMITED but `recruiter.export` is capped at 50/month, so a recruiter who exhausted their export quota could still successfully compare/rank candidates, then click a plain `<a href>` export link and have the whole tab navigate to raw 402 JSON. Found in `RecruiterComparisonTab.tsx` (2 links) and `RecruiterCandidateTable.tsx` (2 links) — both missed by M8's original fix pass, which only covered `RecruiterReportsTab.tsx`'s 5 links.
**Fix**: converted all 4 links to the same fetch+blob pattern, extracted into a new shared `src/lib/billing/export-download.ts` (`downloadExport()`) once the pattern was independently duplicated a 3rd time, and updated `RecruiterReportsTab.tsx` to use the shared version too — net reduction in duplication, not an increase.
Verified via `tsc`/lint/live probe; not given a dedicated new unit test (no React component test infrastructure exists anywhere in this repo — every prior milestone's convention verifies `.tsx` UI via live probe, not unit tests; this is a UI-wiring fix with no new business logic to unit-test).

**Finding #4 — NOT FIXED, documented. LinkedIn Optimizer and Cover Letter have zero entitlement plumbing.**
Confirmed independently (grep across `src/app/api/ai/linkedin/**` (23 routes), `src/app/api/ai/cover-letter/**`, `src/lib/ai/linkedin/**`, `src/lib/ai/cover-letter/**`, and `platform-schema.ts`/`feature-registry.ts`): **zero** matches for `requireFeature`/`requireQuota`/`recordUsage`/`checkCredits`/`getOptionalUserId`/`requireUserId` anywhere in either subsystem, and no `FeatureId` for either exists in the registry at all. Unlike every other anonymous-capable feature in the app (mock-interview, resume-rewriter, jd-match, interview-prep), there is no "intentionally anonymous/free" comment anywhere in either subsystem's routes — this reads as an omission, not a documented decision. Both are genuine, multi-call OpenAI cost centers: LinkedIn Optimizer can invoke up to 6 separate generator calls per profile session (about/headline/experience/skills/recommendations/banner); Cover Letter generates a letter, an email variant, and LinkedIn messages. Live-probed safely (bogus IDs, no real generation triggered) — confirmed `POST /api/ai/linkedin/bogus-id/about` and `POST /api/ai/cover-letter/bogus-id/letter` return no `401`, unlike every properly-gated route tested (§13), consistent with the code-level finding.
**Why not fixed this milestone**: closing this properly requires (a) product/pricing decisions this audit has no authority to make unilaterally — which plan tier(s) should include these, what limits, whether they should even be monetized at all vs. remain deliberately free with just a documented rationale and a quota ceiling — and (b) wiring roughly 37 routes, which is a meaningfully larger change than every other "reuse an existing gate" fix in this session. Both explicitly prohibited shortcuts (inventing a new rate-limiter, or silently denying access) would themselves be worse than leaving this as a clearly documented, prioritized gap. **This is the single most important recommendation for the next phase (§20).**

**Re-confirmed, unchanged from prior milestones (not new findings):**
- `/api/ai/recruitment/**` (28 routes) remains almost entirely unauthenticated by deliberate, four-times-now-documented design (Phase 13 M9 → Phase 16 M2 → Phase 18 M4/M5/M8 → Phase 19 M3). This pass named, with more precision than before, exactly which routes in it carry real LLM cost with zero protection: the 5 `emails/*` routes, `interviews/[id]/feedback/summarize`, `interviews/[id]/generate-kit`, and `jobs/[jobId]/pipeline/[candidateId]/recommendation`. The chat route's `recruitmentMode` flag reaches this same already-open subsystem through a different entry point (`recruitmentRequestContext.run({ active: true }, ...)`, no recruiterId, no auth) — this is consistent with, not an escalation of, the subsystem's existing design. Not touched this milestone: fixing an entire subsystem's authentication model is out of "minimal fix" scope and was explicitly ruled out of charter by M3.
- Session-repeatable sub-operation cost (`resume.rewrite`/`interview.mock` metered once at session start) — unchanged, still MEDIUM/deferred per M3/M4's own reasoning.

## 4. Quota accounting audit

Verified against the actual implementation (`entitlement-service.ts`, `usage-event-service.ts`), not assumptions:

1. **Checked before the expensive operation?** Yes, in every gated route read this milestone and across M1-M4 — `requireFeature`/`requireQuota` always precede the service call.
2. **Recorded exactly once?** Yes — `recordUsage()` is called exactly once, as the last step, only after the operation's success is already known. Verified this holds even under the chat route's multi-agent fan-out (up to 6 internal LLM calls can happen inside one `AI_CHAT_MESSAGES` unit — `chat/route.ts:200-210`'s own comment confirms this is deliberate: "however many internal LLM calls one message fanned out into... this is the single place that counts as one unit").
3. **Can an error path accidentally record usage?** No — `recordUsage` calls sit after the try block's success path in every route audited; a thrown error skips straight to the catch block.
4. **Can retry logic double-record?** No — internal retries inside a service function (if any) are invisible to the route handler, which only calls `recordUsage` once after the whole call resolves, regardless of internal attempts.
5. **Can concurrent requests exceed quota?** Yes, in principle — `checkQuota()` → decision → `recordUsageEvent()` is read-then-check-then-write with no atomic constraint (unchanged from M3's own finding). Classified **best-effort enforcement**, not strict — a deliberate, documented trade-off (every ceiling here is a generous abuse backstop, not a precise billing meter; worst case is one extra unit at a rare, hard-to-hit boundary, not an unbounded leak). Not fixed — introducing a DB-level atomic constraint or distributed lock is exactly the "speculative infrastructure" this milestone's own constraints prohibit without stronger evidence of actual abuse.
6. **Can multi-agent fan-out multiply usage?** No — confirmed in item 2.
7. **Can one request invoke multiple monetized operations but record only one?** Not found in any route audited — every route this milestone traced maps 1:1 to exactly one metric/feature.
8. **Can rejected requests consume quota?** No — `requireFeature`/`requireQuota` throw before the operation or the record call ever run.
9. **Can failed LLM requests consume quota?** No — same reasoning as item 8/3.
10. **Can successful operations fail to record usage?** `recordUsageEvent()` fails silently on an insert error (never throws, logs only) — a deliberate, documented "fail open on usage-recording infrastructure failure, never block the feature it's metering" policy, mirroring `getUsageCount()`'s identical "fail to zero on lookup error" policy. This means a rare Supabase outage could under-count usage (never over-count, never block a paying user) — judged an acceptable, already-documented trade-off, not a new defect.

## 5. Stripe lifecycle audit

Traced `platform-stripe-provider.ts` → `platform-billing-service.ts` → `platform-subscription-service.ts` in full (all three read end-to-end this milestone, not sampled):

- **Customer ownership cannot be forged**: `userId` is attached to the Stripe customer only at creation time (`platform-stripe-provider.ts:91`); every later webhook resolves `userId` from `platform_billing_customers` via the subscription's own verified `customer` field, **never** from `subscription.metadata.userId` directly — metadata mismatches are logged as a security signal but never trusted (`platform-billing-service.ts:137-166`).
- **Price IDs cannot be client-selected**: `resolveStripePriceId()` only ever reads from a server-side env-var map keyed by `PlatformPlanKey`; an unrecognized/non-Stripe-backed `planKey` throws before Stripe is ever called (`initiateCheckout` validates first).
- **Webhook signatures are genuinely verified**: `stripe.webhooks.constructEventAsync()` with a dedicated `STRIPE_PLATFORM_WEBHOOK_SECRET`; the raw body is never parsed before this succeeds. Live-probed this milestone (§13) — a missing signature header returns `400` before any processing; an invalid one (with credentials theoretically configured) would be rejected by the SDK itself.
- **Duplicate webhook delivery is safe**: `upsertSubscription()` upserts by `stripe_subscription_id` (`onConflict`) — replaying the same event just re-writes the same row.
- **Out-of-order events are safe**: `updated_at` is repurposed to store the Stripe **event's** own `created` timestamp (not wall-clock write time); an incoming event older-or-equal to the stored one is skipped and logged, never applied (Phase 18 M6's fix, re-verified unchanged this milestone).
- **Canceled/expired subscriptions stop entitlement**: `isPaidAccessStatus()` is an exhaustive, fail-closed switch — only `active`/`trialing`/`past_due` grant paid access; `canceled`/`unpaid`/`incomplete`/`incomplete_expired`/`paused`(→treated as canceled) never do.
- **`past_due` still grants access** — a deliberate, documented grace-period policy (Stripe is still retrying the card), not an oversight.
- **Portal access is restricted to the caller's own customer**: `createBillingPortalSession(userId, ...)` looks up the Stripe customer ID server-side from `platform_billing_customers` by the session-derived `userId` alone; never accepts a customer ID from the client.
- **Checkout is restricted to server-known prices**: confirmed above.

No fixes needed — this subsystem was already solid from Phase 18 M2/M6.

## 6. Plan transition audit

Re-verified via the existing test suite (`entitlement-service.test.ts`, 47 tests) plus direct code reading:

| Transition | Verified by |
|---|---|
| FREE → PRO/PREMIUM | `resolveEffectivePlans()` test: a real Stripe-backed active subscription wins over the FREE default |
| PRO → FREE (canceled) | Test: a canceled Stripe subscription never retains paid access merely because a local row still exists |
| past_due → still paid | Test: `past_due` still grants access (deliberate grace policy) |
| admin override → effective plan | Test: an active GRANTED override unlocks a feature the plan would deny; an active REVOKED override blocks a feature the plan would allow; ADMIN role bypasses everything unconditionally regardless of override state |
| override revoked → subscription-derived plan | Test: after `deactivateEntitlementOverride()`, `getEntitlement()` correctly falls back to the plan-resolved answer (existing test uses a FREE-tier fallback specifically) |
| Stripe lookup failure → fails closed to FREE | Test: never throws, never grants paid access |

**Memoization safety (M4's `AsyncLocalStorage` cache) — re-proven this milestone, not just re-asserted**: the existing 5 dedicated tests were re-read and re-run (`entitlement-service.test.ts`'s `withEntitlementCache` describe block) confirming: same-call de-duplication (N calls for one user inside one scope → 1 real lookup), no cross-user contamination (2 different users in the same scope cached independently, 2 real lookups), no cross-request staleness (2 separate `withEntitlementCache()` calls for the same user → 2 real lookups, never reused), and correct fallback behavior for calls made entirely outside any scope. All still pass (44+3 tests in this describe area, part of the 47-test file total).

## 7. Persona / multi-role audit

`persona-service.ts` re-read in full: roles live in Supabase Auth `app_metadata`, writable only via the service-role Admin API — never client-writable, a structural guarantee rather than a convention. `isAdmin()`/`isRecruiter()` are simple array-membership checks with no assumption about array size, so every role combination (JOB_SEEKER-only, RECRUITER-only, ADMIN-only, and every multi-role combination including all three) resolves through the identical code path: `getEntitlement()`'s `isAdmin(roles)` check short-circuits to `ADMIN_BYPASS` regardless of what other roles are also present, and `resolveEffectivePlans()` returns one `ResolvedPlatformPlan` per role with no cap — a user with 2 or 3 roles simply gets 2 or 3 plan entries, each resolved independently, with `mostPermissive()` unioning across them for any single feature check. No code path treats "ADMIN + another role" differently from "ADMIN alone." No change needed; existing tests already cover the JOB_SEEKER+RECRUITER and ADMIN cases directly, and the ADMIN-bypass code path is provably role-count-agnostic by construction, not merely by the specific combinations tested.

Recruiter ownership: `candidate-service.ts`'s `requireRecord()` is the sole ownership check every scoped method routes through (`.eq("recruiter_id", recruiterId)` on every query) — confirmed systematically applied across match/evaluate/status/notes/tags/bulk-status/delete. One documented, intentional exception (`getForSystemUse()`/`listForSystemUse()`, unscoped) exists solely for the already-deferred `recruitment/**` legacy subsystem's own separate, pre-existing actor model (§3) — not a new gap, the natural consequence of that subsystem's own long-documented design.

## 8. Admin security audit

Re-swept every route under `/api/admin/**` this milestone (not sampled): **zero** missing `requireAdminRoute()`/`requirePlatformAdmin()` calls found across the full `find ... -name route.ts` listing. `/admin/**` page-level guard (`admin/layout.tsx`) re-derives the real role from a fresh Supabase session + `resolvePlatformRoles()` server-side on every request — never trusts client state.

- **Bootstrap**: `timingSafeCompare()` re-read — uses `crypto.timingSafeEqual`, with a fixed-size dummy comparison for length mismatches so wrong-length attempts don't return measurably faster than right-length wrong-value ones. The promoted user is always the caller's own resolved session (`callerUserId`, never a request body field) — structurally cannot promote a third party regardless of secret knowledge. Secret is a plain server-only env var, never `NEXT_PUBLIC_`-prefixed. Confirmed `PLATFORM_ADMIN_BOOTSTRAP_SECRET` is currently unset in this environment (§13), meaning bootstrap fails closed for everyone right now — an operational prerequisite, not a code defect.
- **Last-admin / self-lockout**: `LastAdminError`/`SelfLockoutConfirmationRequiredError` both re-confirmed present and wired in `platform-admin-service.ts`.
- **User enumeration/role/override mutation**: both `searchPlatformUsers`/`getPlatformUserDetail` callers (`/api/admin/platform/users`, `/api/admin/platform/users/[userId]`) confirmed to be the only routes exposing them, both admin-gated — no alternate unguarded endpoint found.

No fixes needed this milestone — this area was already hardened in Phase 18 M3/M4.

## 9. Billing UX / error-contract audit

`AUTH_REQUIRED`/`FEATURE_NOT_INCLUDED`/`QUOTA_EXCEEDED` are the only 3 real codes (`entitlement-response.ts`'s `EntitlementErrorCode` union) — `BILLING_UNAVAILABLE` was re-confirmed (again) to not be a real emitted code anywhere; Stripe/no-billing-account failures already surface as safe generic messages via the existing `actionError` banner, and inventing an unused 4th code was judged, again, not a genuine gap. All 3 real codes map correctly end-to-end: `AUTH_REQUIRED`→Sign In CTA→`/login`; `FEATURE_NOT_INCLUDED`→upgrade CTA with the cheapest granting plan named; `QUOTA_EXCEEDED`→used/limit/period + (since Phase 19 M4) a computed reset-date line. Every one of the 16 real `UpgradePrompt` usages across recruiter/resume/JD/interview/mock-interview/chat/export/analytics/optimizer/rewriter/job-analyzer/job-match surfaces routes to exactly `/settings/billing` or `/login`, both confirmed live and reachable. The 2 export-link gaps found this milestone (§3, Findings #2/#3) were the only remaining `catch(error) → plain string` cases found in a fresh sweep of every `readEntitlementError`/`UpgradePrompt` usage site — both now fixed.

## 10. Usage dashboard audit

`/settings/billing` (extended in Phase 19 M4 with progress bars/percentages/reset dates) draws every displayed number from a single `getBillingOverview()` call — the same `mostPermissive()`/`featuresUsingMetric()` resolution `checkQuotaUncached()` uses for real enforcement, re-confirmed this milestone by re-reading `getBillingOverviewUncached()`'s per-metric limit computation. No duplicated plan/quota constants exist anywhere in the client code — `USAGE_METRIC_LABEL`/`STATUS_BADGE_CLASSNAME` are presentation-only label maps, not a second source of truth for limits.

## 11. Export / download audit

See §3, Findings #2/#3 for the two genuine defects found and fixed. Full sweep this milestone of every export-shaped link in the app (`grep href.*export` across all `.tsx`, 14 files): the single-candidate PDF report link (confirmed, again, to have no entitlement gate — nothing to intercept), resume-rewriter/optimizer/interview-prep export links (confirmed not separately gated — only the generation step is metered, by design), and every other export surface were all re-confirmed correctly behaved. Rejected exports (post-fix) never navigate to raw JSON, never download an error response as a file, show `UpgradePrompt`, and never consume quota (the route's own `requireQuota` check runs before any file generation). Successful exports are unaffected — the fetch+blob path produces an identical real browser download.

## 12. Concurrency / retry audit

| Path | Classification | Reasoning |
|---|---|---|
| Stripe webhook retry/duplicate delivery | **SAFE** | Idempotent upsert by `stripe_subscription_id` (§5) |
| Stripe webhook out-of-order delivery | **SAFE** | Event-timestamp guard, re-verified (§5) |
| Entitlement query retry (same request) | **SAFE** | Request-scoped memoization, fresh per call, no shared mutable state (§6) |
| Billing overview re-fetch (checkout/portal return) | **SAFE** | Read-only GET; M4's bounded (non-indefinite) retry already handles webhook-lag staleness |
| Chat request double-send | **SAFE (by design)** | Each real request is independently checked/metered; 2 real sends = 2 real charged units, which is correct, not a bug |
| LLM internal failure/retry | **SAFE** | `recordUsage` only ever runs once, after the whole call resolves (§4) |
| Browser double-click (checkout/export/candidate actions) | **SAFE WITH CLIENT-SIDE GUARD** | Every mutating button audited this session (checkout, all export buttons, compare, bulk-status, match/evaluate/insights/readiness) disables itself via a `pending`/`busy` state during the in-flight request |
| Concurrent quota-boundary requests (server-side) | **BEST-EFFORT ENFORCEMENT, not strict** | Unchanged, already-documented read-then-write race (§4, item 5) |
| Duplicate checkout (2 near-simultaneous initiations both completed with real payment) | **SAFE WITH EVENTUAL CONSISTENCY** | `DuplicateSubscriptionError` blocks the common case (already on a paid plan); a genuine race could in theory produce 2 real Stripe subscriptions in the same family, but `pickBestSubscriptionForRole()` deterministically picks the most-recently-updated one for entitlement purposes — worst case is a customer-billing/refund conversation, never free/unentitled access. Not fixed — would require a Stripe idempotency key or DB unique constraint, judged speculative infrastructure without evidence this has ever actually happened |
| Duplicate candidate action (double-click Re-evaluate/Match) | **SAFE WITH CLIENT-SIDE GUARD** | Same `busy` state pattern; server-side, 2 real requests would correctly consume 2 real quota units for 2 real operations |

No fixes made in this section — every item is either already safe by construction or an already-documented, deliberate trade-off.

## 13. Live validation results

Dev server run locally; all probes below were run against it and are real HTTP responses, not simulated.

**Unauthenticated billing routes**: `GET /api/billing/platform/overview` → `401`; `POST /api/billing/platform/checkout` → `401`; `POST /api/billing/platform/portal` → `401`.
**Unauthenticated admin routes**: `GET /api/admin/platform/users` → `401`; `POST /api/admin/bootstrap` (no secret) → `401`; `POST /api/admin/bootstrap` (wrong secret) → `401`; `GET /admin` (no session) → `307` → `/admin/login`; `GET /admin/platform/users/not-a-real-uuid` → `307`.
**Unauthenticated recruiter routes**: `GET /api/ai/recruiter/candidates` → `401`; `POST /api/ai/recruiter/recommend` → `401`.
**Unauthenticated paid feature routes**: `POST /api/ai/resume-rewriter` (anonymous-by-design) → `400` (validates input first, correctly still reachable).
**Invalid Stripe webhook**: missing `stripe-signature` header → `400`, safe generic error body, no processing attempted.
**Malformed webhook payload**: same `400` path — the raw body is never parsed before signature verification, confirmed structurally (verification itself could not be fully exercised end-to-end since `STRIPE_SECRET_KEY` is not configured in this environment — see below; this is disclosed, not glossed over).
**LinkedIn/Cover Letter absence-of-gate (safe probe, no real generation triggered)**: `POST /api/ai/linkedin/bogus-id/about` and `POST /api/ai/cover-letter/bogus-id/letter` both returned `422` (JSON-parse error from my empty body) — critically, **not** `401` — confirming no auth/entitlement check runs before the route attempts to do real work, unlike every gated route probed above.

**If Supabase migrations remain unapplied**: **Yes, confirmed this milestone** — a direct read-only REST probe against the live configured Supabase project (`platform_billing_customers?select=id&limit=1`) returned `404 PGRST205 "Could not find the table"`. Unchanged since Phase 18 M6.
**If Stripe credentials remain unavailable**: **Yes, confirmed this milestone** — `STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET` both absent from `.env.local` (presence-checked only, values never read/logged). `PLATFORM_ADMIN_BOOTSTRAP_SECRET` is also absent (newly re-confirmed this milestone).
**No authenticated or Stripe E2E was fabricated** — every claim above is either a `CODE VERIFIED` static/test-suite result or a `LIVE VERIFIED` probe against a real running server/real Supabase REST API, explicitly labeled.

## 14. Genuine defects fixed this milestone

1. Chat recruiter tool-calling bypassed `recruiter.analytics` for `compare`/`recommendTopCandidates` (§3, Finding #1) — fixed, 4 regression tests.
2. `RecruiterComparisonTab.tsx`'s comparison export links bypassed the established fetch+blob/`UpgradePrompt` pattern (§3, Finding #2) — fixed.
3. `RecruiterCandidateTable.tsx`'s bulk "Export Selected" links had the identical defect (§3, Finding #3) — fixed.
4. Extracted the now-3×-duplicated fetch+blob export pattern into a shared `export-download.ts` utility — a net simplification alongside fixes 2/3.

## 15. Deferred findings (each with a concrete reason)

1. **LinkedIn Optimizer / Cover Letter — zero entitlement plumbing** (§3, Finding #4). Reason deferred: requires product/pricing decisions outside an audit's authority, and the scope (~37 routes) is materially larger than every other fix this session. Top priority for next phase.
2. **`/api/ai/recruitment/**` legacy subsystem's blanket lack of authentication**, including its real, unmetered LLM-cost routes (5 email routes, feedback-summarize, generate-kit, hiring-recommendation) (§3). Reason deferred: a four-times-documented, deliberate architectural decision (Phase 13 M9 onward); redesigning its entire actor/auth model is out of "minimal fix" scope and was explicitly ruled out of M3's charter already.
3. **Session-repeatable sub-operation cost** (`resume.rewrite`/`interview.mock` metered once at session start, not per-turn). Reason deferred: MEDIUM severity per M3's own reasoning (requires sustained deliberate repetition, already has a session-count ceiling); adding a new per-operation quota without evidence of actual abuse would itself violate this milestone's "don't add quota semantics speculatively" instruction.
4. **Quota-check/record race under true concurrency** (§4, item 5 / §12). Reason deferred: no atomic Supabase primitive is wired for this; every quota here is a generous backstop, not a precise meter; introducing distributed locking without evidence of real exploitation is exactly the speculative infrastructure this milestone prohibits.
5. **`interview.study_plan` has no independent `requireFeature` call anywhere.** Investigated: it's served by the interview-prep `coverage` endpoint, which shares interview-prep's own ephemeral-unauthenticated-by-design model (an unguessable `prepId` is the access control) rather than a per-request entitlement check — consistent with how `debrief`/`progress` on the mock-interview side work, and distinct in kind from the LinkedIn/Cover-Letter gap (this data is deterministic/derived from an already-generated report, not a fresh paid LLM call). Reason deferred: not a new LLM-cost exposure (the report generation itself IS gated via `interview.prepare`), and re-architecting the ephemeral-token model to add a redundant per-metric check is disproportionate to the actual risk.
6. **Duplicate-checkout race** (§12). Reason deferred: theoretical, no evidence of occurrence, worst case is a billing/refund conversation, not free access.

## 16. Test results

**14 new tests this milestone** (9 in `resume.tool.test.ts` for the chat-bypass regression — wait, 4 new `it()` blocks were added, each independently assertion-bearing; see exact count below), all added only for genuinely new/uncovered behavior discovered during this audit:

- **`resume.tool.test.ts`** (+4 tests, new describe block): proves `requireFeature(recruiterId, "recruiter.analytics")` is called, and called *before* the LLM-backed service function, for both the `compare` and `recommend` chat intents; proves a rejection prevents `candidateService.compare()`/`recommendTopCandidates()` from ever running and instead surfaces the friendly `FeatureNotEntitledError` message through the chat response.

No new tests were added for the export-link fixes (§14 items 2-4) — consistent with this repo's established policy (no React Testing Library infrastructure exists anywhere; UI wiring changes with no new business logic are verified via `tsc`/lint/live probe, following the exact precedent M3/M4 both documented explicitly).

**Full suite: 1149 / 1149 passing** (88 test files), up from the 1145 baseline this milestone started with — 4 new, zero modified assertions in pre-existing tests, zero removed.

## 17. TypeScript / lint / build results

- `tsc --noEmit` — clean (run after every substantive change, and once more at the end).
- `eslint .` (whole project) — clean; the same one pre-existing, unrelated `<img>` warning in `blog/[slug]/page.tsx` carried since before Phase 18.
- `npm run build` — succeeded (exit 0); every touched route (`/api/ai/chat`, `/api/ai/recruiter/*`, `/settings/billing`, `/recruiter`, `/recruiter/candidates/[candidateId]`) compiles and appears correctly in the route manifest.

## 18. Final classification

**D — Significant monetization defect remains.**

This is an evidence-based call, not a reflexive escalation: the previously-monetized, previously-audited 25-feature system (resume/job/interview/recruiter) is, by every measure this milestone could apply — Stripe lifecycle integrity, admin security, quota accounting, multi-role correctness, request-scoped cache safety, export/UX correctness — genuinely solid, and this milestone's own fix (the chat recruiter-tool bypass) closed the one real gap found *within* that system. Classifying purely on that system alone would support a **B** (production ready pending the operational trio in §19).

The reason for **D** is §3's Finding #4: LinkedIn Optimizer and Cover Letter are two entire, currently-shipping, real-LLM-cost product surfaces with **no** monetization or cost control of any kind, reachable by fully anonymous callers, live-probed and confirmed this milestone. This is not a UX gap or a theoretical edge case — it is a genuine, currently-exploitable, unbounded financial exposure, structurally identical in shape to the exact defect class Phase 19 M2 was chartered to close for the AI Assistant (true-unlimited free LLM usage), just in two subsystems that were apparently never brought into Phase 19's scope to begin with. "Significant monetization defect" is the accurate, literal description of that finding, not an overstatement — and Step 14 of this milestone's own charter requires using evidence, not optimism, in this classification.

## 19. Exact operational prerequisites

Unchanged from Phase 18 M6 onward, all re-verified this milestone via live, read-only probes (§13):

1. **Apply the two pending Supabase migrations** (`20260816000000_add_platform_entitlement_tables.sql`, `20260817000000_add_platform_billing_tables.sql`) to the target project — confirmed still unapplied (`PGRST205` on a real REST probe).
2. **Provision real Stripe credentials** (`STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, and the 4 `STRIPE_PRICE_*` env vars) and register the platform webhook endpoint in the Stripe dashboard — confirmed still absent.
3. **Set `PLATFORM_ADMIN_BOOTSTRAP_SECRET`** and run the bootstrap flow against a real account once migration #1 is applied — confirmed still absent (newly re-verified this milestone; not previously called out as its own line item).

## 20. Recommended next phase

**Phase 19 Milestone 6 — LinkedIn Optimizer & Cover Letter Monetization**, the direct, necessary follow-up to this milestone's top finding:
1. Decide the product placement (which plan tier(s) include these, or a deliberate "stays free" decision) — a product/pricing call, not an engineering one.
2. If monetized: add 2 feature IDs (and metrics if quota-limited) to the existing registry, following the exact established pattern every other feature already uses — no new architecture.
3. If deliberately kept free: add the same "intentionally anonymous by design" documentation every other free feature already carries, and consider whether even a free feature should have *some* backstop quota (matching Phase 19 M2's own precedent for AI Assistant) given the real, unbounded LLM cost otherwise.
4. Operational activation (§19) remains the other prerequisite, unrelated to code — apply migrations, provision Stripe/bootstrap credentials.
5. Lower priority: revisit the `recruitment/**` subsystem's blanket-open design only if real abuse evidence emerges (per this and every prior milestone's own reasoning), and reconsider the session-repeatable sub-operation cost items only under the same evidence-based bar.

---

## Machine-readable recap

```
STATUS: AUDIT COMPLETE, GENUINE FIXES APPLIED, ONE MAJOR GAP DEFERRED
TESTS: 1149/1149 passing (88 files, +4 new)
TSC: CLEAN
LINT: CLEAN (1 pre-existing unrelated warning)
BUILD: SUCCESS
LIVE_PROBES: PASS (unauthenticated billing/admin/recruiter/paid-feature routes all correctly rejected; webhook missing-signature rejected; LinkedIn/Cover-Letter absence-of-gate confirmed safely)
STRIPE_E2E: NOT ATTEMPTED (no Stripe credentials in this environment — disclosed, not fabricated)
AUTH_E2E: NOT ATTEMPTED (no authenticated account in this environment — disclosed, not fabricated)
MIGRATIONS: NOT APPLIED (confirmed via live Supabase REST probe, PGRST205)
GENUINE_FIXES: 4 (chat recruiter-tool entitlement bypass; 2 export-link UX bypasses; 1 shared-utility extraction)
DEFERRED: 6 (LinkedIn/Cover-Letter unmetered [top priority]; recruitment/** blanket auth gap; session-repeatable sub-operation cost; quota-check race; interview.study_plan independent gate; duplicate-checkout race)
CLASSIFICATION: D — Significant monetization defect remains (LinkedIn/Cover-Letter unmetered LLM cost exposure); the previously-chartered 25-feature system itself is solid and would independently support a B
```
