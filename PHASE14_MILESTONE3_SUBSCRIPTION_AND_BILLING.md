# Phase 14 Milestone 3 — Subscription and Billing

## Goal

Turn the platform into a real subscription SaaS: Stripe-backed
billing, four plan tiers, an AI credit engine that meters every AI
feature, usage tracking, invoices, coupons, and both a user and an
admin billing dashboard — all on top of a real payment-provider
abstraction, entirely additive, nothing from Organizations,
Authentication, SSO, or Security touched or duplicated.

Two decisions were confirmed with the user before implementation:
1. **Billing is scoped to the Organization**, not the individual user
   — matches "Organization seats" in the spec and how this app already
   models tenancy (Milestone 1). One plan and one shared credit pool
   per organization.
2. **The official `stripe` npm package was added** — the first new
   runtime dependency in this whole Phase 14 arc (Milestones 1-2
   needed none, since Supabase's own SDK covered everything). It won't
   process a real payment until the user adds their own Stripe
   test-mode API keys.

## Architecture

```
BillingProvider (interface, src/lib/billing/billing-provider.ts)
  createCheckoutSession / createPortalSession / cancelSubscription /
  resumeSubscription / verifyAndConstructWebhookEvent
        │
        ▼
stripe-provider.ts implements BillingProvider — the ONLY file that
  imports the `stripe` package. getBillingProvider(id) is the one
  place a provider id resolves to a real adapter; razorpay/paypal/
  paddle/lemonsqueezy are declared in the PAYMENT_PROVIDERS type union
  and throw ProviderNotImplementedError until a real adapter class is
  added — per the spec's own "future providers must require only a
  new adapter" requirement.
        │
        ▼
billing-service.ts — the ONLY caller of getBillingProvider() anywhere
  else in the app; every route goes through it.
        │
        ├─► subscription-service.ts   getActiveSubscription() (real row
        │                              or virtual Free-plan fallback),
        │                              upgrade/cancel/resume/trial/grace
        ├─► plan-service.ts           PLAN_DEFINITIONS (4 tiers), seeded
        │                              into the real `plans` table
        ├─► credit-service.ts         checkCredits()/consumeCredits() —
        │                              the non-breaking core (see below)
        ├─► invoice-service.ts        invoice rows + on-demand PDF
        ├─► payment-service.ts        payment rows, from webhook events
        ├─► coupon-service.ts         coupons (definitions) + discounts
        │                              (applied instances)
        ├─► tax-service.ts            static-rate-table calculateTax()
        └─► pricing-service.ts        price/interval display helpers
```

8 new tables (`plans`, `subscriptions`, `payments`, `invoices`,
`credit_transactions`, `usage_tracking`, `coupons`, `discounts`), no
RLS, following the established hand-written-SQL migration convention.

## The AI credit engine's non-breaking guarantee

This is the load-bearing constraint of the whole milestone: **anonymous
and no-organization usage of every AI feature must remain completely
unaffected** — the exact discipline Milestone 1 established for
activity logging and Milestone 2 for MFA. `credit-service.ts`'s
`checkCredits()`/`consumeCredits()` resolve an organization id (via
`organizationRequestContext` when already set by the chat request
chain, falling back to a fresh `getTenantContext()` call for every
other route — a fix made mid-implementation once it became clear the
non-chat AI routes never populate that AsyncLocalStorage store
themselves) and are a pure no-op whenever none resolves. Every
organization implicitly has a Free plan the moment one is asked for —
`subscription-service.ts`'s `getActiveSubscription()` returns a real
`subscriptions` row if one exists, or a virtual in-memory Free-plan
object if not, with **no dependency on `organization-service.ts`**
(protected, untouched) and no DB write.

Wired into the 6 routes that actually call OpenAI and map to a named
plan limit (deliberately narrower than Milestone 1's 8-route
activity-logging list — job creation, interview scheduling, cover
letter, and LinkedIn optimization aren't named plan limits in this
spec, so they aren't credit-metered):

| Route | Feature key |
|---|---|
| `api/ai/resume` | `resume_upload` |
| `api/ai/resume/jd-match` | `jd_match` |
| `api/ai/resume-rewriter` | `resume_rewrite` |
| `api/ai/mock-interview` | `mock_interview` |
| `api/admin/rag-documents` | `knowledge_upload` |
| `api/ai/chat` | `ai_chat` |

Each gets `checkCredits(featureKey)` before the real work (throws
`InsufficientCreditsError`, caught and returned as HTTP 402, only when
a real organization context exists and its plan's monthly allotment is
exhausted) and `consumeCredits(featureKey, durationMs)` after success
(writes one `usage_tracking` row and one `credit_transactions` row;
never throws — a logging failure never breaks the feature it meters).
"ATS Reports" has a declared plan limit but no independent metering
point — this app has no ATS-only endpoint distinct from resume upload,
so ATS scoring is bundled into `resume_upload`'s single deduction
rather than double-charging one action against two limits.

## Payment flow

Checkout uses Stripe **Checkout Sessions** (Stripe hosts the actual
card form — no PCI scope in this app) with **inline `price_data`**
rather than pre-created Stripe Price objects, so no Stripe Dashboard
product/price setup is required beyond an API key — `unit_amount` is
computed locally (base plan price minus any validated coupon discount)
and handed to Stripe already-final. `POST /api/billing/webhooks/stripe`
— the first webhook route in this app — reads the raw body via
`req.text()` (App Router Route Handlers never auto-parse, so this is
safe) before verifying the signature via
`stripe.webhooks.constructEventAsync()`. Handles
`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`.

**A real API-shape discovery**: this project's `AGENTS.md` warning
about breaking changes from training data applies to the `stripe`
package too, not just Next.js — confirmed via the installed SDK's own
`.d.ts` files (pinned to API version `2026-07-29.dahlia`) that
`current_period_end` no longer lives on the top-level `Subscription`
object; it moved to `subscription.items.data[0].current_period_end`,
and an invoice's originating subscription moved to
`invoice.parent.subscription_details.subscription`. Both were checked
against the actual installed type definitions before being used in
`billing-service.ts`'s webhook handlers, rather than assumed from
general Stripe API familiarity.

## Subscription lifecycle

Trial (`startTrial()`, local — no Stripe interaction, a real
`subscriptions` row with `status: 'trialing'`), upgrade/downgrade (a
new Checkout Session for a different plan), cancel
(`cancel_at_period_end: true` on the real Stripe subscription, plus a
local `grace_period_end` 7 days after `current_period_end`), resume
(clears both), auto-renewal (Stripe's own recurring billing, reconciled
via `invoice.paid`), expiration (`isExpiredPastGrace()` — once past
`grace_period_end`, `credit-service.ts` treats the organization as Free
for limit purposes even though the historical `subscriptions` row still
shows their last paid plan, for accurate billing history).

## Invoice generation

Reuses this project's existing `pdfkit` buffer-promise pattern verbatim
(`src/app/api/ai/resume-rewriter/[rewriteId]/export/pdf-renderer.ts`
was the template) — no new PDF library. `GET
/api/billing/invoices/[id]/pdf` renders on demand; nothing is ever
stored as a file. Invoice numbers are sequential
(`INV-{year}-{6-digit sequence}`), generated at invoice-creation time
from a live count query.

## Coupon system

`coupons` are reusable definitions (percentage or flat, expiry, max
redemptions, recurring flag) mirroring Stripe's own Coupon object;
`discounts` are the applied record on a specific organization mirroring
Stripe's own Discount object. Unlike Stripe's native coupon/promotion-
code system, discounts here are applied **locally** — the checkout
price sent to Stripe is already discount-adjusted — so this app's own
`coupons`/`discounts` tables stay the single source of truth and
nothing needs to be created or synced on the Stripe side. Redemption
(incrementing `redemption_count`, inserting the `discounts` row) only
happens after `checkout.session.completed` fires, not at checkout
initiation — an abandoned checkout never consumes a redemption.

## Billing provider abstraction

`billing-provider.ts` defines the interface every route/service
depends on; `stripe-provider.ts` is the only file that imports `stripe`
or touches its API surface. Adding Razorpay/PayPal/Paddle/LemonSqueezy
later means: (1) add a new adapter class implementing
`BillingProvider`, (2) register it in `getBillingProvider()`'s
if/else chain. No other file in the app changes.

## User and admin dashboards

`/billing`, `/billing/plans`, `/billing/history`, `/billing/invoices`
— a new top-level layout (`src/app/billing/layout.tsx`) mirroring
`src/app/settings/layout.tsx`'s auth-gate/org-switcher shape exactly,
since billing is organization-scoped the same way settings are.
`/admin/billing` lives inside the existing gated `/admin` area
(Milestone 1's `admin/saas/page.tsx` was the direct template) —
MRR/ARR (active subscriptions' prices, yearly normalized to monthly),
real revenue (summed successful payments), churn rate and ARPU
(computed over all-time data, not a monthly cohort — labeled as such
rather than presented as a precise industry-standard metric).

## Chat integration

No new `AsyncLocalStorage` context — billing questions reuse the
*existing* `organizationRequestContext` from Milestone 1, since billing
is organization-scoped by design. `resume.tool.ts` gets one more
intent-gated branch answering "how many AI credits do I have," "what
features are included in Premium," "why can't I upload more resumes"
(grounded in the real plan limit vs. real current usage), and "show my
invoice" — all from real `credit-service.ts`/`plan-service.ts`/
`invoice-service.ts` data, never fabricated.

## What real testing found (and fixed)

A runtime smoke test (dev server, before the migration had been run)
surfaced two real resilience bugs, both in the same shape: several
read functions (`plan-service.ts`'s `getPlanByKey`/`getPlanById`/
`listPlans`, `subscription-service.ts`'s `getActiveSubscription`,
`credit-service.ts`'s internal `usedThisMonth`) threw on a Supabase
query **error** (e.g. `PGRST205` when a table doesn't exist yet) but
only had fallback logic for the "query succeeded with zero rows" case
— two different code paths that a missing-table condition doesn't
distinguish. This meant `GET /api/billing/plans` hard-failed instead
of falling back to the static `PLAN_DEFINITIONS`, and — more
seriously — any credit check for a real logged-in organization would
have thrown instead of gracefully treating them as Free-plan, before
the migration was run. **Fixed** by catching the error case in all
five functions and returning the same static/zero/Free-plan fallback
already used for the empty-data case. Re-verified via the dev server
(`/api/billing/plans` now returns all 4 static tiers, `/api/billing/me`
returns `{subscription: null, creditBalances: []}` anonymously, `/api/ai/chat`
still returns 200 anonymously) and via `npm run build`'s own
build-time trial-render of `/admin/billing` (which now logs a graceful
fallback message instead of failing the build).

## Known limitations

- Stripe checkout/webhooks are real, working code but require the
  user's own Stripe test-mode API keys (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`) to actually process a payment — not
  configured in this environment.
- Razorpay/PayPal/Paddle/LemonSqueezy are type-safe placeholders
  (`ProviderNotImplementedError`), not real integrations, per the
  spec's own "keep interfaces ready for" framing (only Stripe was
  asked to be "implemented").
- Tax calculation is a small static rate table, not a live tax API —
  architecture-ready, not live, same posture as Milestone 2's
  Enterprise SSO.
- Churn rate and ARPU on `/admin/billing` are computed over all-time
  data, not a proper monthly cohort — an honest simplification given
  this app has no time-series billing history yet.
- As with Milestones 1 and 2, this repo has no migration tooling — the
  new 8-table migration
  (`supabase/migrations/20260808000000_add_billing_tables.sql`) must
  be run manually in the Supabase SQL Editor; confirmed via a
  read+write probe against the live project that it had not been run
  yet as of this writing. Every read path degrades gracefully until
  then (see "What real testing found" above) rather than breaking.

## Future providers

Adding a real Razorpay/PayPal/Paddle/LemonSqueezy adapter is, by
design, a single new file: implement `BillingProvider` from
`billing-provider.ts` (checkout session creation, portal/manage-
subscription equivalent, cancel/resume, webhook signature verification
for that provider's own scheme) and register it in
`getBillingProvider()`. No changes to `billing-service.ts`, any route,
or any UI page — they all already operate purely in terms of the
provider-agnostic interface and `PaymentProviderId` union.
