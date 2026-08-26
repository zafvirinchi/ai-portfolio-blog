# Phase 23 — Milestone 4: Recruiter Activation, Billing & Entitlement Lifecycle Validation

## 1. Executive Summary

This milestone validated the complete recruiter commercial lifecycle
introduced by M3's self-service RECRUITER activation: signup → default
JOB_SEEKER → activate RECRUITER → Recruiter Workspace → purchase a plan →
Stripe webhook → entitlement resolution → usage → upgrade/downgrade/
cancellation → role/entitlement consistency.

**One genuine defect was found and fixed**: a caller who reached the
checkout API directly (bypassing both `/recruiter`'s activation gate and
`/settings/billing`'s role-filtered plan cards) could successfully pay for
a RECRUITER plan whose entitlements `resolveEffectivePlans()` would then
permanently ignore, because entitlement resolution only ever considers
roles already present in `app_metadata` — never a Stripe subscription for
a role the user doesn't hold. This is exactly the "payment succeeded but
plan is ignored" state the milestone was created to rule out. Fixed
minimally by self-service-activating RECRUITER at checkout time, reusing
M3's own `activateRecruiterPersona()`.

**One real, non-security gap was found and deliberately left unfixed**,
per this milestone's own explicit instruction not to auto-change role-
removal behavior: when an ADMIN removes the RECRUITER role from a user,
access is correctly and immediately cut off (verified, no security
defect), but the underlying Stripe subscription is left running,
completely unaddressed by any code path — the user keeps being charged
with no system awareness of the mismatch. Documented in §9 as an
operational recommendation, not fixed as code.

Everything else audited (webhook idempotency/ordering/forgery protection,
chat-tool entitlement parity, multi-role resolution, the recruiter feature
gate sweep, IDOR) was found already correct, with no regression from M1-M3.

## 2. Recruiter Activation Flow

Re-audited `POST /api/persona/recruiter/activate` (M3) with fresh eyes:

- Identity: `requireUserId()` only — session-derived, never a request
  body/query/path value. Live-probed unauthenticated → `401`.
- Role granted: hardcoded to `"RECRUITER"` inside
  `activateRecruiterPersona()` — the function signature takes only
  `userId`, no role parameter exists anywhere in the call chain, so it is
  structurally incapable of granting `ADMIN` or any arbitrary role.
- Idempotent: `if (isRecruiter(current)) return current;` — a repeat call
  is a pure no-op read, no extra write.
- Additive: `[...current, "RECRUITER"]` — `JOB_SEEKER` (or any other
  existing role) is never dropped.
- Cannot target another account: the only identity in scope is the
  caller's own `userId` from `requireUserId()`; there is no second
  `targetUserId` parameter anywhere in this specific self-service path
  (unlike `platform-admin-service.ts`'s admin-only `assignPlatformRole`,
  which does take one, gated separately by `requirePlatformAdmin()`).

**Storage/visibility**: purely `app_metadata.platform_roles` (Supabase
Auth), not a new table, not cached anywhere. The very next call to
`resolvePlatformRoles(userId)` — used by `resolveEffectivePlans()`,
`getEntitlement()`, `checkQuota()`, `requirePlatformAdmin()`,
`persona-service.ts`'s helpers, and now `platform-billing-service.ts`'s
`initiateCheckout()` — sees the new role immediately; there is no
propagation delay, no session refresh required, no stale-cache window
(`entitlementCacheContext`/`withEntitlementCache()` is a fresh `Map` per
request, per CLAUDE.md's own documented rule, never cross-request).
Navigation/dashboard routing (`resolveDefaultLandingPath()`, M3) reads the
same source, so a fresh login after activation will route to `/recruiter`
on the very next authentication.

## 3. Role Model

Confirmed unchanged from M2/M3: `recruiter_id === auth.users.id`, no
separate recruiter profile table, one Supabase user maps to at most one
`recruiter_id` structurally. `RECRUITER` is now the one role a signed-in
user may self-grant (in addition to `JOB_SEEKER`, already default);
`ADMIN` remains exclusively admin-bootstrap/admin-assigned, unchanged.

## 4. Plan Model

Re-confirmed against `platform-plan-registry.ts` (matches M2's matrix,
unchanged): `RECRUITER_FREE` — `recruiter.workspace`/`recruiter.jobs`
unlimited; `recruiter.candidates`/`recruiter.ranking` 25/month (shared
metric); `recruiter.analytics`/`recruiter.shortlist`/`recruiter.interview`/
`recruiter.export`/`recruiter.hiring_report` = NONE. `RECRUITER_PRO` raises
the shared metric to 200/month and unlocks analytics/shortlist/interview
(export capped at 50/month, hiring_report still NONE). `RECRUITER_BUSINESS`
unlocks everything unlimited. `RECRUITER` role + a `RECRUITER_*` plan
produces exactly these entitlements (`getEntitlement()` traced end to
end). `JOB_SEEKER`-only never produces a `RECRUITER_*` plan entry at all
(`resolveEffectivePlans()`'s `roles.map()`) — confirmed by an existing
test (`entitlement-service.test.ts:401-405`) asserting `RECRUITER_
CANDIDATES` usage resolves to `limit: 0` for a `JOB_SEEKER`-only user. No
pricing/quota numbers were changed.

## 5. Stripe Lifecycle

Traced `initiateCheckout()` → Stripe Checkout Session → `checkout.session.
completed` (writes only `platform_billing_customers`, the user↔customer
mapping) → `customer.subscription.{created,updated,deleted}` (all three
route through the identical `upsertFromStripeSubscription()` →
`upsertSubscription()`, writing `platform_subscriptions`).

**The exact scenario this milestone exists to test** (JOB_SEEKER → activate
RECRUITER → purchase RECRUITER plan → webhook → refresh → entitlements
available): with M3's activation gate in place (checkout only reachable
after activation, from either `/recruiter`'s own gate or `/settings/
billing`'s role-filtered plan cards) **and** this milestone's checkout-time
self-activation fix, `app_metadata.platform_roles` is guaranteed to include
`RECRUITER` no later than the moment `initiateCheckout()` returns — strictly
before the Stripe session is even created, let alone before the webhook
fires. There is no longer any reachable path where payment succeeds while
the role is absent.

## 6. Webhook Lifecycle

Verified directly (not just re-read):

- **Signature verification precedes parsing**: the route reads the raw
  body as text (`req.text()`, never `JSON.parse`d beforehand) and passes
  it straight into `stripe.webhooks.constructEventAsync()` — the parsed
  event object exists only after signature verification succeeds.
- **Idempotency**: `upsertSubscription()` upserts on `onConflict:
  "stripe_subscription_id"` — replaying the same event re-writes the same
  row, never duplicates. Covered by an existing test asserting exactly
  this.
- **Out-of-order protection**: `if (existing && existing.updated_at >=
  input.eventCreatedAt) return existing;` — `eventCreatedAt` is the
  Stripe **event's own** `created` timestamp (never wall-clock, never the
  subscription object's own timestamp), stored into `updated_at` itself so
  the next comparison uses Stripe's authoritative ordering. Four existing
  tests cover in-order, delayed/stale, exact-duplicate-timestamp, and
  first-ever-event cases.
- **Forged metadata protection**: `checkout.session.completed` resolves
  the target user by first checking for an existing customer↔user mapping
  under the given Stripe customer id and refuses to overwrite a different
  user's mapping; `customer.subscription.*` events resolve `userId` via
  `getUserIdByStripeCustomerId(stripeCustomerId)` — **never** from
  `metadata.userId` directly (metadata is only compared for a mismatch
  log). An existing test (`platform-billing-service.test.ts`, "a
  subscription event with FORGED metadata.userId is still written under
  the REAL user resolved from the Stripe customer mapping, never the
  forged one") proves this exactly.
- No dedicated Stripe `event.id` idempotency table exists — idempotency is
  achieved entirely through the `stripe_subscription_id` upsert, which is
  sufficient for the subscription-lifecycle events this webhook actually
  processes (no `invoice.*` events are handled at all — out of scope
  for entitlement correctness, since access is derived from subscription
  status, not invoice status).

No genuine defect found in webhook handling — this layer was already
correct and well-tested before this milestone.

## 7. Entitlement Resolution

`resolveEffectivePlans(userId)` iterates `roles.map(...)` over the
CURRENT `app_metadata.platform_roles` array only — a role absent from
that array can never produce a plan entry, regardless of what Stripe
subscription rows exist for the user. This is the single mechanism that
makes both the original M3 defect and this milestone's checkout-defect
possible, AND the same mechanism that makes role-removal correctly and
immediately revoke access (§9). There is exactly one place this logic
lives; no duplicate resolution path exists anywhere that could disagree
with it.

## 8. Quota Lifecycle

Unchanged, re-confirmed via M2's already-verified mapping: `RECRUITER_
CANDIDATES` (shared by candidate import/match/evaluate), `RECRUITER_
EXPORTS`. Usage is recorded only after success (`recordUsage()` calls
follow the operation, never precede it), consistent with the "record after
success only" rule. No quota logic was touched this milestone.

## 9. Upgrade / Downgrade / Cancellation

**Existing policy, documented, not changed:**

- **Upgrade within the same role family** (e.g. `RECRUITER_PRO` →
  `RECRUITER_BUSINESS`) does **not** go through a second `initiateCheckout()`
  call — `resolveStripeBackedPlan(userId, plan.role)` finds the existing
  paid subscription in that family and `initiateCheckout()` throws
  `DuplicateSubscriptionError` with a message directing the user to the
  Stripe Billing Portal (`createBillingPortalSession()`) instead. This is
  the existing, intentional design — not a bug, and not changed here.
- **Cancellation**: `customer.subscription.deleted` maps to `status:
  "canceled"` via the same `upsertFromStripeSubscription()` path.
  `isPaidAccessStatus()` treats only `active`/`trialing`/`past_due` as
  paid-access; `canceled` (along with `unpaid`/`incomplete`/`incomplete_
  expired`) is excluded, so `resolveEffectivePlans()` falls through to the
  role's FREE default immediately once Stripe reports `canceled`.
- **"Cancel at period end" is honored correctly**: while `cancel_at_
  period_end: true` but Stripe's own `status` is still `"active"`, access
  correctly continues (`isPaidAccessStatus("active")` is `true`) — Stripe
  itself is the source of truth for exactly when access should end, not a
  locally-computed date. No separate grace-period logic exists or is
  needed.
- **No stale paid plan remains indefinitely**: once Stripe transitions the
  subscription to `canceled`, the very next `resolveEffectivePlans()` call
  reflects it — no caching layer persists a stale paid state (request-
  scoped cache only, per CLAUDE.md).
- **`UpgradePrompt` appears correctly after entitlement loss**: since
  `getEntitlement()` recomputes from scratch every call and a canceled
  subscription no longer contributes a plan, any `recruiter.*`
  `requireFeature`/`requireQuota` check on the next request throws exactly
  as it would for a user who never subscribed, and the existing
  `readEntitlementError()`/`UpgradePrompt` pattern (M3, unchanged) renders
  correctly.

No new cancellation/upgrade policy was invented; the existing one was
traced and confirmed self-consistent.

**Genuine gap found, deliberately not auto-fixed (per this milestone's own
Part 4 instruction):** `removePlatformRole()` (admin removing RECRUITER)
does nothing to Stripe or `platform_subscriptions` — no cancellation, no
flag, no comment anywhere acknowledging it. Separately and independently
of that omission, access is still correctly and fully cut off the instant
the role is removed (§7's mechanism), so **this is not a security
defect** — a former recruiter cannot use recruiter features after
removal. It IS a real operational/billing gap: the user's card keeps
being charged by Stripe with zero system awareness that the corresponding
access was revoked. Recommended for product/ops follow-up (§21), not
fixed as code this milestone, per explicit instruction.

## 10. Multi-Role Behavior

Re-confirmed unchanged: `resolvePlatformRoles()` returns the full role
array (e.g. `["JOB_SEEKER", "RECRUITER"]`); `resolveEffectivePlans()`
produces one plan entry per role independently — `.map()`, not a
reducing/overwriting operation, so one role's plan can never overwrite
the other's. `getEntitlement()`/`checkQuota()` take the most permissive
result across all resolved plans for a given feature/metric, which only
matters when the SAME featureId appears in multiple role's plans (it
doesn't here — `resume.*`/`job.*`/`interview.*` vs `recruiter.*` are
disjoint sets). Billing (`/settings/billing`, M3, unchanged) renders both
plan cards deterministically; landing routing (`resolveDefaultLandingPath()`,
M3) deterministically prioritizes `RECRUITER` for the default destination
without hiding JOB_SEEKER tools (nav remains role-blind by design, M3
§8). No defect, no change.

## 11. Recruiter Feature Gate Sweep

Re-confirmed every LLM/cost-bearing recruiter operation still has its
entitlement check in place, unregressed by M3/this milestone's UI-only
and checkout-only changes: candidate import (`RECRUITER_CANDIDATES`
quota), matching (`RECRUITER_CANDIDATES`), evaluation (`RECRUITER_
CANDIDATES`), insights (`recruiter.analytics`), comparison
(`recruiter.analytics`), recommendation (`recruiter.analytics`), analytics
(`recruiter.analytics`), shortlist/status change (`recruiter.shortlist`),
export (`recruiter.export` + `RECRUITER_EXPORTS`). Per M2's already-
established, re-confirmed-here conclusion: ranking (GET, deterministic
re-sort of already-quota-checked data) and the interview study-plan
(deterministic sub-action of an already-gated session) correctly remain
ungated — **not regressed, no new quota was added or is warranted**, per
this milestone's own explicit instruction to preserve that conclusion.

## 12. Chat-Driven Recruiter Gates

Re-audited `resume.tool.ts`'s recruiter dispatch with specific attention
to compare/recommend (Phase 19's previously-fixed bypass point):
`requireFeature(recruiterId, "recruiter.analytics")` is called
immediately before `candidateService.compare()` and before
`candidateService.recommendTopCandidates()`, identical to and in the same
order as the dedicated `POST /api/ai/recruiter/compare` and `POST
/api/ai/recruiter/recommend` routes. **The Phase 19 fix is intact, no
regression.** `recruiterId` is provably session-derived end-to-end:
`recruiterRequestContext` is seeded in `chat/route.ts` from the
server-resolved `authUser?.id` only — the client-supplied `recruiterMode`
boolean can toggle whether the recruiter branch activates, but cannot
supply or override `recruiterId`. Every other recruiter-reachable chat
action (list/search/ready-for-interview) is a deterministic, ungated
operation with an equally-ungated REST sibling — consistent, not a
bypass. Matching/evaluation/insights/export/shortlist are not reachable
via chat at all (no code path calls those service functions from
`resume.tool.ts`), so their REST-side gates cannot be circumvented
through chat by construction.

One out-of-scope observation, not a chat-specific bypass and not touched:
the separate, legacy "Recruitment Pipeline" chat branch
(`recruitmentMode`, distinct from `recruiterMode`) calls an ungated
service function, but its dedicated REST sibling is equally ungated —
consistent with that subsystem's already-documented, multiply-audited
"intentionally unauthenticated" design (CLAUDE.md), not a new finding and
explicitly out of this milestone's `/api/ai/recruiter/*` scope.

## 13. Billing UX

Unchanged from M3, re-confirmed still correct: `/settings/billing` shows
current plan, enabled features, usage/quota with reset descriptions,
upgrade (plan comparison filtered to the user's actual roles), and
"Manage Subscription" (Stripe Billing Portal) — all sourced from the real
`getBillingOverview()` response, nothing fabricated. Organization billing
is never presented as required for a recruiter — `/billing`'s own
"Create an organization first" empty state (M3) is unrelated to and never
blocks `/settings/billing`.

## 14. Security / IDOR Validation

Live-probed against the running dev server, unauthenticated:

```
GET  /recruiter                          -> 307 -> /login?redirect=/recruiter
GET  /admin                              -> 307 -> /admin/login
GET  /api/admin/platform/users           -> 401 {"error":"You must be signed in to access this."}
GET  /api/ai/recruiter/jobs              -> 401 {"error":"You must be signed in to use the Recruiter Workspace."}
POST /api/billing/platform/checkout      -> 401 {"error":"You must be signed in to access this."}  (body: {"planKey":"RECRUITER_PRO"} — ignored, identity still resolved server-side first)
GET  /api/billing/platform/overview      -> 401 {"error":"You must be signed in to access this."}
GET  /settings/billing                   -> 307 -> /login?redirect=/settings/organization
POST /api/persona/recruiter/activate     -> 401
```

All consistent with pre-milestone behavior. Confirmed the checkout route
resolves identity via `requireUserId()` BEFORE `initiateCheckout()` (and
therefore before this milestone's new `activateRecruiterPersona()` call)
ever runs — an unauthenticated `planKey` body is never reached. Recruiter
ownership (`requireRecord()`/`getJob()`), admin authorization
(`requirePlatformAdmin()`), and IDOR protections are all byte-for-byte
unchanged from M1-M3 — this milestone touched zero ownership-filter code.

## 15. Genuine Defects

1. **Checkout could pay for a role the caller didn't hold, permanently
   ignored by entitlement resolution.** Fixed (§16).
2. **Role removal orphans the Stripe subscription** (billing/operational
   gap, not a security defect — access is correctly denied). Documented,
   not fixed, per explicit instruction (§9, §21).

No IDOR, no forgeable webhook identity, no chat-entitlement bypass, no
indefinite-access-after-cancellation, and no non-recruiter-receives-
recruiter-access defect was found anywhere in the audited surface.

## 16. Fixes Implemented

`src/lib/billing/platform-billing-service.ts`: `initiateCheckout()` now
calls `activateRecruiterPersona(input.userId)` when `plan.role ===
"RECRUITER"`, before the duplicate-subscription check and before
creating the Stripe checkout session. Reuses M3's existing, already-
tested function — no new entitlement/billing/role-grant mechanism was
introduced. No database schema change. No organization dependency
introduced. No existing authorization weakened (identity resolution in
the calling route is unchanged; this only adds a role grant, never a role
check bypass).

## 17. Tests

Added to `src/lib/billing/platform-billing-service.test.ts`:
- Mocked `./persona-service` (previously unmocked in this file — now
  required since the fix imports `activateRecruiterPersona`), following
  this repo's established real-dependency-mocking convention.
- 4 new tests: activates RECRUITER before creating a Stripe checkout
  session for a RECRUITER plan; does NOT call activation for a JOB_SEEKER
  plan; succeeds idempotently for a caller who already holds RECRUITER;
  still rejects an unrecognized plan before ever attempting activation.

No tests were manufactured for areas confirmed already-correct and
unchanged (webhook idempotency/ordering — already covered by 8 existing
tests; chat entitlement — already covered by existing route/tool
coverage; role removal — deliberately undocumented in tests since no code
changed there, matching "document, don't fix").

## 18. Build / Lint / Type Validation

```
npx tsc --noEmit    -> clean, zero errors
npm run lint         -> 1 pre-existing warning (unrelated: <img> in blog/[slug]), 0 errors
npm test              -> 103 files, 1235/1235 tests passing (4 new)
npm run build         -> exit 0, all routes compiled
```

## 19. Live Validation

See §14 for the full unauthenticated security probe set (all consistent
with pre-milestone behavior). Additionally confirmed via a direct,
read-only Supabase query (service-role, `select("*").limit(1)` per this
project's own established verification methodology) that **all 16
Supabase migrations are now applied** — `platform_subscriptions`,
`platform_billing_customers`, `platform_usage_events`, `platform_
entitlement_overrides`, `organizations`, `organization_members`,
`recruiter_jobs`, `recruiter_candidates`, `auth_sessions`, `password_
history`, and `resume_versions` all exist live. This is a change from
Phase 22's audited state (14/16 unapplied) — the user has since executed
the migration runbook provided in an earlier session. The database layer
is no longer a blocker for future authenticated E2E validation.

**Authenticated browser E2E (real login session) and live Stripe checkout
were NOT attempted** — this audit session has no real user session/cookie
and no Stripe test-mode credentials configured in `.env.local` (confirmed
by direct grep — zero `STRIPE_*`/`PLATFORM_STRIPE_*` keys present). No
live mutation was made against the production-connected Supabase project
(no test user was created or modified) — doing so without explicit
authorization would be an unreviewed, live write against a real system,
which this audit deliberately avoided.

```
STRIPE LIVE E2E: BLOCKED
Reason: no Stripe credentials configured in this environment.

AUTHENTICATED BROWSER E2E: BLOCKED
Reason: no real user session available to this audit tool; a live
Supabase-mutating test was deliberately not performed without explicit
authorization.
```

Source-level lifecycle audit, the full unit/integration suite (including
the existing signed-webhook, forged-metadata, duplicate-webhook, and
out-of-order-webhook tests), and unauthenticated live probes were all
performed in full — nothing here was fabricated.

## 20. Operational Blockers

- Stripe credentials (secret key, platform webhook endpoint secret, 4
  price IDs) still need configuring outside this repo's tooling before any
  real checkout/webhook can be exercised — unchanged prerequisite from
  Phase 20/21/22.
- Database migrations: **no longer a blocker** — all 16 are now applied
  (§19), a genuine improvement in live-testability since Phase 22.

## 21. Product Recommendations

One item for product/ops awareness, not a code defect (§9, §15.2): when
an admin removes a user's RECRUITER role, the underlying Stripe
subscription is left running unaddressed. Recommend the admin role-removal
UI/flow eventually prompt or automate a subscription cancellation (or at
minimum surface a warning) when removing a role that has an active paid
subscription behind it — a deliberate, scoped follow-up if the product
wants it, not inferred as required here.

## Final Classification

**Phase 23 may be considered CODE-COMPLETE for the recruiter activation,
billing, and entitlement lifecycle.** The one genuine defect found
(checkout could outrun role activation) is fixed and regression-tested.
The one real gap found (orphaned billing on role removal) is a
documented, non-security operational recommendation, deliberately left
unfixed per this milestone's own instruction. No architecture was
redesigned, no new billing system or entitlement engine was introduced, no
`organization_id` was added to any recruiter table, no migration was
added, and no existing security was weakened. Nothing in this milestone
has been committed.
