# Phase 14 Milestone 5 — Enterprise Analytics Dashboard

## Goal

Turn Milestones 1-4's business, subscription, billing, and AI usage
data into a professional SaaS analytics platform — an admin dashboard
answering "how many users, how much revenue, which features drive
credit spend, who's near their limits" — entirely additive, with zero
changes to LangGraph, the AI credit engine, the usage meter, or any
other protected file.

## First step: what already existed

Per the milestone's own instruction, before writing anything: `git
status --short` was clean. Inspection of `src/lib/billing/`, `src/lib/
ai/usage/`, `src/lib/saas/`, and the existing `/admin/usage` dashboard
found real tables to build on (`organizations`, `subscriptions`,
`plans`, `payments`, `invoices`, `credit_transactions`, `usage_tracking`,
`credit_balances`, `organization_members`) and confirmed **no chart
library exists anywhere in this project** — `/billing/usage`'s bar
chart is a plain div-width-percentage component, which this milestone's
own chart components follow exactly, per "do not introduce an
unrelated visual language."

## Key decision: no new `analytics_events` table

The spec explicitly allows introducing `src/lib/analytics/events.ts` +
an `analytics_events` table "if the project does not already have a
centralized event system" — but every event type it lists turned out
to already have a real, timestamped home:

| Spec event | Real source |
|---|---|
| `USER_REGISTERED` | `auth.users.created_at` (Supabase Admin API) |
| `RESUME_UPLOADED` / `RESUME_ANALYZED` | `usage_tracking` (`RESUME_ANALYSIS`/`RESUME_PARSER`) |
| `JD_MATCH_COMPLETED` | `usage_tracking` (`JD_MATCHING`) |
| `RESUME_REWRITTEN` | `usage_tracking` (`RESUME_REWRITE`) |
| `MOCK_INTERVIEW_STARTED` | `usage_tracking` (`MOCK_INTERVIEW`) |
| `AI_CHAT_USED` | `usage_tracking` (`AI_CHAT`) |
| `KNOWLEDGE_DOCUMENT_UPLOADED` | `usage_tracking` (`KNOWLEDGE_INGESTION`) |
| `PAYMENT_COMPLETED` / `PAYMENT_FAILED` | `payments.status` + `created_at` |

The only genuinely missing signal is **subscription lifecycle
history** (upgrade/downgrade/renewal) — `subscriptions` is a
current-state table with no change log. Adding write-side
instrumentation for that would mean touching `subscription-service.ts`
or `billing-service.ts`, both adjacent to this milestone's protected
"Subscription Service" — so instead of writing new events, those
specific metrics are honestly reported as **unavailable** (see Known
Limitations), exactly as the spec's own "show N/A rather than invent
data" rule permits. No new table, no new event system, nothing
duplicated.

## Architecture

```
src/lib/analytics/
  analytics-schema.ts      Date-range presets + resolveDateRange() +
                            zod validation (MAX_RANGE_DAYS=400 guard
                            against abusive custom ranges)
  analytics-types.ts        Every metric shape, incl. Metric<T> — a
                            {available:true,value} | {available:false,
                            reason} wrapper used anywhere real data
                            doesn't exist yet
  analytics-cache.ts        In-memory TTL cache (60s), same Map-based
                            pattern as usage-policy.ts's model pricing
  revenue-analytics.ts      MRR/ARR (snapshot), gross/net/refunds/
                            discounts/taxes/failed (range-scoped, from
                            payments+invoices)
  subscription-analytics.ts Plan counts, churn, org→plan resolution
                            (shared with user/organization-analytics)
  user-analytics.ts         auth.users enumeration, DAU/WAU/MAU, top
                            users
  organization-analytics.ts Org-wide + single-org (self-serve) views,
                            near-limit detection
  ai-usage-analytics.ts     usage_tracking aggregation — by feature,
                            by model, daily trend; shared query
                            helpers reused by feature/conversion/user/
                            organization analytics
  feature-analytics.ts      Product-feature adoption (maps usage_
                            tracking feature_keys onto user-facing
                            feature names)
  conversion-analytics.ts   Free↔Paid mix, trial→paid, feature→paid
                            "associated conversion," per-org funnel
  analytics-service.ts      The AnalyticsService façade — every method
                            the spec named, plus rule-based anomaly
                            detection and the CSV serializer
  index.ts                  Barrel export
