# Architecture Review Skill — Reference

## The parallel-systems map (memorize this before reviewing anything billing/recruiter-shaped)

| Concern | System A (older) | System B (newer) | Do not merge without explicit instruction |
|---|---|---|---|
| Billing/subscriptions | Organization-scoped (Phase 14): `organizations`, `plans`, `subscriptions`, `payments`, `invoices`, `credit_transactions`, `usage_tracking`, `coupons`, `discounts` tables; `billing-service.ts`, `subscription-service.ts`, `stripe-provider.ts`, `credit-service.ts`, `plan-service.ts`; dynamic Stripe `price_data` checkout | Platform/per-user (Phase 18-20): `platform_billing_customers`, `platform_subscriptions`, `platform_entitlement_overrides`, `platform_usage_events` tables; `platform-billing-service.ts`, `platform-subscription-service.ts`, `platform-stripe-provider.ts`, `entitlement-service.ts`; fixed Stripe Price IDs | Yes |
| Recruiter product | `src/app/api/ai/recruitment/**` (Phase 13 M9) — deliberately unauthenticated, ownerless, shared in-memory-shaped pipeline | `src/app/api/ai/recruiter/**` (Phase 16+) — per-recruiter-owned, consistently entitlement-gated | Yes — the older one's lack of auth is a 4-times-documented deliberate decision, not an oversight |
| UpgradePrompt UI | `src/components/dashboard/usage/UpgradePrompt.tsx` (org system, links to `/billing/plans`) | `src/components/billing/platform/UpgradePrompt.tsx` (platform system, links to `/settings/billing`) | Yes — using the wrong one sends a user to the wrong upgrade flow entirely |

## AI engine inventory (check before proposing a new one)

`src/lib/ai/` subdirectories, each a self-contained feature engine with its own generator file(s), service file, and (usually) route(s):

`resume`, `resume-enterprise`, `resume-rewriter`, `resume-versions`, `job`, `job-description`, `job-match`, `interview`, `interview-ai`, `interview-chat`, `interview-document`, `interview-import`, `interview-prep`, `mock-interview`, `recruiter`, `recruitment`, `linkedin`, `cover-letter`, `multi-agent`, `agent`, `graph`, `planner`, `router`, `tools`, `chains`, `knowledge`, `ingestion`, `memory`, `services`, `usage`.

Before adding a new subdirectory here, check whether the capability is a variant of an existing one (e.g., "generate a networking message" is already `linkedin/recommendation-generator.ts`; "summarize an interview" is already `recruitment/interview-scheduler.ts`'s `generateFeedbackSummary`).

## The multi-agent chat graph, precisely

`src/lib/ai/graph/**`: `START → planner-node → tool-node (conditional) → prompt-builder-node → generation-node → END`. `generation-node` is the one node that can invoke `src/lib/ai/multi-agent/coordinator.ts`, which runs up to 2 of {`research-agent.ts`, `reviewer-agent.ts`} in parallel plus `summarizer-agent.ts` — bounded, non-recursive, never re-enters the graph. A single chat turn can therefore reach up to ~6 LLM calls (planner + tool + up to 2 specialists + summarizer + final generation), metered as exactly one `AI_CHAT_MESSAGES` unit. Any proposed change to this graph must preserve: (a) acyclicity, (b) the single metering point at the route level (`src/app/api/ai/chat/route.ts`), (c) the bound on specialist-agent fan-out (never unbounded/recursive).

## Deterministic engines that exist specifically to avoid an LLM call

Do not propose replacing these with an LLM call, and check for one of these before proposing a *new* LLM call for a similar-sounding task:

- ATS scoring core (`job-description/ats-engine.ts`, `resume-enterprise/ats/**`) — keyword/weight-based, not model-based.
- Candidate ranking (`recruiter/candidate-ranking.ts`) — deterministic scoring formula.
- LinkedIn SEO report, profile score, featured-content suggestions (`linkedin/seo-engine.ts`, `linkedin/profile-score.ts`, `linkedin/featured-generator.ts`) — all deterministic, zero-LLM-cost, recomputed fresh on every call.
- Interview coverage/study-plan computation (`interview-prep/interview-intelligence-service.ts`) — deterministic analysis over an already-generated report.
- Recruiter analytics (`recruiter/recruiter-analytics-service.ts`) — pure aggregation, zero LLM calls.

## Where the request-scoped memoization pattern lives (the only cache in this system)

`entitlement-service.ts`'s `withEntitlementCache()` — `AsyncLocalStorage`-based, a fresh `Map` per call, used to collapse the ~75-Supabase-query fan-out of `getBillingOverview()` (25 features × role/subscription/override lookups) down to 2-3 real queries. If proposing a new cache anywhere in the entitlement/billing path, this is the only acceptable shape (request-scoped, never module-global, never persisted, never keyed loosely enough to leak across users). A proposal for anything else (a shared in-process cache with a TTL, a Redis cache, a cache keyed only by feature id without userId) is a regression from this established, deliberately-narrow pattern.
