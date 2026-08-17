# Phase 19 Milestone 4 — Monetization UX, Quota Transparency & Usage Efficiency

Scope: audit and, where a genuine defect was found, fix the individual-user billing dashboard's UX (usage visibility, near-quota warnings, structured-error rendering), the entitlement/usage query-repetition inefficiency flagged by Phase 19 M3 as a deferred item, and the AI-feature session-repetition risk class. No quota semantics, limits, periods, feature IDs, plan definitions, or Stripe mapping were changed. No commits were made.

## 1. Re-audit of Phase 19 M3's deferred findings

All 4 of M3's §17 deferred findings were re-checked against the current codebase before any new work began, since no commit since M3 had touched any of them:

1. **UI consistency gap** — `match`/`evaluate`/`insights`/`compare`/`recommend`/`bulk-status` client callers didn't render `UpgradePrompt` on rejection. **Confirmed still present.** Fixed this milestone (§4).
2. **Session-repeatable sub-operation cost** (`resume.rewrite`/`interview.mock` charge once at session start, not per-turn) — confirmed unchanged; **still deferred**, same reasoning as M3 (adding a new per-operation quota without stronger evidence of actual abuse would violate this milestone's own Step 16 prohibition on changing quota semantics without a proven defect).
3. **Broader `/api/ai/recruitment/**` authentication gap** — confirmed 27 routes under that legacy subsystem still lack authentication (verified by re-listing every `route.ts` under `src/app/api/ai/recruitment/` and grepping for `requireUserId`/`requireRecruiterId`/`getOptionalUserId`). Unrelated to monetization specifically (per M3's own scoping) — **still deferred**.
4. **Concurrency race** (`checkQuota()` → `recordUsageEvent()` read-then-write, no atomic constraint) — confirmed unchanged, no atomic Supabase primitive introduced. **Still deferred**, per Step 10's own instruction not to introduce speculative locking infrastructure.

## 2. Billing dashboard UX audit

`/settings/billing` previously showed a raw usage count (`usedThisMonth`) with no limit, no percentage, no remaining count, and no reset information — a user had no way to tell how close they were to their quota without separately triggering a `QUOTA_EXCEEDED` rejection elsewhere. Fixed (§16).

## 3. Quota transparency audit — usage progress visualization

Added a new presentational component, `UsageProgress` (`src/components/billing/platform/UsageProgress.tsx`), rendering, for every metric on `/settings/billing`:

- A progress bar + `used/limit (percent%) · remaining` text, computed entirely from server-provided numbers.
- Near-quota warning thresholds: **70–89% "Approaching limit"** (amber), **≥90% "Nearly exhausted"** (red), **100% "Limit reached"** (red) — presentation-only; never touches `checkQuota()`/`requireQuota()`'s own enforcement.
- A distinct **"Unlimited"** state (ADMIN bypass, an UNLIMITED plan tier, or an active override — `limit === null`) and a distinct **"Not included on your current plan"** state (`limit === 0`) — neither renders a bar, avoiding a meaningless 0/0 or fabricated 100%-looking display.
- A "Resets [date]" line, computed client-side from the same UTC boundary rule `usage-event-service.ts`'s `periodStartIso()` already enforces (DAY → next UTC midnight, MONTH → the 1st of next UTC month, LIFETIME → never) — no new server field, nothing fabricated.

To support this without any client-side quota math, `getBillingOverview()` (`entitlement-service.ts`) was extended: each `usage` row now also carries `limit`/`period`, computed via the exact same `mostPermissive()`/`featuresUsingMetric()` resolution `checkQuotaUncached()` already performs — reusing the `features` array already computed in the same function call, at **zero extra Supabase queries**. `BillingOverview.usage`'s type changed from `UsageSummary[]` to `UsageWithLimit[]` (additive; `UsageSummary` itself, used elsewhere, is unchanged).

## 4. UpgradePrompt / structured-error UX audit

Traced every route gated by `requireFeature`/`requireQuota` back to its client caller. Found 6 callers that discarded the `code`/`limit`/`used`/`period`/`featureId` shape and either showed a bare error string or (`recommend`, `insights` on the candidate page) **silently swallowed the rejection with no user-visible feedback at all** — the button reverted to its idle state with zero explanation. Fixed by wiring the established `readEntitlementError()` → `UpgradePrompt` pattern (identical to `RecruiterAnalyticsTab`'s, the milestone's own reference implementation) into:

- `RecruiterComparisonTab.tsx` (`compare`)
- `RecruiterInsightsTab.tsx` (`insights`, the standalone Insights tab)
- `recruiter/candidates/[candidateId]/page.tsx` (`match`, `evaluate`, `insights`, `interview-readiness` — shares one `actionEntitlementError` state; the `insights` handler previously never checked `response.ok` at all, a genuine pre-existing bug, now fixed alongside)
- `recruiter/page.tsx` (`recommend` — previously a silent no-op on rejection)
- `RecruiterCandidateTable.tsx` (`bulk-status`, via a new `EntitlementAwareError` class threaded through the existing throw/catch boundary between `page.tsx` and the table component, since the table only ever sees a caught `Error`, not the raw response)

QUOTA_EXCEEDED's own presentation was also extended with the reset-date line above (§3), closing M3's own noted gap ("only shows used/limit/period, no explicit reset text").

## 5. AUTH_REQUIRED audit

Unchanged and re-verified correct: every `UpgradePrompt` instance (17 files, 16 using the platform component — `CreditBalanceCard.tsx` intentionally uses the separate org-scoped `UpgradePrompt`, per its own documented reasoning) renders the "Sign In" CTA → `/login` for `AUTH_REQUIRED`, never the upgrade CTA. `/login` confirmed to exist and render (live probe, §23).

## 6. BILLING_UNAVAILABLE audit

Re-confirmed Phase 18 M8's own finding still holds: `checkout`/`portal`/`overview`/`webhook` routes are unchanged since that audit (re-read in full this milestone). No code path anywhere emits a 4th entitlement error code; the real union remains `AUTH_REQUIRED | FEATURE_NOT_INCLUDED | QUOTA_EXCEEDED`. The only "no billing account" case (`NoBillingAccountError`) is unreachable through the normal UI (the "Manage Subscription" button only renders when a paid plan already exists), and Stripe API failures already surface as safe generic messages via the existing `actionError` banner. Inventing an unused code would contradict "don't rewrite correct code" — **not implemented, documented as correct-as-is**.

## 7. Multi-role display audit

Re-verified via the existing `getBillingOverview` test suite (a JOB_SEEKER+RECRUITER account correctly resolves 2 independent `PlanSummary` entries, ADMIN resolves `planKey: null` correctly) and code review of `/settings/billing`'s per-role rendering (`Current Plan` grid, per-role `PlanComparison` sections filtered to `overview.roles`, per-role usage metric union via `relevantMetricsForRoles`). No regressions; unchanged this milestone beyond the usage-row shape extension (§3), which is additive.

## 8. Upgrade-path dead-link audit

Every `UpgradePrompt` routes to exactly two destinations: `/settings/billing` (upgrade CTA) or `/login` (AUTH_REQUIRED CTA) — both confirmed to exist and render via live probe. Traced Phase 19 M1's Navbar `/settings/billing` link specifically (`Navbar.tsx:23`) — resolves correctly. **No dead links found.**

One related, lower-severity finding surfaced during this trace: `settings/layout.tsx` (the shared auth guard for every `/settings/*` page, including `/settings/billing`) redirects an unauthenticated visitor to a **hardcoded** `/login?redirect=/settings/organization` regardless of which settings sub-page they actually requested — so a signed-out user who clicks the Navbar's "Billing" link lands on the Organization tab after logging in, not Billing, requiring one extra click. This is not a dead end (both pages are valid and reachable) and matches this codebase's own established convention exactly — `recruiter/layout.tsx`, `billing/layout.tsx`, and `invite/[token]/page.tsx` all hardcode a single redirect target the same way, none of them path-aware. A genuinely path-aware fix would require introducing `middleware.ts` (new infrastructure, not currently present anywhere in this repo) purely to solve a one-extra-click papercut — judged disproportionate to the actual impact. **Documented, not fixed** (§18).

## 9. Downgrade / plan-change UX audit

Phase 18 M8 had claimed stale display after checkout was "structurally impossible" because the page re-fetches on every mount. That reasoning only accounts for *client-side* caching — it doesn't account for **Stripe webhook delivery being inherently asynchronous**: nothing guarantees `checkout.session.completed` lands before the browser's own redirect back to `/settings/billing?checkout=success` completes, so the "fresh" fetch on mount can still read pre-webhook data. This is a genuine, structural gap M8's own reasoning missed. Additionally, the Stripe **billing portal**'s return URL (`/settings/billing`, no distinguishing query param at all) gave the page zero signal that a plan change might be in flight, unlike checkout's `?checkout=success`.

**Fixed**, proportionately:
- `portal/route.ts` now returns to `/settings/billing?billing=updated`, mirroring checkout's own `?checkout=success` convention.
- `/settings/billing/page.tsx`: on either return marker, after the initial fetch, a **short, bounded** retry sequence (3 attempts, 2s/3s/4s apart — never indefinite polling) re-fetches the overview and stops the instant the resolved plan signature (role/planKey/status/cancelAtPeriodEnd) actually changes, or the fixed attempt budget runs out. A "Refreshing…" hint appears on the existing return banners while retries are in flight.

This directly follows Step 11's own instruction: "use existing refetch mechanisms if a gap is found, no new polling unless proven necessary" — the gap was proven (webhook-delivery race is inherent to any Stripe integration, not hypothetical), and the fix is bounded, not open-ended polling.

## 10. Entitlement query repetition (continued from the prior turn)

Already implemented and tested before this report was written (see conversation history): `AsyncLocalStorage`-based, call-scoped memoization (`withEntitlementCache()`) of `resolvePlatformRoles`, `listSubscriptionsForUser`, and `listActiveOverrides`, wired into `resolveEffectivePlans()`, `getEntitlement()`, `checkQuota()`, and `getBillingOverview()` (`entitlement-service.ts`), plus `platform-admin-service.ts`'s `getPlatformUserDetail()`. Collapses `getBillingOverview()`'s ~75 redundant Supabase lookups (25 features × role+subscription+override) down to 2 (one role lookup, one subscription lookup — overrides looked up once), and `checkQuota()`'s up-to-3x redundancy for metrics shared by multiple features (e.g. `JD_MATCHES`) down to 1x.

## 11. Usage query repetition

`getUsage()` (3 `getUsageCount` calls per metric — DAY/MONTH/LIFETIME) was already always called once per metric, never redundantly, both before and after this milestone. The new per-metric `limit`/`period` computation added in §3 reuses the `features` array already in memory — **zero additional usage queries**.

## 12. Request-scoped memoization — design and guarantees

`withEntitlementCache<T>(fn)` creates a **fresh** `{roles, subscriptions, overrides}` `Map` on every call and runs `fn` inside a new `AsyncLocalStorage` store scope. Explicitly:

- **Never module-global** — no cache survives outside an active `withEntitlementCache()` call; a caller outside any scope falls back to the pre-M4, unmemoized direct call.
- **Never cross-user** — keyed by `userId` within the `Map`; two different users in the same scope are cached independently.
- **Never cross-request** — `AsyncLocalStorage` guarantees each concurrent request/call sees its own store, even for the identical `userId`; two sequential `withEntitlementCache()` calls never share data.

## 13. AI-feature session-repetition audit (identity resolution)

Distinct from §10/12 (entitlement *value* caching) — this audits `requireUserId()`/`requireRecruiterId()`/`getOptionalUserId()` being called **redundantly within one request**. Every route named in this milestone's charter (AI Assistant/`chat`, Mock Interview, Interview Prep, recruiter interview-readiness, JD Optimization, Candidate Evaluation, Candidate Matching) was read in full; a broader sweep across every route under `src/app/api/ai/**` and `src/app/api/billing/**` was also run (grep for identity-resolution call counts per file, then each hit >1 was individually read to rule out false positives from doc-comment text or separate per-HTTP-verb handlers).

**One genuine defect found**: `interview-prep/route.ts`'s `resumeVersionId` code path called `requireUserId()` (`resume-version-auth.ts`, to resolve resume-version ownership) **and then separately** `getOptionalUserId()` (`persona-service.ts`, for the entitlement check) — both wrap the identical `supabase.auth.getUser()` call, meaning two real network round-trips to Supabase Auth per request for the same session. **Fixed**: the `userId` already resolved by `requireUserId()` is reused directly for the entitlement check in that branch; the `{resumeId, jdMatchId}` path (which stays intentionally anonymous) is unaffected and still calls `getOptionalUserId()` exactly once. No other route in the audited set had this pattern.

## 14. Accessibility audit

Reviewed every monetization UI surface added/modified across Phase 18–19, focused on the components touched this milestone:

- **`UsageProgress`**: `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax` and a full descriptive `aria-label`; every severity state (approaching/nearly-exhausted/exhausted/unlimited/not-included) is conveyed by **text**, never color alone.
- **`UpgradePrompt`**: unchanged `role="status" aria-live="polite"` container; the new reset-date line is plain text within the same live region. CTA buttons already have `focus-visible` outlines.
- **`PlanComparison`**: unchanged — `aria-labelledby` sections, `aria-label` on upgrade buttons, "Current Plan" distinguished by text label + color (not color alone).
- Fixed one small pre-existing gap while touching `RecruiterInsightsTab.tsx`: its plain error `<div>` was missing `role="alert"` (every sibling error banner elsewhere in the app has it) — added.
- The bounded-retry "Refreshing…" text on `/settings/billing`'s return banners renders inside the banners' existing `role="status"` containers, so it is announced without any new live region.

No color-only state indicators were introduced or found in the surfaces touched this milestone.

## 15. Mobile / narrow-viewport audit

`/settings/billing`'s grids (`Current Plan`, `Usage`, `PlanComparison`) all use Tailwind's mobile-first `sm:grid-cols-N` pattern, collapsing to a single full-width column below 640px by default — unchanged, already correct. `UsageProgress` cards and the progress bar itself use `w-full`/no fixed widths, so no horizontal-scroll risk was introduced. The recruiter bulk-action bar (now also rendering `UpgradePrompt` on rejection) already used `flex flex-wrap`. No mobile-specific defects found in the surfaces touched this milestone.

## 16. Genuine defects discovered and fixed this milestone

1. UI-consistency gap: 6 recruiter-workspace action callers (`match`/`evaluate`/`insights`/`compare`/`recommend`/`bulk-status`) showed a plain error string or nothing at all on an entitlement rejection, instead of `UpgradePrompt` — including a case (`insights` on the candidate page) where the rejection was **silently swallowed with no user feedback whatsoever** (pre-existing bug, unrelated to entitlements specifically — the handler never checked `response.ok`).
2. `/settings/billing`'s Usage section showed a raw count with no limit, percentage, remaining, near-quota warning, or reset information.
3. `QUOTA_EXCEEDED`'s `UpgradePrompt` presentation had no reset-date information (M3's own noted gap).
4. A real webhook-delivery race could leave `/settings/billing` showing stale plan data after a checkout or portal return, contrary to M8's own (incomplete) reasoning that this was "structurally impossible."
5. The Stripe billing portal's return URL had no distinguishing marker at all, unlike checkout's `?checkout=success`.
6. `interview-prep/route.ts`'s `resumeVersionId` path made two redundant Supabase Auth network calls per request instead of one.

## 17. Fixes implemented

All 6 items in §16, plus the entitlement/usage query-repetition memoization (§10/12, carried into this report from the same milestone's earlier work). Zero new feature IDs, zero new usage metrics, zero changes to `PLATFORM_PLAN_DEFINITIONS`/`FEATURE_REGISTRY`/Stripe price-ID mapping, per Step 16's explicit prohibition.

## 18. Deferred items

1. M3's 3 still-open deferred findings (§1, items 2–4) — unchanged, re-confirmed still accurate.
2. `settings/layout.tsx`'s hardcoded (non-path-aware) post-login redirect target (§8) — LOW severity, one extra click, matches the app's own established per-layout convention; a true fix requires introducing `middleware.ts`, judged disproportionate.
3. `BILLING_UNAVAILABLE` — confirmed correctly unimplemented (§6).

## 19. Tests

**14 new tests**, all in files with pre-existing test infrastructure — no new component/`.tsx` test scaffolding was introduced (this repo has no React Testing Library setup anywhere; every prior milestone's own testing convention verifies `.tsx` UI via live probe instead, not unit tests, and this milestone follows that same precedent):

- **`entitlement-service.test.ts`** (+9): request-scoped memoization correctness — single-scope de-duplication across multiple `getEntitlement()` calls for the same user; `checkQuota()`'s own internal scope de-duplicating across every feature sharing a metric; no cross-user cache contamination within one scope; no cross-request/cross-scope stale reuse; correct behavior for a call made outside any active scope; `getBillingOverview()`'s own scope collapsing role/subscription/override lookups to one each; and 3 tests proving the new per-metric `limit`/`period` on `BillingOverview.usage` matches real `checkQuota()` resolution (a normal LIMITED case, a NONE-access case reporting `limit: 0` not null, and ADMIN's UNLIMITED case reporting `limit: null` not a fabricated ceiling).
- **`entitlement-client-error.test.ts`** (+5): `EntitlementAwareError` correctly carries `EntitlementErrorInfo` through a throw/catch boundary; `describeResetDate()`'s UTC boundary math for MONTH/DAY/LIFETIME/unrecognized-period, including a December → January rollover (locale-agnostic assertions, since the display string itself is deliberately locale-dependent, matching this codebase's own existing `.toLocaleDateString()` convention elsewhere).

The `interview-prep/route.ts` identity-resolution fix (§13) and the 6 UI-consistency wiring changes (§4) were judged **not** to need dedicated new tests: both are behavior-preserving (identical inputs/outputs, only the internal call count/rendering path changed) and low-risk, verified instead via `tsc`, lint, and live probes — consistent with M3's own stated policy that not every fix receives a dedicated test, only those representing "genuinely distinct risk shapes."

## 20. TypeScript result

`tsc --noEmit` — clean, run after every substantive change and once more at the end of the milestone.

## 21. Lint result

`eslint .` (whole project) — clean; the same one pre-existing, unrelated `<img>` warning in `blog/[slug]/page.tsx` carried since before Phase 18.

## 22. Build result

`npm run build` — succeeded (exit 0). `/settings/billing`, `/recruiter`, `/recruiter/candidates/[candidateId]`, and every touched API route all compile and appear correctly in the route manifest.

## 23. Live probes

- **CODE VERIFIED**: full test suite (§19), `tsc`, `eslint`, build (§20–22).
- **LIVE APPLICATION VERIFIED** (dev server, unauthenticated caller):
  - `GET /api/billing/platform/overview` → `401`
  - `POST /api/billing/platform/portal` → `401`
  - `POST /api/ai/recruiter/compare` → `401`
  - `POST /api/ai/recruiter/candidates/bulk-status` → `401`
  - `POST /api/ai/interview-prep` with no `resumeId`/`resumeVersionId` → `400` (unauthenticated `{resumeId,jdMatchId}` path still correctly reachable and validates input first, confirming it remains intentionally anonymous)
  - `POST /api/ai/interview-prep` with `resumeVersionId` → `401` (confirms the session-repetition fix, §13, didn't change the auth outcome — same 401 as before the fix, now via one Supabase Auth call instead of two)
  - `GET /settings/billing` (no session) → `307` to `/login?redirect=/settings/organization` (confirms §8's documented, deferred finding)
  - `GET /login` → `200`
- **LIVE SUPABASE VERIFIED**: read-only probe against the real configured project (`platform_billing_customers`, `platform_entitlement_overrides` — both `select id limit 1` via the REST API, the same methodology Phase 18 M6 established) — both `404 PGRST205` ("table not found"), confirming the platform entitlement/billing migrations are still not applied (§24).
- **LIVE STRIPE VERIFIED**: not applicable — no Stripe code touched this milestone beyond the portal return-URL string.
- **LIVE LLM VERIFIED**: not attempted — no authenticated account exists in this environment (unchanged status, every prior milestone).

## 24. Operational prerequisites (read-only recheck; nothing auto-modified)

Unchanged from Phase 18 M6 onward, re-verified this milestone:

1. **Supabase migrations not applied** — `supabase/migrations/20260816000000_add_platform_entitlement_tables.sql` and `20260817000000_add_platform_billing_tables.sql` exist in the repo but the live project still returns `PGRST205` for `platform_billing_customers`/`platform_entitlement_overrides` (live-probed this milestone, §23). **Manual action required**: apply both migrations to the target Supabase project.
2. **Stripe credentials missing** — `STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET` both absent from `.env.local` (presence-checked, values never read/logged). **Manual action required**: provision real Stripe keys and register the platform webhook endpoint.
3. **Platform admin bootstrap** — code path exists (`/api/admin/bootstrap`, self-target-only) but is gated behind the same missing migration. **Manual action required**: apply migration #1, then run the bootstrap flow against a real account.

## 25. Final classification

**B — Minor non-blocking issues**, unchanged from Phase 18 M8/Phase 19 M1–M3's own classification. This milestone found and fixed real UX completeness gaps (silent rejection swallowing, missing quota transparency, a genuine webhook-race staleness bug M8 had incorrectly called "structurally impossible") and a real (non-security) efficiency defect (duplicate identity resolution), but discovered **no new security or monetization-bypass defect**. What remains — the unchanged operational trio (§24) and the 3 deliberately-deferred items (§18) — are the same class of pre-launch/production-readiness and low-severity completeness items every milestone since M6 has carried forward, none of them an open bypass.

## 26. Recommended Phase 19 Milestone 5

1. **Operational activation** — apply the two pending Supabase migrations and provision real Stripe credentials; this is now the single largest gap between "code complete" (true since Phase 18 M8) and "production live."
2. **Session-repeatable sub-operation cost** (§1, item 2) — if real usage data after launch shows actual abuse of `resume.rewrite`/`interview.mock`'s per-session (not per-turn) charging, revisit with concrete evidence rather than a speculative fix.
3. Consider a path-aware post-login redirect for `/settings/*` (§8/§18) if user feedback after launch shows the current one-extra-click behavior is actually confusing in practice — currently judged too minor to justify introducing `middleware.ts`.
