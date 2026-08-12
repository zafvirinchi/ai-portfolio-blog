# Phase 14 Milestone 6 — Customer Usage Analytics

## Goal

Give individual users and organization admins a secure, self-serve view
of their own AI usage — subscription, credits, feature usage, trends,
recent activity, seats — without exposing platform-wide, financial, or
cross-tenant data. Milestone 5 built the admin dashboard; this
milestone is the customer-facing counterpart, layered on top of it.

## First step: what already existed

`git status --short` was clean before starting. Inspection found more
of this milestone already built than expected:

- `/billing` already implemented Current Plan + Credit Balance +
  low/exhausted warnings (Milestone 3/4) — needed only a copy/threshold
  upgrade, not a rebuild.
- `/billing/usage` already implemented organization-wide AI usage
  (credits, daily trend, by-feature, by-model) via
  `/api/billing/usage/balance` and `/api/billing/usage/summary`
  (Milestone 4) — left untouched; this milestone adds new sections
  around it rather than replacing it.
- `/api/organization/analytics` already existed (Milestone 5's
  self-serve stub) — but it leaked `estimatedAiCostCents` (internal
  provider cost) to any organization member, and used Milestone 5's
  9-preset/400-day-custom-range admin schema instead of a bounded
  customer-safe one. Both were real gaps this milestone had to fix,
  not just extend.
- `/settings` (organization/team/workspaces/activity/audit/security/
  sessions/profile) is this project's existing customer account shell —
  confirmed there is no separate `/dashboard` route anywhere, and a
  user can legitimately belong to **zero** organizations (the
  "Create your first organization" state in `settings/layout.tsx`).

Given this, no new page routes were created. `/billing` and
`/billing/usage` were extended in place, per the spec's own "reuse the
project's existing equivalent user dashboard route" instruction.

## Architecture

```
src/lib/analytics/
  customer-usage-shared.ts     Pure, I/O-free: date-range resolution
                                 (7d/30d/90d/billing_period) and the
                                 4-tier usage-limit-warning thresholds.
                                 Zero server-only imports — the only
                                 file in this package client components
                                 may import from directly.
  customer-analytics-service.ts The customer-safe service layer the
                                 spec asks for — identity resolution,
                                 organization-admin gating, and every
                                 getMy*()/getOrganization*() method,
                                 built entirely by wrapping/reshaping
                                 Milestone 5's existing query helpers.
                                 Re-exports customer-usage-shared.ts's
                                 pure pieces for server-side callers.

  ai-usage-analytics.ts (extended)   + getFeatureUsageForUser,
                                       getDailyTrendForUser,
                                       getRecentActivityForUser,
                                       getDailyTrendForOrganization,
                                       getTopUsersForOrganization,
                                       getUsageForOrganization
                                     + getFeatureUsageForOrganization now
                                       also returns activeUsers/lastUsed
  organization-analytics.ts (extended) getOrganizationSelfMetrics now
                                       queries only ITS OWN organization
                                       (was: fetch every organization's
                                       rows, then look up one) and
                                       returns seatLimit, availableSeats,
                                       creditsRemaining, creditsResetDate
```

Every new query function is scoped to one `(userId, organizationId)` or
one `organizationId` **at the database level** (`.eq(...)` in the
query itself), never a platform-wide fetch filtered down after the
fact — this is what makes "organization A cannot see organization B"
and "user A cannot see user B" true by construction, not by a filter
that could be forgotten at a call site.

## A real bug fixed along the way

`getOrganizationSelfMetrics()` (Milestone 5) computed a single
organization's usage by calling `getUsageByOrganization(range)` —
which fetches **every organization's** `usage_tracking` rows platform-
wide, builds a `Map`, and reads out one entry. For an admin's
platform-wide dashboard that's fine (it needs every org's data
anyway); for a customer's self-serve request it meant every hit to
`/billing/usage` or `/api/organization/analytics` scanned the whole
platform's usage table to answer one organization's question. Fixed by
adding organization-scoped counterparts (`getUsageForOrganization`,
`fetchCurrentCreditBalanceForOrganization`,
`fetchMemberCountForOrganization`) and switching the self-serve path to
use them exclusively. The admin path (`getOrganizationMetrics()`) is
unchanged and still uses the platform-wide fetchers, which it
genuinely needs.

## Customer vs. admin analytics

| | Admin (Milestone 5) | Customer (Milestone 6) |
|---|---|---|
| Scope | Every organization | Caller's own user / own organization |
| Date range | 9 presets + custom (≤400 days) | 7d / 30d / 90d / billing_period only |
| Identity | Authenticated admin session | Authenticated session + tenant context |
| Cost visibility | `estimatedAiCostCents` shown | Never shown — stripped at the service layer |
| Entry point | `analyticsService` | `customerAnalyticsService` |

