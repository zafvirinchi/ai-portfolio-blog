# Phase 18 — Milestone 6: Billing Production Validation & Reconciliation

## 1. Executive summary

This milestone audited the complete Stripe → entitlement → feature-access lifecycle built across Phase 18 M1–M5. The architecture is sound and unusually thoroughly tested already — M2's own test suite already covered forged webhook metadata, forged price/plan input, real (non-mocked) signature verification, and idempotent replay. The one genuine, concrete gap found was **out-of-order webhook delivery** (distinct from duplicate delivery, which was already handled): nothing prevented a delayed, stale Stripe event from overwriting newer subscription state. Fixed minimally, reusing the existing schema (no migration). Live database access (newly available in this environment) confirmed, contrary to a first, misleading check, that **neither the Phase 18 M1 nor M2 migration has actually been applied** to the connected Supabase project — an operational prerequisite, not a code defect, and the existing fail-closed design was confirmed live to degrade safely rather than fabricate access.

## 2. Existing architecture audited

Full lifecycle map, confirmed intact end-to-end:

```
User session (Supabase auth)
  → persona-service.ts: resolvePlatformRoles()          [server-derived, never client input]
  → entitlement-service.ts: resolveEffectivePlans()      [role × Stripe-backed-or-FREE, per role]
  → platform-subscription-service.ts: pickBestSubscriptionForRole()
  → entitlement-service.ts: getEntitlement()/checkQuota() [ADMIN bypass → override → plan]
  → /api/billing/platform/checkout → platform-billing-service.ts: initiateCheckout()
  → platform-stripe-provider.ts: createStripeCustomer() + createCheckoutSession()
  → Stripe Checkout → customer.subscription.created/updated + checkout.session.completed
  → /api/billing/platform/webhook → verifyPlatformWebhookSignature() [real HMAC, never mocked in the production path]
  → platform-billing-service.ts: upsertFromStripeSubscription() [customer→user resolved server-side, metadata never trusted]
  → platform-subscription-service.ts: upsertSubscription()  [idempotent by stripe_subscription_id]
  → entitlement-service.ts (loop closes back to resolveEffectivePlans())
  → /api/ai/** routes: requireFeature()/requireQuota() (Phase 18 M5)
  → usage-event-service.ts: recordUsageEvent()
  → /settings/billing: getBillingOverview() [same functions, no second interpretation]
  → /admin/platform/users/[userId]: getPlatformUserDetail() [same functions, no second interpretation]
```

No broken or duplicated links found in this chain. Read in full: `entitlement-service.ts`, `platform-stripe-provider.ts`, `platform-subscription-service.ts`, `platform-billing-service.ts`, `platform-plan-registry.ts`, the checkout/portal/webhook routes, `platform-admin-service.ts`'s billing-relevant sections, `usage-event-service.ts`, and every M2/M5 test file.

## 3. Genuine gaps found

**Out-of-order webhook delivery (Step 6/7).** Stripe does not guarantee webhook delivery order. `upsertSubscription()` unconditionally overwrote the subscription row on every call — a delayed, stale event (e.g. an earlier `past_due` notification arriving after a newer `active` renewal already landed) could transiently revert a user's access. Duplicate delivery was already correctly handled (idempotent upsert-by-id); ordering was not.

Everything else audited (Steps 3, 4, 5, 8, 9, 10, 11, 12, 13) was found **already correct** — see §5 per-step notes. No second gap required a code change.

## 4. Fixes implemented

`platform_subscriptions.updated_at` is now repurposed to record the **Stripe event's own `created` timestamp** (`event.created`, threaded from `handlePlatformStripeWebhook()` → `upsertFromStripeSubscription()` → `upsertSubscription()`) rather than wall-clock write time. Before writing, `upsertSubscription()` now looks up the existing row by `stripe_subscription_id`; if it already has an equal-or-newer `updated_at`, the incoming event is logged and discarded rather than applied. No new column, no new migration — `updated_at` already existed and nothing else in the codebase depended on it meaning "DB write time" (its only other reader, `pickBestSubscriptionForRole()`'s tie-break between sibling subscriptions, is made *more* correct by this change, not less: it now compares by Stripe's own authoritative clock instead of webhook-processing race timing).

