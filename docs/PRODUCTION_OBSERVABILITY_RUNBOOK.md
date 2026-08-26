# Production Observability Runbook

Current state (confirmed by source audit, Phase 24 Milestone 1, unchanged
this milestone): no error-monitoring SDK, no structured logger, no
webhook-failure alerting, no health endpoint, and no uptime/alerting
integration exist anywhere in this repo. All logging is raw
`console.error`/`console.log`, captured only by whatever the hosting
platform collects (e.g. Vercel's own log retention). This is a real gap
for production but **not a launch blocker** — the application functions
correctly without any of it. This runbook exists so the gap is closed
deliberately, not accidentally.

No monitoring platform is installed by this document — per instruction,
nothing is added without explicit configuration. This is a recommendation
and incident-response reference, not an implementation.

## 1. Recommended Monitoring

| Signal | Recommended tool (pick one, not prescribed) | Why |
|---|---|---|
| Unhandled exceptions / error monitoring | Sentry (has a first-class Next.js SDK) or the hosting platform's own error tracking (e.g. Vercel's built-in error/log drains) | No `src/app/error.tsx`/`global-error.tsx` exists — an unhandled render error currently shows Next.js's default error page with zero visibility to the team |
| Uptime/liveness | Any external uptime pinger (UptimeRobot, Better Stack, etc.) hitting a health endpoint (§4) | No uptime monitoring exists today |
| Log aggregation | The hosting platform's own log drain, or a lightweight service (Logtail/Axiom/Datadog) if `console.*` output needs to be searchable beyond the platform's default retention | 189 `console.*` call sites across 158 route files today, captured only by host defaults |

## 2. Critical Alerts

These are the specific, concrete conditions worth alerting on for THIS
application, derived from its actual architecture (not a generic
checklist):

1. **Stripe webhook signature verification failure** — logged at
   `src/app/api/billing/webhooks/stripe/route.ts` and
   `src/app/api/billing/platform/webhook/route.ts`; a spike here could
   mean a misconfigured webhook secret (breaks ALL billing state sync)
   or a genuine forgery attempt.
2. **Repeated `QuotaExceededError`/`FeatureNotEntitledError` on the same
   route within a short window from many distinct IPs/users** — could
   indicate the anonymous rate limiter or platform quota tables
   (`anonymous_ai_requests`, `platform_usage_events`) are missing/broken
   (fails open per `src/lib/ai/rate-limiting/anonymous-ai-rate-limiter.ts`'s
   own documented `isMissingTableError()` fail-open design — this is
   the single most cost-relevant failure mode in the whole app, since a
   missing table silently REMOVES anonymous cost protection rather than
   blocking requests).
3. **`platform_subscriptions`/`organizations.subscriptions` webhook
   writes stalling** (a subscription stuck in `incomplete`/no update for
   an extended period after checkout) — indicates a webhook delivery or
   processing problem, not visible anywhere except by directly querying
   the table today.
4. **OpenAI API errors (429 rate limit, 5xx, timeout)** — currently just
   caught and converted to a generic 422/500 response
   (`src/app/api/ai/resume/route.ts`, `chat/route.ts`, and every other
   LLM route follow the same pattern); a sustained spike means either
   OpenAI-side degradation or the app's own `OPENAI_API_KEY` reaching a
   billing/rate limit.
5. **Admin role changes** — already audit-logged
   (`recordPlatformAdminAction()`, `platform-admin-service.ts`) but not
   alerted; an unexpected `platform.role.assigned`/`removed` audit entry
   (especially granting `ADMIN`) is worth a real-time alert, not just a
   queryable log.

## 3. Webhook Failure Detection

No dedicated mechanism exists today beyond Stripe's own dashboard
(which independently tracks delivery attempts/failures per webhook
endpoint and can itself alert via Stripe's dashboard settings — the
simplest, zero-code starting point). If deeper visibility is wanted
later: both webhook routes already `console.error` on every failure
path (`platform-billing-service.ts`'s `handlePlatformStripeWebhook()`,
`billing-service.ts`'s equivalent) — routing these specific log lines to
an alerting channel is a minimal, targeted addition once a log
aggregator is chosen (§1), not a new webhook-handling code path.

## 4. LLM Cost Monitoring

Already exists as a **read** surface, not yet as an **alert**:
`/admin/usage` (`src/app/admin/usage/page.tsx`) aggregates
`usage_tracking`/`platform_usage_events` — credits used, request counts,
failed-request counts, cost, broken down by feature/model/day. This is
the correct existing source of truth for AI cost — no new metering
system should be built. Recommended next step (not implemented here,
per "do not introduce a new observability platform without explicit
configuration"): a scheduled check (external cron or the hosting
platform's own scheduled-function feature, if used) that queries this
same data and alerts if daily spend crosses a threshold — reusing the
existing aggregation query, not a new one.

## 5. Health Checks

No `/api/health` endpoint exists. If added later, keep it minimal and
consistent with this project's own conventions: a route that confirms
(a) the process is up (trivially true if it responds at all) and
optionally (b) a single, cheap Supabase query succeeds
(`supabaseAdmin.from("organizations").select("id").limit(1)` or similar)
— do not turn it into a full dependency-health dashboard; that's what
`/admin/usage`/`/admin/analytics` are for.

## 6. Incident Response (starting point, not a full runbook)

Given no alerting exists yet, today's actual incident-response path is
manual: a report (from a user, or noticed by an admin reading logs)
leads to checking, in order: (1) the Stripe dashboard for webhook
delivery status, (2) `/admin/usage`/`/admin/analytics` for anomalous
usage, (3) the hosting platform's own log viewer for recent
`console.error` lines, (4) a direct Supabase SQL Editor query against
the relevant table (`platform_subscriptions`, `contact_messages`,
`audit_logs`, etc. — this project's own established, already-relied-upon
operational tool, per every migration file's own header). Once §1's
tooling exists, this section should be rewritten with real dashboard
links and an actual escalation path — deliberately left as a starting
point here, not fabricated as a mature process this application doesn't
yet have.