## User authorization

Every "me" endpoint (`/api/usage/me*`) resolves identity via
`resolveCustomerIdentity()`, which reads the authenticated Supabase
session directly (`supabase.auth.getUser()`) plus `getTenantContext()`
for the currently active organization. **No route ever reads a
userId/organizationId from a query parameter or request body.** A
user with no organization gets `{ hasOrganization: false }` — a
distinct, non-error signal the UI renders as "You don't belong to an
organization," not a failed request.

## Organization authorization

`/api/organization/analytics` (the org-wide summary, feature usage,
and trend) is open to **any member** of the organization — matching
this endpoint's pre-existing Milestone 5 access model, which this
milestone didn't narrow. The two genuinely new, more sensitive
endpoints — `/api/organization/usage/users` (per-member breakdown) and
`/api/organization/usage/export` (CSV of the same) — are gated by
`requireOrganizationAdmin()`, which checks the caller's session-
resolved `"Manage Billing"` permission (the existing
`DEFAULT_ROLE_PERMISSIONS` grants this only to Owner/Admin — no new
permission was introduced). A member without that permission gets a
403 from the API and never sees the "Organization Administration"
section in the UI at all (client-side gating mirrors, never
substitutes for, the server-side check).

## Credit display

Every credit number shown to a customer is read verbatim from
Milestone 4's authoritative `usage-service.getBalance()` (personal/
organization subscription view) or the organization-scoped query
helpers built this milestone (feature/trend/activity views) — no
component computes a balance, percentage, or remaining count from raw
data itself. `CreditBalanceCard.tsx`'s own doc comment states this
explicitly.

## Billing period

"Current Billing Period" (`resolveCustomerDateRange("billing_period",
subscription)`) uses the subscription's real `current_period_end` and
`billing_interval` — period start = `current_period_end` minus one
interval — never assumes "1st of month." This **can and does differ**
from the AI credit pool's own reset date: the protected credit engine
(Milestone 4) is hard-coded to calendar-month periods
(`credit_balances.period_start`), a boundary this milestone cannot
change without touching protected AI Credit Engine mechanics. So:

- The **Credit Balance** card's "Resets" date is always the credit
  engine's real calendar-month reset (unmodified, just surfaced).
- The **Usage Trend**'s "Current billing period" option is always the
  subscription's real billing-cycle window.
- A UI note ("Based on your subscription's actual renewal date" /
  "No active billing cycle yet — showing the current calendar month")
  makes the distinction visible rather than silently conflating the two.

Free-plan organizations and paid subscriptions with no recorded period
end fall back to calendar month for `billing_period` too (there's no
real cycle to derive from), and the response's `isRealBillingCycle`
flag tells the UI which case it's in.

## Feature usage

"Personal usage" is defined as this user's `usage_tracking` rows where
**both** `user_id` and `organization_id` match — the user's own
requests within their *currently active* organization, not merged
across every organization they belong to. This mirrors the credit pool
itself being organization-scoped (a user's requests always draw from
whichever org was active when the request was made), so "my usage"
and "the credit pool it drew from" always line up.

## Usage trends

7d/30d/90d reuse Milestone 5's exact `resolveDateRange()` — the same
day-boundary semantics, not silently redefined. `billing_period` is
genuinely new (see above). Charts reuse Milestone 5's existing
`UsageTrendChart` component directly (no duplicate chart component was
built) — consistent visual language, per spec.

## Recent activity / privacy

`getRecentActivityForUser()` selects exactly 4 columns from
`usage_tracking`: `feature_key`, `created_at`, `status`,
`actual_credits`/`credits_consumed`. There is no prompt, AI response,
resume content, or other document text in that table to begin with
(Milestone 4's own logging discipline) — so there's no sensitive field
this feature could leak even if the response shape were extended later.

## Caching

Milestone 5's `analytics-cache.ts` (60s TTL) is reused by the admin
`analyticsService` only. Customer-facing routes are **not** cached —
every `/api/usage/me*` and `/api/organization/usage/*` request reads
live. This is a deliberate choice, not an oversight: the spec calls
out avoiding "stale subscription/credit information after payment,
subscription change, credit allocation, credit consumption," and the
customer surface's traffic volume (one user's own dashboard, refreshed
occasionally) doesn't need the query-cost savings a 60-second cache
buys the admin dashboard's heavier, more-frequently-hit aggregate
queries. If this changes, any customer-scoped cache key must include
`userId` or `organizationId` (never a bare `customer:usage` key) — that
constraint is documented here for whoever adds it.

## CSV export

- `GET /api/usage/me/export` — the authenticated user's own recent
  activity (up to 1,000 rows within no forced range — a personal
  history export), CSV only.