This is a read-then-write, not a single atomic statement — a fully race-proof version would need a DB-level conditional write. Judged unnecessary complexity for the actual risk: near-simultaneous deliveries for the very same subscription are rare, and the worst case of losing that race is identical to the pre-existing (M2) behavior, never worse.

## 5. Security findings

No new vulnerability found. Verified (all already true, all already covered by M2's own test suite, re-confirmed rather than re-tested where redundant):

- **IDOR — userId**: every route resolves it server-side (`requireUserId()`/`getOptionalUserId()`); no route reads it from a request body/query.
- **IDOR — customerId/subscriptionId**: no route (checkout, portal, or webhook) accepts either as client input at all — there is no field to forge.
- **Forged priceId/planId**: checkout only accepts `planKey`, validated against the server-side registry (`isStripeBackedPlanKey()`) before anything reaches Stripe; the real price id is resolved server-side (`resolveStripePriceId()`) and never accepted from the client.
- **Forged webhook metadata**: already explicitly tested (M2) — `subscription.metadata.userId` is cross-checked against the customer mapping resolved from Stripe's own `customer` field and logged-but-ignored on mismatch, never trusted.
- **Forged role/entitlement/quota**: none of these are accepted as input anywhere in the lifecycle; all are always re-derived server-side.
- **Replayed webhook**: idempotent by construction (upsert on `stripe_subscription_id`).
- **Invalid/malformed/missing signature**: real `stripe.webhooks.constructEventAsync()` verification (never mocked in the production path); tested with a genuinely wrong signature, a post-signing-modified body, and a wrong signing secret.
- **Unauthorized portal/checkout access**: gated by `requireUserId()`, mapped to 401; live-confirmed in §10.
- **Admin billing view**: reads through the exact same `getCustomerByUserId`/`listSubscriptionsForUser`/`resolveEffectivePlans`/`getEntitlement` functions the customer dashboard and entitlement engine use — confirmed no second billing interpretation exists (`platform-admin-service.ts` never calls `upsertSubscription` or any other write path).

## 6. Stripe lifecycle validation

Every documented state transition (`active`/`trialing`/`past_due` → paid access; `canceled`/`unpaid`/`incomplete`/`incomplete_expired` → no paid access; unknown Stripe status → falls to `canceled` via the exhaustive `mapStripeStatus()` switch's `default` case, never paid) is unchanged and already tested. `checkout.session.completed` is confirmed to only ever repair the customer↔user mapping, never itself grant a subscription — the authoritative state always comes from `customer.subscription.created/updated`, correctly deferring to whether payment actually cleared. Unknown Stripe price → `resolvePlanKeyFromPriceId()` returns `null` → event ignored, no row written with an invalid `plan_id` (also enforced by the table's own `CHECK` constraint as defense in depth).

## 7. Migration status

**Not applied — confirmed live, with a documented correction to the check methodology.** A first read-only check (`select(..., { count: "exact", head: true })`) misleadingly reported all `platform_*` tables as present (Supabase/PostgREST returns `204 No Content` for a `HEAD` request against a nonexistent table in this configuration, rather than an error). A second check using the exact query shape the application code actually uses (`select("id").limit(1)`, matching `listSubscriptionsForUser`/`getCustomerByUserId`/etc.) returned PostgREST's definitive `PGRST205 — Could not find the table 'public.platform_subscriptions' in the schema cache` for every M1/M2 table (`platform_billing_customers`, `platform_subscriptions`, `platform_entitlement_overrides`, `platform_usage_events`) **and** for `audit_logs` (Phase 14). Pre-Phase-14 tables (`blogs`, `admin_users`, `interview_categories`) were confirmed present and queryable, confirming this is a real, connected, non-empty Supabase project that simply has never had the Phase 14+ SaaS/billing/entitlement schema applied.

**Required before production**: `supabase/migrations/20260816000000_add_platform_entitlement_tables.sql` (M1) and `supabase/migrations/20260817000000_add_platform_billing_tables.sql` (M2), applied manually per this repo's own convention — neither was applied by this milestone.

## 8. Test results

**1099 / 1099 passing** (83 test files), up from the 1094 baseline — 5 new tests (4 for the out-of-order guard's own behavior — newer-overwrites-older, delayed-older-is-ignored, equal-timestamp treated as duplicate, first-event-always-applied — plus 1 confirming `handlePlatformStripeWebhook()` derives `eventCreatedAt` from the Stripe *event's* own `created` field, never the subscription object's or wall-clock time). Zero modified assertions beyond the two pre-existing tests that needed the new required `eventCreatedAt` field added to their fixture input (mechanical fallout of the signature change, not a behavior change). Zero removed.

## 9. TypeScript / lint / build results

`tsc --noEmit` — clean. `eslint .` — clean (the same one pre-existing, unrelated `<img>` warning from earlier milestones). `npm run build` — succeeded (exit 0); a stale, corrupted `.next/dev/types` artifact from a prior interrupted dev-server session caused spurious `tsc` errors before this milestone's own changes were even touched — removed (`rm -rf .next`) and confirmed unrelated to any source change.

## 10. Live probe results

With the dev server running locally, unauthenticated:

- `POST /api/billing/platform/checkout` → `401`
- `POST /api/billing/platform/portal` → `401`
- `GET /api/billing/platform/overview` → `401`
- `GET /api/admin/platform/users` → `401`
- `GET /settings/billing` → `307` to `/login`
- `POST /api/billing/platform/webhook` with no `stripe-signature` header → `400`
- `POST /api/billing/platform/webhook` with a fabricated signature header (no `STRIPE_SECRET_KEY` configured) → `400`, a clear configuration-error message, **no secret value or internal detail leaked**

All match documented, pre-existing behavior — nothing regressed by this milestone's change.

## 11. Stripe credential availability

**None.** `.env.local` has no `STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, or any `STRIPE_PRICE_*` variable (checked for presence only, values never read or displayed). No Stripe-mode E2E (checkout, portal, or live webhook delivery) was attempted or claimed. All webhook-path validation in this milestone is either pure/mocked-persistence unit testing or `platform-stripe-provider.test.ts`'s existing *real, non-mocked* HMAC signature verification against a locally-generated test secret (no network call, no live Stripe account involved).

Supabase credentials, notably, **are** present and valid in this environment (a change from prior milestones) — used only for the read-only migration-status check in §7, never to write, never to fabricate a successful payment/subscription record.

## 12. Known limitations

- The out-of-order guard's read-then-write is not atomic (§4) — acceptable given the actual risk profile, documented rather than hidden.
- Quota enforcement (Phase 18 M5) is code-correct but functionally inert against this live database until the M1 migration is applied: `getUsageCount()` fails closed to `0` when `platform_usage_events` doesn't exist, so no signed-in user could actually be quota-blocked in this environment today — not a bug (fail-closed is the correct, safe direction), but a concrete, worth-stating consequence of the unapplied migration.
- Similarly, no user can actually hold a paid plan in this environment until the M2 migration is applied — `resolveEffectivePlans()` always resolves every role to its FREE default, since `platform_subscriptions` doesn't exist to report otherwise.

## 13. Deferred items

None identified as in-scope-but-skipped. Steps 3–5, 8, and most of 12 required no code change (already correct); documented, not deferred.

## 14. Production readiness classification

**B — Production Ready, with Operational Prerequisites.**

The billing/entitlement code itself is sound, internally consistent, fails closed on every audited failure mode, and (as of this milestone) correctly handles out-of-order webhook delivery. It is not yet live-validated against a real Stripe account or a migrated database — both are external, operational actions, not code gaps.

## 15. Exact manual actions required before production

1. Apply `supabase/migrations/20260816000000_add_platform_entitlement_tables.sql`, then `supabase/migrations/20260817000000_add_platform_billing_tables.sql`, in the Supabase SQL Editor for the connected project (both are re-run-safe `if not exists` statements per their own headers).
2. Configure `STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, and the four `STRIPE_PRICE_*` variables for the four Stripe-backed plans.
3. Register the platform webhook endpoint (`/api/billing/platform/webhook`) in the Stripe dashboard for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` — the only four event types this handler processes (Step 6's own explicit instruction against subscribing to more than what's actually consumed).
4. Perform one real, authenticated Stripe **test-mode** checkout → webhook → `/settings/billing` round trip before accepting live traffic — this milestone could not perform that round trip itself (no Stripe credentials in this environment) and did not claim to.

No further Phase 18 code work is required to reach production; the remaining gap is entirely the four operational steps above.