```

No SQL/aggregation logic lives in any React component — every number
a component renders comes from a typed prop populated by an API route
that called `analyticsService`.

## Data sources (exact tables, no guessing)

Every query targets a table already inspected in Milestones 1-4:
`organizations`, `organization_members`, `subscriptions`, `plans`,
`payments`, `invoices`, `credit_balances`, `usage_tracking`, and Supabase
Auth's `auth.users` (via the Admin API, `listUsers()`/`getUserById()` —
this app has no separate `profiles` table). Aggregation happens in
application code after a bounded fetch (`.limit(20_000)` per query),
matching the exact pattern Milestone 4's `usage-service.ts` already
established — not a regression, but it does mean this is the actual
scaling ceiling (see Known Limitations).

## Date range

`resolveDateRange()` (`analytics-schema.ts`) turns one of the 9 spec
presets (or a validated custom range) into a concrete `{from, to}`
window. Every analytics function takes this resolved `DateRange`,
never a raw string — so there's exactly one place that has to know
what "previous_month" means. `dateRangeQuerySchema` rejects: an
invalid preset, a custom range missing `from`/`to`, `from > to`, and
any custom span wider than `MAX_RANGE_DAYS` (400) — the "don't allow
abusive queries" guard the spec calls for.

**MRR/ARR are the one exception** — they're point-in-time snapshots
(standard SaaS metric practice: "how much is currently recurring,"
not "how much recurred during the selected range"), computed from
whichever subscriptions are active *right now*, independent of the
dashboard's date filter.

## Revenue definitions

- **MRR**: sum of `monthly_price_cents` (or `yearly_price_cents ÷ 12`
  for yearly subscribers) across every subscription with status
  `active`/`trialing`/`past_due`/`grace_period` — never a sum of
  historical payments (which would double-count renewals).
- **ARR**: MRR × 12.
- **Gross/Net/Refunds/Failed**: from `payments.status` within the
  selected range (`succeeded`/`refunded`/`failed`).
- **Taxes/Discounts**: summed from `invoices` where `status = 'paid'`
  within range.
- **Recurring vs. one-time**: this product has **no one-time-purchase
  feature** — every payment originates from a subscription checkout or
  renewal invoice — so 100% of recognized revenue is recurring by
  construction, not an assumption. `oneTimeRevenueCents` is always 0
  today; revisit if a one-time-purchase feature is ever added.

## Churn — formula and its honest limitation

```
Customer/Subscription churn = canceled-in-range ÷ (currently-active + canceled-in-range)
Revenue churn = MRR of subscriptions canceled in range ÷ (current MRR + that lost MRR)
```

"Canceled-in-range" is approximated from `subscriptions.updated_at`
(the row's last-modified timestamp) — **not** a true point-in-time
cohort snapshot, because no subscription-history log exists. This is
documented on the `ChurnMetrics.formula` field itself and surfaced
directly in the Subscriptions tab UI, not buried in a footnote.
Customer churn and subscription churn are the *same number* in this
data model, since `subscriptions` enforces exactly one row per
organization.

## Conversion — "associated," never "caused"

Every conversion number answers "what fraction of organizations that
did X are currently paid" — a correlation read off real data, not a
causal claim. The UI and API both carry this disclaimer verbatim:
*"These numbers describe organizations that used a feature AND are
currently on a paid plan — a correlation, not a causal claim... Labeled
'Associated conversion' throughout."* Free→Paid is explicitly labeled
a **current mix**, not a cohort conversion rate (no signup-to-payment
timestamp delta is tracked). Trial→Paid **is** a real rate — `trial_end`
is set once by `startTrial()` and never cleared, so "trialed and now
active" vs. "trialed and now canceled" is a genuine, derivable split.
Plan-tier upgrades (Professional→Premium, etc.) are marked
unavailable — same reason as churn's approximation, stated plainly
instead of guessed at.

## AI usage / cost

Reuses Milestone 4's `usage_tracking` rows and `CREDITS_PER_DOLLAR`
constant (`usage-policy.ts`) for cents conversion — no separate pricing
table. "Estimated AI Cost" is labeled as such everywhere in the UI,
never presented as an actual accounting cost, per the spec's financial-
accuracy rule.

## Anomaly detection — rule-based, not another LLM agent

`analytics-service.ts`'s `getAnomalies()` runs 5 fixed checks over the
last 24h vs. the trailing 7 days (independent of the dashboard's date
filter — an anomaly answers "is something unusual happening now," not
"within whatever range is selected"):

1. **Usage spike** — today's platform credit total > 3× the trailing
   7-day daily average.
2. **Organization near limit** — reuses `organization-analytics.ts`'s
   existing ≥90%-of-monthly-credit-or-seat-limit detection.
3. **Repeated failures** — a user with ≥5 failed AI calls today.
4. **Cost increase** — riding on the same spike check (>3× average
   implies cost rose commensurately).
5. **User high requests** — a user's request count today > 5× the
   platform's per-active-user average (with a ≥20-request floor to
   avoid flagging noise on a quiet day).

Each returns `{severity, type, description, timestamp, relatedEntity}`
— no AI call, no prompt, purely arithmetic over already-fetched rows.

## Security

- Every `/api/admin/analytics/*` route requires a real authenticated
  Supabase session (`requireAdmin()`, the same pattern as
  `/api/billing/coupons` and `/api/billing/usage/admin/*`) — this
  single-operator site has no separate platform-admin role table to
  integrate with, so "authenticated at `/admin`" is the existing
  authorization boundary, unchanged.
- `GET /api/organization/analytics` derives its organization id
  **exclusively** from `getTenantContext()` (server-side session +
  cookie) — never from a query parameter or request body. Its backing
  function, `getOrganizationSelfMetrics(organizationId, range)`, issues
  database queries scoped to that one id (`.eq("organization_id", ...)`
  at the query level), not a platform-wide fetch filtered down after
  the fact — there is no code path by which it can return another
  organization's rows.
- No userId/organizationId/role is ever trusted from client input
  anywhere in this package.

## Caching

`analytics-cache.ts` — a 60-second in-memory TTL `Map`, matching
`usage-policy.ts`'s existing model-pricing cache pattern (no Redis or
other external cache exists in this project). `analyticsService`'s
every public method wraps its computation in `withCache()`, keyed by
function name + serialized range (+ any extra params like `limit`).
`invalidate(prefix)` exists for the "must reflect a just-made change
immediately" case the spec calls out, though no route currently calls
it — see Known Limitations.

## Performance

- Every table scan is capped at `MAX_ROWS = 20_000` (usage/payments/
  members) or `MAX_USER_PAGES × USERS_PER_PAGE = 20,000` (auth users) —
  the same "don't allow an abusive query" principle applied to result
  size, not just date range.
- Aggregation happens in application code after a bounded fetch — this
  matches Milestone 4's own established pattern exactly, not a new
  approach, but it is a real ceiling (see Known Limitations).
- CSV export streams a plain-text response; no client-side aggregation
  of raw rows ever happens — every number rendered in the UI or CSV was
  already computed server-side.

## Admin dashboard

`/admin/analytics` — 8 tabs (Overview, Revenue, Subscriptions, Users,
Organizations, AI Usage, Features, Conversion), a shared date-range
filter, and a CSV export button for the 5 tabs the spec names
(Revenue, Subscriptions, AI Usage, Users, Organizations). Every table
has an honest empty state (`AnalyticsEmptyState`) instead of a
zero-filled fake chart. Charts are plain div-based bar charts
(`UsageTrendChart`, `RevenueTrendChart`) — consistent with this
project's only existing chart (`/billing/usage`'s `BarChart`), no pie
charts, no 3D, no dual-axis.

## API

```
GET /api/admin/analytics/overview       — KPIs + anomalies
GET /api/admin/analytics/revenue
GET /api/admin/analytics/subscriptions  — includes churn
GET /api/admin/analytics/users          — includes top users
GET /api/admin/analytics/organizations  — includes near-limit warnings
GET /api/admin/analytics/ai-usage
GET /api/admin/analytics/features
GET /api/admin/analytics/conversion
GET /api/admin/analytics/trends
GET /api/admin/analytics/export?table=<revenue|subscriptions|ai-usage|users|organizations>
GET /api/organization/analytics         — self-serve, tenant-scoped
```

All accept `?range=<preset>` and, for `range=custom`, `?from=&to=`
(ISO datetimes).

## Testing

98 tests across the package (`npm test`), using the same
mocked-Supabase style Milestone 4 established, upgraded with a
**filter-aware** query-builder fake (`test-helpers.ts`) that actually
applies `.eq()`/`.in()`/`.gte()`/`.lte()`/`.not()` against fixture rows
— a dumb passthrough mock would have let a real bug (MRR incorrectly
including canceled subscriptions) pass silently; the filter-aware
version caught it during development and forced a fixture fix, not a
code fix, once verified.

Covered: date-range resolution and validation (all 9 presets +
abusive-range rejection), MRR/ARR calculation (monthly vs. yearly,
zero-subscription case, canceled exclusion), revenue aggregation
(gross/refunds/failed by status, tax/discount from paid invoices only,
recurring-vs-one-time), subscription counts (derived Free count,
trials, range-scoped cancellations), churn (insufficient-data case,
the actual formula, revenue churn), conversion (Free/Paid mix,
trial→paid, feature-associated conversion, funnel), AI usage
aggregation (totals, by-feature, by-model, daily trend, empty
dataset), feature aggregation (multi-key product features, untracked
features), organization near-limit detection (credits and seats,
both directions), organization self-metrics scoping, cache hit/miss/
TTL-expiry/prefix-invalidation, CSV serialization (empty, escaping,
null handling), and overview composition.

**Not covered**: the `requireAdmin()` gate itself (no Next.js route
test harness exists in this repo — same gap Milestone 4 had), and true
end-to-end query-level organization isolation against a live database
(the mock's `.eq()` filtering verifies the *code calls the right
filter*, not that Postgres/PostgREST enforces it correctly — that
requires a real Supabase instance).

## Validation

- `npm run lint` — 0 errors (1 pre-existing, unrelated warning).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds; all 11 new routes + `/admin/analytics`
  compiled.
- `npm test` — 98/98 passing (35 from Milestone 4 + 63 new).

## Known limitations

- **No subscription-history log** — upgrades, downgrades, renewals,
  and cohort-based (rather than current-mix) Free→Paid conversion are
  all reported as unavailable. Adding this would mean writing to
  `subscription-service.ts`/`billing-service.ts` at their state-
  transition points, which sits right at the edge of this milestone's
  "don't redesign the Subscription Service" protection — deliberately
  left alone rather than guessed at.
- **Churn is timestamp-approximated, not cohort-exact** — see the
  Churn section above. Clearly labeled everywhere it's shown, per the
  spec's own "don't present an approximation as an exact financial
  metric" rule.
- **Aggregation is application-side, not a SQL `GROUP BY`** — every
  query fetches up to `MAX_ROWS`/`MAX_USER_PAGES` rows and reduces in
  JS. This matches Milestone 4's existing pattern, but is the real
  ceiling: once `usage_tracking` or `auth.users` meaningfully exceeds
  ~20,000 rows in a query window, results silently truncate rather than
  erroring. The real fix is a Postgres aggregation RPC (same shape as
  Milestone 4's `ai_credits_reserve`/`commit`/`release` functions) —
  out of scope here since it's a schema addition beyond "absolutely
  necessary," but flagged for the next milestone that touches this
  area.
- **`getFeatureUsageForOrganization`'s per-organization feature
  breakdown re-queries `usage_tracking`** rather than being derived
  from the platform-wide index already computed elsewhere in the same
  request — a deliberate accuracy-over-micro-optimization trade, since
  the platform-wide index doesn't retain per-organization request/
  credit splits.
- **Cache invalidation is manual-only** — `invalidate(prefix)` exists
  but nothing calls it yet; a subscription/payment webhook could stay
  stale for up to 60 seconds before the next natural cache expiry.
  Acceptable for an admin dashboard's near-real-time expectations, but
  worth wiring into `billing-service.ts`'s webhook handlers if fresher
  reads become important.
- **Live verification against a real Supabase project was not run** —
  this sandbox has no live Supabase credentials or seeded data. All 98
  tests run against mocked Supabase responses; the 16-step live-
  verification checklist in the spec (login → change date range →
  verify org isolation → confirm no AI regression) has not been
  observed against a real deployment.

## Future extensions

- A Postgres aggregation RPC once `usage_tracking`/`auth.users` outgrow
  the current row caps.
- Wire `analytics-cache.ts`'s `invalidate()` into `billing-service.ts`'s
  webhook handlers for sub-60-second freshness after a payment/
  subscription event.
- A real subscription-history table, if upgrade/downgrade/renewal
  tracking becomes a genuine product need — the natural trigger point
  is whenever `subscription-service.ts` itself is revisited for
  unrelated reasons (so this milestone doesn't have to be the one that
  touches it).