- `GET /api/organization/usage/export` — admin-gated, the calling
  organization's own feature-usage breakdown for the selected range.

Both reuse Milestone 5's `toCsv()` serializer (`analytics-service.ts`)
— no second CSV implementation. Neither accepts an entity id from the
client; both derive their scope from the same identity/admin gates
every other route in this milestone uses.

## Limit warnings

Four thresholds, `customer-usage-shared.ts`'s `getUsageLimitWarning()`:

| Usage | Message |
|---|---|
| ≥ 50% | "You have used half of your monthly AI credits." |
| ≥ 75% | "You have used most of your monthly AI credits." |
| ≥ 90% | "You are approaching your monthly AI credit limit." |
| ≥ 100% | "You have reached your monthly AI credit limit." |

Returns `null` for an unlimited plan (`usagePercent === null`) — never
fabricates a warning for a limit the customer doesn't have. The
Upgrade CTA (`UpgradePrompt.tsx`) appears automatically once the
warning threshold reaches 90%, and always links to the existing
`/billing/plans` checkout flow — no second payment implementation.

## Security tests

Explicit tests exist for (in `customer-analytics-service.test.ts`,
`ai-usage-analytics.test.ts`, `organization-analytics.test.ts`):

- Unauthenticated request → `resolveCustomerIdentity()` returns `null`.
- User with no organization → `organizationId: null`, not an error.
- Member without `"Manage Billing"` → `requireOrganizationAdmin()`
  throws `OrganizationAdminRequiredError` (403 at the route).
- A forged role never grants admin access — permissions come from the
  `organization_members`/`organization_roles` rows matched to the
  authenticated session, never from client input; there is no code
  path that reads a role from the request.
- Organization-scoped queries (`getFeatureUsageForUser`,
  `getTopUsersForOrganization`, `getFeatureUsageForOrganization`, etc.)
  only ever return rows matching the exact `(userId, organizationId)`
  or `organizationId` passed in — verified with a filter-aware
  Supabase mock (inherited from Milestone 5) that actually excludes
  non-matching rows, not a passthrough that would hide a broken filter.
- `getOrganizationUsage()`'s response is asserted to never contain
  `estimatedAiCostCents`, even though the underlying metrics function
  computes it — the cost-privacy rule is tested, not just documented.

**Not covered**: true route-level tests (no Next.js route test harness
exists in this repo — the same gap Milestones 4 and 5 had) and expired-
session rejection (this is Supabase Auth's own token-expiry behavior,
unchanged and untouched by this milestone — `supabase.auth.getUser()`
already returns no user for an expired session, exercised identically
to every other authenticated route in this codebase).

## Files created

```
src/lib/analytics/customer-usage-shared.ts
src/lib/analytics/customer-analytics-service.ts
src/lib/analytics/customer-usage-shared.test.ts
src/lib/analytics/customer-analytics-service.test.ts

src/app/api/usage/me/route.ts
src/app/api/usage/me/features/route.ts
src/app/api/usage/me/trends/route.ts
src/app/api/usage/me/activity/route.ts
src/app/api/usage/me/export/route.ts
src/app/api/organization/usage/users/route.ts
src/app/api/organization/usage/export/route.ts

src/components/dashboard/usage/UsageProgress.tsx
src/components/dashboard/usage/UsageLimitWarning.tsx
src/components/dashboard/usage/UpgradePrompt.tsx
src/components/dashboard/usage/CreditBalanceCard.tsx
src/components/dashboard/usage/CurrentPlanCard.tsx
src/components/dashboard/usage/FeatureUsage.tsx
src/components/dashboard/usage/UsageTrend.tsx
src/components/dashboard/usage/RecentActivity.tsx
src/components/dashboard/usage/UsageOverview.tsx
src/components/dashboard/usage/OrganizationUsage.tsx
src/components/dashboard/usage/OrganizationSeats.tsx
src/components/dashboard/usage/OrganizationUsers.tsx
```

## Files modified

```
src/app/billing/page.tsx           Extracted CurrentPlanCard/
                                    CreditBalanceCard, upgraded warning
                                    thresholds to the 4-tier scheme.
src/app/billing/usage/page.tsx     Added "My Usage" and admin-gated
                                    "Organization Administration"
                                    sections around the existing
                                    (unchanged) org-wide usage section.
src/app/api/organization/analytics/route.ts
                                    Now customer-safe: bounded range
                                    presets, cost stripped, trend +
                                    limit warning added.
src/lib/analytics/ai-usage-analytics.ts
                                    New scoped query functions (see
                                    Architecture); getFeatureUsageForOrganization
                                    extended with activeUsers/lastUsed.
src/lib/analytics/organization-analytics.ts
                                    getOrganizationSelfMetrics rebuilt
                                    on organization-scoped queries;
                                    OrganizationSelfMetrics extended
                                    with seatLimit/availableSeats/
                                    creditsRemaining/creditsResetDate.
src/lib/analytics/index.ts         Exports customerAnalyticsService.
src/lib/analytics/test-helpers.ts  Mock's .order() now actually sorts
                                    (was a no-op) — needed to verify
                                    getRecentActivityForUser()'s
                                    most-recent-first guarantee.
src/lib/analytics/ai-usage-analytics.test.ts / organization-analytics.test.ts
                                    Updated for the extended/rebuilt
                                    function signatures above; new
                                    tests for every new scoped function.
```

