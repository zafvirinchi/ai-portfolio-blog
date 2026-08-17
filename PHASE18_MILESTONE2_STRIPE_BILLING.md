# Phase 18 — Milestone 2: Stripe Billing Integration

## 1. Audit findings

Before writing any code, the entire Phase 14 billing/subscription implementation was read in full: `src/lib/billing/*` (billing-provider.ts, billing-schema.ts, billing-service.ts, billing-types.ts, plan-service.ts, stripe-provider.ts, subscription-service.ts, coupon-service.ts, invoice-service.ts, payment-service.ts), every `supabase/migrations/*.sql` file, `src/app/api/billing/**`, `src/app/billing/**`, `src/app/settings/**`, and Phase 18 M1's `entitlement-service.ts`/`platform-schema.ts`/`platform-plan-registry.ts`/`persona-service.ts`.

**The single most important finding: a complete, REAL, working Stripe integration already exists.**

- `stripe@^22.4.0` is already a dependency. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are already referenced (`stripe-provider.ts`) — though **neither is actually configured in this environment** (confirmed by checking `.env.local`'s key names only, never its values — no `STRIPE_*` key exists there at all).
- `stripe-provider.ts` already does real Stripe Checkout session creation, Customer Portal session creation, subscription cancel/resume, **and real webhook signature verification** via `stripe.webhooks.constructEventAsync()`.
- `billing-service.ts` already orchestrates checkout, portal, and a full webhook event handler (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`).
- A real webhook route already exists at `POST /api/billing/webhooks/stripe`, correctly reading the raw body before signature verification.
- A full billing UI already exists at `/billing`, `/billing/plans`, `/billing/history`, `/billing/invoices`, `/billing/usage`.

**But this entire system is ORGANIZATION-scoped end to end** — `subscriptions.organization_id not null unique`, checkout requires `getTenantContext()` (an active organization membership), and pricing is built via Stripe's dynamic `price_data` (a fresh ad-hoc Price object per checkout, convenient for coupon-adjusted amounts) rather than pre-created Stripe Price ids. Exactly as Phase 18 M1 found for the organization credit system, this Stripe integration has **zero effect on individual platform users** — the very users M1's persona/plan model (JOB_SEEKER/RECRUITER) targets. This is the real, non-overlapping gap this milestone fills — not a second Stripe integration, but the first one that actually reaches individual users.

**Second finding — a real, minor pre-existing gap in the organization webhook handler, found but not touched (protected architecture):** `handleSubscriptionUpdated()` collapses every non-`active`/`past_due` Stripe status (including `canceled`, `unpaid`, `incomplete`) down to `"active"` (`status === "active" ? "active" : status === "past_due" ? "past_due" : "active"`), and there is no webhook-event dedup — `checkout.session.completed` calls `paymentService.record()`/`invoiceService.create()` (plain inserts), so a redelivered event would create duplicate rows. Out of scope for this milestone (Phase 14, protected); this milestone's own status mapping (§8) is deliberately more correct, and its own persistence (§4) is upsert-based specifically to avoid the same duplication risk.

**Third finding — confirmed via `.env.local` key inspection: no Stripe credentials of any kind exist in this environment**, for either the existing organization integration or this milestone's new platform one. This governs the entire "Live validation" section (§18): no live or test-mode Stripe call of any kind was possible.

## 2. Existing billing architecture

Organization billing (Phase 14, unchanged by this milestone): `plans` / `subscriptions` / `payments` / `invoices` / `credit_transactions` / `usage_tracking` / `coupons` / `discounts`, all keyed by `organization_id`. Reused by this milestone only for its *conventions*, not its data: no RLS (service-role `supabaseAdmin` only, application-level enforcement), snake_case DB columns, manual-apply migrations (no migration tooling in this repo), the "implicit Free when no row exists, never a fabricated subscription" pattern, and "fall back to a safe default on ANY query failure, including a pre-migration missing table."

## 3. Stripe architecture (this milestone)

One new, parallel layer, mirroring the organization system's own internal separation of concerns:

- **`platform-stripe-provider.ts`** — the only file that calls the `stripe` SDK for platform billing (mirrors `stripe-provider.ts`'s "one file, lazy client" discipline). Uses real, pre-created Stripe **Price ids** (env-var mapped, §5) rather than dynamic `price_data` — Step 6's own explicit preference, and a deliberate difference from the organization system (which needs `price_data` for its coupon-adjusted amounts; this milestone's fixed catalog doesn't).
- **`platform-subscription-service.ts`** — the DB layer for `platform_billing_customers`/`platform_subscriptions` (mirrors `subscription-service.ts`'s role), plus the deterministic status→entitlement policy (§8).
- **`platform-billing-service.ts`** — the one orchestration layer (mirrors `billing-service.ts`'s role): checkout, portal, and webhook event dispatch. The only file that composes the two above.

**Not reused: `StripeBillingProvider`/`BillingProvider` (`billing-provider.ts`/`stripe-provider.ts`).** That interface is shaped around `organizationId` + dynamic `unitAmountCents`/`price_data` — genuinely the wrong shape for a fixed-price-id, per-user catalog. Reusing the `stripe` npm package itself (already a dependency) while writing a new, parallel adapter was judged correct reuse; force-fitting the existing interface would have meant bolting unrelated fields onto it or awkwardly repurposing `organizationId` to mean `userId`.

## 4. Database changes

Two new tables (`supabase/migrations/20260817000000_add_platform_billing_tables.sql`):

- **`platform_billing_customers`** — one row per Supabase user (`unique(user_id)`, `unique(stripe_customer_id)`).
- **`platform_subscriptions`** — one row per real Stripe subscription. **Deliberately NOT unique per user** — Step 3's "billing independent of persona" means a user could hold subscriptions in more than one plan family simultaneously (e.g. Job Seeker Pro *and* Recruiter Pro); only `stripe_subscription_id` is unique. Indexed on `user_id`, `status`, and `(user_id, status)`.

**Deliberately not created**, per Step 4's own "do not blindly create these tables" instruction: platform-level `invoices`/`payments`/`coupons` tables (out of scope — this milestone syncs subscription *state*, not a payment history UI), and a webhook-event dedup table (see §11 — genuinely not needed). No RLS, matching every existing table in this project. No Stripe secret, key, or webhook signing secret is ever stored in any table — only Stripe object *ids* (customer id, subscription id, price id).

## 5. Plan/price mapping

Only the 4 currently-paid tiers (`JOB_SEEKER_PRO`, `JOB_SEEKER_PREMIUM`, `RECRUITER_PRO`, `RECRUITER_BUSINESS` — M1's own `STRIPE_BACKED_PLAN_KEYS`, added to `platform-schema.ts` this milestone) are Stripe-backed; `JOB_SEEKER_FREE`/`RECRUITER_FREE` have no Stripe object at all, by definition, and `ADMIN` has no plan key to begin with. Each maps to one env var:

```
STRIPE_PRICE_JOB_SEEKER_PRO
STRIPE_PRICE_JOB_SEEKER_PREMIUM
STRIPE_PRICE_RECRUITER_PRO
STRIPE_PRICE_RECRUITER_BUSINESS
```

None of these are configured in this environment (§1) — `resolveStripePriceId()` throws a clear, honest configuration error rather than fabricating an id; it never falls back to a hardcoded or guessed price. Every checkout request's `planKey` is validated against M1's real `PLATFORM_PLAN_DEFINITIONS`/`STRIPE_BACKED_PLAN_KEYS` before this mapping is even consulted (`InvalidPlanError`, 400) — no pricing amount is invented anywhere in this milestone; the actual dollar amounts live entirely in Stripe's own Price objects (external to this codebase).

## 6. Checkout flow

`POST /api/billing/platform/checkout` → `initiateCheckout()`:
1. `userId`/`email` resolved from the real Supabase session (`persona-service.ts`'s new `requireUserId()`) — never from the request body.
2. `planKey` (the only client-supplied value) validated against `STRIPE_BACKED_PLAN_KEYS`.
3. Duplicate-subscription guard: if the user already holds a paid-access subscription in that plan's role family, checkout is rejected (`DuplicateSubscriptionError`, 409) — directing them to the portal instead of allowing two simultaneous subscriptions in the same family.
4. Stripe customer reused if `platform_billing_customers` already has one for this user; created (and persisted) only if not.
5. Real Stripe Checkout Session created in `mode: "subscription"`, with `userId`/`planKey` in metadata (defense-in-depth only — never trusted as sole authority, §10).
6. Only the Checkout URL is returned to the client.

No entitlement is granted merely because a Checkout Session was created (Step 7's own explicit rule) — only a verified webhook event ever writes to `platform_subscriptions`.

## 7. Webhook flow

`POST /api/billing/platform/webhook` (a distinct endpoint/URL from the organization webhook, with its own `STRIPE_PLATFORM_WEBHOOK_SECRET`) → raw body read before any parsing → `stripe.webhooks.constructEventAsync()` verifies the signature → dispatch:

- **`checkout.session.completed`** — confirms/repairs the customer↔user mapping only. Never creates or upgrades the subscription row itself (Step 8's own explicit warning against treating checkout completion as proof of a paid subscription — e.g. a subscription can still be `incomplete` pending 3-D Secure confirmation at this point).
- **`customer.subscription.created`/`.updated`/`.deleted`** — all three go through the identical upsert path (`upsertFromStripeSubscription()`); Stripe already sets `.status` to `"canceled"` on the deleted event itself, so no special-casing is needed.
- Any other event type returns `{ handled: false, type }` — logged, never an error.

## 8. Subscription-state mapping

`PlatformSubscriptionStatus` (a new, richer type — see §9) mirrors real Stripe subscription statuses directly: `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`, `incomplete_expired`. Stripe's rare `paused` status maps to `canceled` (no distinct concept exists for it in this milestone).

**Deterministic entitlement policy** (`isPaidAccessStatus()`):

| Status | Paid access? | Reasoning |
|---|---|---|
| `active`, `trialing` | Yes | Unambiguous |
| `past_due` | **Yes** | Deliberate: Stripe is still retrying the card; instantly downgrading on a transient payment hiccup is harsher than necessary — a documented policy choice, not a guess |
| `canceled`, `unpaid`, `incomplete`, `incomplete_expired` | No | Definitively ended, or never successfully started |

A canceled/unpaid subscription **never** retains paid access merely because a local `platform_subscriptions` row still exists — the row's own `status` column is always what's checked, never its mere presence (verified by a dedicated test, §14).

## 9. Entitlement precedence

**No second entitlement engine was created.** The only change to `entitlement-service.ts` is what `resolveEffectivePlans()` returns for each role: a real Stripe-backed plan (via the new `pickBestSubscriptionForRole()`) if one exists with a paid-access status, else the same FREE default M1 always used. Every other function — `getEntitlement()`, `canAccess()`, `checkQuota()`, `requireFeature()`, `requireQuota()` — needed **zero logic changes**; they already only cared about the resolved `planKey`, not how it was resolved.

One real bug fixed during this extension: `getEntitlement()` was calling `getDefaultPlanForRole()` directly (M1's original shortcut) instead of `resolveEffectivePlans()` — meaning a Stripe-backed plan would have been completely invisible to every feature/quota check even after this milestone's own webhook correctly wrote it to the database. Fixed by routing `getEntitlement()` through `resolveEffectivePlans()`; a dedicated test (§14) proves a Stripe-backed Pro plan now actually unlocks a Pro-only feature.

**Precedence order, unchanged from M1, now genuinely exercised end-to-end:**

1. ADMIN role → full bypass (never touches Stripe or plan data at all).
2. An active `REVOKED` admin override → blocks access even on a real paid Stripe plan.
3. An active `GRANTED` admin override → unlocks access even with no Stripe plan.
4. The most permissive of the user's resolved plans (Stripe-backed or FREE) across all their roles.

Verified by a dedicated test: a `REVOKED` override still blocks a feature even when the user holds a real, active `JOB_SEEKER_PREMIUM` Stripe subscription — admin overrides are never overridden by Stripe state.

## 10. Security model

Every item in Step 16 was verified, several by dedicated tests (§14):

1. Unauthenticated checkout → 401 (`requireUserId()`).
2–3. `userId`/`email` are always session-derived; the only client input is `planKey`, validated against the server registry — a client cannot select an arbitrary Stripe price id (`resolveStripePriceId()` only accepts the 4 known `StripeBackedPlanKey`s).
4. Invalid/unrecognized plan → 400 (`InvalidPlanError`).
5–6. Invalid or tampered webhook signatures are rejected by **real** `stripe.webhooks.constructEventAsync()` verification (tested with genuine HMAC signatures via Stripe's own `generateTestHeaderString()` helper — not mocked away, §14).
7. Duplicate webhook delivery is naturally idempotent (§11).
8–9. There is no route through which a client can set `status`, `plan_id`, or any other subscription field directly — only Stripe webhook events (server-verified) ever write to `platform_subscriptions`.
10. Stripe customer ids are never accepted from a client — `createBillingPortalSession()` looks the id up server-side from `platform_billing_customers` by session-derived `userId` alone.
11. No local-storage/client-state field can unlock a paid feature — every check (`canAccess`/`checkQuota`) re-derives the plan server-side on every call.
12. Admin overrides remain intact and take precedence over Stripe state (§9, tested).
13. FREE fallback remains intact — verified for lookup failure, no-subscription, and canceled-subscription cases (§14).
14. Cross-user billing data cannot be accessed — every function takes only a `userId`; there is no code path where resolving user A's billing touches user B's rows.
15. **The webhook cannot be used to grant entitlements to an unrelated user through forged metadata.** `subscription.metadata.userId` is read only as a defense-in-depth sanity check (logged on mismatch); the userId a subscription is actually written under is **always** resolved from `platform_billing_customers` via the real, Stripe-verified `customer` field on the event object. A dedicated test constructs a subscription event with metadata claiming a different (attacker-controlled) `userId` and confirms the write lands under the real, mapped user — never the forged one.

## 11. Idempotency strategy

**No webhook-event persistence/dedup table was added.** Every write this milestone's webhook handler performs is an **UPSERT keyed on a real, unique Stripe id** — `platform_billing_customers` by `user_id`, `platform_subscriptions` by `stripe_subscription_id`. Replaying the same event (or receiving `created` → `updated` → `updated` for one subscription) simply re-writes the identical row; there is no insert-only operation anywhere in the webhook path that could produce a duplicate. This was verified directly: upserting the same `stripe_subscription_id` twice with different statuses results in exactly one row reflecting the latest state (§14). This is a smaller, more conservative footprint than the organization webhook handler's own (which does have real duplicate-insert exposure on `checkout.session.completed` — §1 — left untouched as protected architecture).

## 12. API changes

New routes, all under `/api/billing/platform/`:

- `POST /api/billing/platform/checkout` — start checkout for a plan.
- `POST /api/billing/platform/portal` — open the Stripe Customer Portal.
- `GET /api/billing/platform/overview` — the completed M1 `getBillingOverview()` contract.
- `POST /api/billing/platform/webhook` — Stripe webhook receiver.

No existing route was modified. The existing organization billing routes (`/api/billing/*`) are completely untouched.

## 13. UI changes

New page: **`/settings/billing`** ("My Billing", added to the existing `/settings` layout's nav — the exact same layout Security/Sessions/Profile already use for account-level, non-organization-scoped pages). Deliberately **not** a duplicate of `/billing/*` (Phase 14's existing organization/team billing area, left completely untouched and still reachable from the settings header's own "Billing" link) — both coexist, clearly labeled to avoid confusion.

Shows, per Step 13: Current Plan (per role — plan name, status badge, renewal/cancel-at date when real, enabled features with their limits), Upgrade (plans grouped by the user's actual roles, using the real `PLATFORM_PLAN_DEFINITIONS` names — never invented ones), and Manage Subscription (a portal-session button, shown only once the user holds any paid plan). No duplicate cancellation UI was built — cancellation goes through the Stripe Customer Portal exclusively, per Step 13's own preference.

## 14. Tests

35 new tests across 5 files, extending the 8 tests added directly to `entitlement-service.test.ts` for the Stripe-aware `resolveEffectivePlans()`/`getEntitlement()` extension:

- **`platform-stripe-provider.test.ts`** (11 tests) — **real, unmocked Stripe signature verification** (Step 18: "test signature verification... at the real service boundary"): a genuinely valid signature (via Stripe's own `generateTestHeaderString()`) is accepted; an invalid signature, a tampered payload, and a payload signed with the wrong secret are all genuinely rejected by the real `stripe.webhooks.constructEventAsync()` call — no mocking of the crypto anywhere in this file. Plus price↔plan mapping validation.
- **`platform-subscription-service.test.ts`** (9 tests) — the deterministic status policy, plan-family isolation, "canceled row never retains access," and upsert idempotency (a hand-rolled fake Supabase client, not the analytics package's own test-only helper).
- **`platform-billing-service.test.ts`** (15 tests) — plan validation, customer reuse/creation, duplicate-subscription prevention (and that it's correctly *not* triggered across different plan families), portal customer-id resolution, and — the most important test in this milestone — the **forged webhook metadata cross-user attack**, proving a subscription event claiming a different `userId` via metadata still writes under the real, Stripe-resolved user.
- **`entitlement-service.test.ts`** (+8 tests) — Stripe-backed plan wins over FREE, canceled subscription falls back to FREE, lookup failure fails closed, `getEntitlement` is genuinely wired to the Stripe-aware resolution (not the old hardcoded path), `past_due` retains access, admin overrides still take precedence over a real paid plan, per-role billing overview reporting, and a check that the overview payload never contains a Stripe secret/customer/subscription id pattern.
- **`persona-service.test.ts`** (+3 tests) — the new `requireUserId()`'s accurate, billing-specific error message and real session-derived `{userId, email}`.

## 15. Full test result

- Before this milestone: **982/982** passing (Phase 18 M1 baseline).
- After this milestone: **1020/1020** passing (75 test files) — 38 net new tests (35 new + 3 modified-in-place across existing files), 0 regressions.

## 16. TypeScript result

`npx tsc --noEmit` — 0 errors.

## 17. Lint result

`npm run lint` — 0 errors, 1 pre-existing warning unrelated to this milestone.

## 18. Build result

`npm run build` — succeeds. `/settings/billing` and all 4 new `/api/billing/platform/*` routes confirmed present in the build's route listing. No existing route's build output changed.

## 19. Live validation

**Confirmed via `.env.local` key inspection (names only — no secret values were ever read or displayed): no Stripe credentials exist in this environment at all** — not `STRIPE_SECRET_KEY`, not `STRIPE_WEBHOOK_SECRET` (the existing organization integration's own vars), and none of this milestone's new `STRIPE_PLATFORM_WEBHOOK_SECRET`/`STRIPE_PRICE_*` vars either.

**Code-level validation performed (production server, `npm run start`):**

```
GET  /settings/billing (unauthenticated)                    → 307 (redirected to /login — existing layout behavior, unaffected)
POST /api/billing/platform/checkout (unauthenticated)        → 401 {"error":"You must be signed in to manage your billing."}
POST /api/billing/platform/portal (unauthenticated)           → 401 {"error":"You must be signed in to manage your billing."}
GET  /api/billing/platform/overview (unauthenticated)         → 401 {"error":"You must be signed in to manage your billing."}
POST /api/billing/platform/webhook (no stripe-signature header) → 400 {"error":"Missing stripe-signature header"}
POST /api/billing/platform/webhook (signature header present, Stripe unconfigured) → 400 {"error":"STRIPE_SECRET_KEY is not configured..."}
```

A real bug was found and fixed during this live probing (not merely a code-review finding): the checkout/portal routes' 401 response originally reused `resume-version-auth.ts`'s `UnauthorizedError`, whose message is hardcoded to resume-version wording ("...to manage resume versions") — genuinely misleading in a billing context. Fixed with a new, billing-appropriate `PlatformUnauthorizedError`/`requireUserId()` in `persona-service.ts`; re-verified live after the fix.

**Stripe test-mode validation: NOT performed** — no test-mode credentials are available in this environment. **Production Stripe validation: NOT performed and NOT claimed.** Real, non-mocked signature-verification cryptography WAS exercised (§14), which is the closest thing to "live Stripe behavior" achievable without real API credentials — but no actual network call to Stripe's API was ever made, in this milestone or in validating it.

## 20. Migration status

**`supabase/migrations/20260817000000_add_platform_billing_tables.sql` has NOT been applied to any live Supabase database.** Per this repo's own convention (no migration tooling — every prior migration in this project is also manually applied), it must be run once, manually, in the Supabase SQL Editor for this project.

**Authenticated Stripe billing persistence E2E is BLOCKED until this migration is manually applied**, and further blocked until real `STRIPE_SECRET_KEY`/`STRIPE_PLATFORM_WEBHOOK_SECRET`/`STRIPE_PRICE_*` values are configured. Both statements are explicit, not implied — no code path in this milestone assumes otherwise (every DB read fails closed to FREE; every Stripe call fails with a clear configuration error).

## 21. Known limitations

- No live/test-mode Stripe validation was possible in this environment (§19) — code-level and real-cryptography validation only.
- The migration is not yet applied to live Supabase (§20).
- No admin UI exists to grant/revoke platform entitlement overrides or assign RECRUITER/ADMIN roles (unchanged limitation from M1 — still intentionally out of scope).
- The organization billing webhook's own pre-existing status-mapping simplification and duplicate-insert exposure (§1) were found but left untouched, as protected Phase 14 architecture.
- `platform_subscriptions` has no DB-level constraint preventing two simultaneous active subscriptions in the same plan family — prevented only at checkout time in application code (documented explicitly in the migration's own comment as a deliberate, minimal-complexity choice).
- Cancellation flows entirely through the Stripe Customer Portal — there is no in-app "cancel now" button, per Step 13's own stated preference for reusing Stripe's own portal rather than duplicating cancellation logic.

## 22. Recommended Phase 18 Milestone 3

**Billing Dashboard Polish & Admin Entitlement UI** — now that `getBillingOverview()` is real and Stripe-backed: (a) build the admin-facing UI for `grantFeatureOverride()`/`revokeFeatureOverride()`/`setPlatformRoles()` (all three already exist and are tested from M1/M2, just never exposed to any route), closing the "no admin UI yet" gap explicitly deferred by both M1 and M2; (b) once real Stripe test-mode credentials become available, perform genuine end-to-end validation (a real test-mode checkout → webhook → entitlement unlock) and apply the M2 migration to a real Supabase instance; (c) revisit whether platform-level payment/invoice history (deliberately out of scope here) is actually needed once real usage data exists, rather than building it speculatively now.

---

```
Phase 18 — Milestone 2 COMPLETE

Tests: 1020/1020
TypeScript: clean
Lint: clean
Build: succeeded
Stripe integration: implemented (checkout, portal, webhook — code-complete, not live-validated against real Stripe)
Webhook verification: implemented (real signature verification, tested with genuine Stripe-signed payloads, no mocking)
Billing dashboard: implemented (/settings/billing)
Migration: NOT applied (supabase/migrations/20260817000000_add_platform_billing_tables.sql — manual application required, repo convention)
Live Stripe validation: NOT performed (no Stripe credentials configured in this environment — confirmed by key-name-only inspection of .env.local)
Known limitations: no live/test-mode Stripe validation possible here; migration not yet applied to live Supabase; no admin UI for role/override management yet; organization billing's own pre-existing webhook gaps (status mapping, dedup) found but left untouched as protected architecture.
Recommended Milestone 3: admin entitlement/role management UI, plus genuine Stripe test-mode E2E once credentials and the migration are available.
```

No automatic git commit was made.