## APIs created or modified

New: `GET /api/usage/me`, `/api/usage/me/features`,
`/api/usage/me/trends`, `/api/usage/me/activity`,
`/api/usage/me/export`, `/api/organization/usage/users`,
`/api/organization/usage/export`.

Modified: `GET /api/organization/analytics` (see Files modified).

Deliberately **not** created: `/api/organization/usage`,
`/api/organization/usage/features`, `/api/organization/usage/trends` —
`/api/organization/analytics` already returns organization usage,
feature usage, and trend in one response; adding parallel routes for
data already available would be duplication the spec explicitly warns
against ("only create endpoints that do not already exist").

## Existing services reused

`getTenantContext()`, `getActiveSubscription()`,
`usage-service.getBalance()`, `listPlans()`,
`organizationService.listAll()`, Milestone 5's `resolveDateRange()`,
`toCsv()`, `UsageTrendChart`, `AnalyticsEmptyState`/`AnalyticsLoading`/
`AnalyticsError`, and every Milestone 5 `ai-usage-analytics.ts` query
helper this milestone didn't need to duplicate.

## Testing

132 tests total (35 Milestone 4 + 63 Milestone 5 + 34 new this
milestone), `npm test`. New coverage: date-range resolution (7d/30d/
90d reuse + real billing-cycle math + fallback + future-date capping),
usage-limit-warning thresholds (all 4, plus the unlimited-plan null
case), identity resolution (unauthenticated / no-org / real-org
cases), organization-admin gating (missing permission / granted
permission / no session), per-user and per-organization scoped query
isolation, personal feature-usage percentage math, and the
cost-never-leaks assertion on `getOrganizationUsage()`.

## Validation

- `npm run lint` — 0 errors (1 pre-existing, unrelated warning).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds; all 7 new routes + modified
  `/api/organization/analytics` + `/billing`/`/billing/usage` compiled.
  This build also caught a real bug during development: a client
  component (`/billing/page.tsx`) initially imported
  `getUsageLimitWarning` from `customer-analytics-service.ts`, which
  transitively pulls in `supabaseAdmin`/`next/headers` — Next.js can't
  tree-shake a "use client" file's server-only transitive imports.
  Fixed by extracting the pure logic into `customer-usage-shared.ts`,
  which has zero server-only imports and is the only file in this
  package client components may import from directly.
- `npm test` — 132/132 passing.

## Live verification

**Not performed.** This sandbox has no live Supabase credentials or
seeded subscription/usage data (the same limitation noted in
Milestones 4 and 5). The 22-step live-verification checklist in the
spec (login → use an AI feature → confirm usage changed → test
another organization's ID manipulation → verify admin analytics still
works) has not been run against a real deployment.

## Known limitations

- **Billing-period/credit-period divergence is real, not just
  documented** — a customer on a mid-month billing cycle will see two
  different "period" concepts on the same page (credit reset date vs.
  billing-period trend window) if they select that trend option. This
  is inherent to the protected credit engine's calendar-month design,
  not fixable within this milestone's constraints.
- **No route-level security tests** — every security guarantee is
  tested at the service-function level (identity resolution, admin
  gating, query scoping), not by simulating an actual forged HTTP
  request against a running route. No Next.js route test harness
  exists in this repo (same gap as Milestones 4/5).
- **Customer routes are uncached** — acceptable at this project's
  scale, but means every dashboard load re-runs the same queries an
  admin's cached view would reuse. If this becomes a real cost, any
  cache key added must include `userId`/`organizationId` (documented
  above) to avoid cross-customer cache leakage.
- **CSV exports have no server-side range validation beyond the 4
  presets** — `/api/usage/me/export` exports up to 1,000 recent rows
  with no date-range parameter at all (a deliberate scope reduction,
  not every possible export filter combination); `/api/organization/
  usage/export` exports the feature-usage breakdown only, not a raw
  per-request row export, to avoid a second, larger CSV shape.
- **No live verification** (see above) — every guarantee here rests on
  unit tests against mocked Supabase responses, not an observed real
  deployment.
