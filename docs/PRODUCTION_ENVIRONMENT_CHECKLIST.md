# Production Environment Checklist

Exact, actionable checklist to take this codebase from CODE COMPLETE to
live in a real production environment. No secret values appear anywhere
in this document — only variable names and what they configure.

## 1. Supabase

- [ ] A Supabase project exists for production (separate from any
      dev/staging project).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
      to the production project's values.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set (server-only — never prefixed
      `NEXT_PUBLIC_`, never sent to the client).
- [ ] All 17 migrations applied, **in filename order**, via the
      Supabase SQL Editor (this project has no migration tooling — see
      each file's own header comment):
      1. `20260719000000_add_interview_review_columns.sql`
      2. `20260731000000_add_interview_diagrams_bucket.sql`
      3. `20260803000000_add_job_match_rate_limit.sql`
      4. `20260806000000_add_saas_foundation_tables.sql`
      5. `20260807000000_add_enterprise_auth_tables.sql`
      6. `20260808000000_add_billing_tables.sql`
      7. `20260809000000_add_ai_usage_metering.sql`
      8. `20260810000000_add_resume_versions.sql`
      9. `20260811000000_add_resume_versions_sections_data.sql`
      10. `20260812000000_add_resume_versions_template_settings.sql`
      11. `20260813000000_add_recruiter_persistence.sql`
      12. `20260814000000_add_recruiter_candidate_evaluation_status.sql`
      13. `20260815000000_add_recruiter_candidate_decision_history.sql`
      14. `20260816000000_add_platform_entitlement_tables.sql`
      15. `20260817000000_add_platform_billing_tables.sql`
      16. `20260818000000_add_anonymous_ai_rate_limits.sql`
      17. `20260819000000_add_contact_messages.sql` **(new, Phase 24
          Milestone 2 — not yet applied to any environment)**
- [ ] Verify (read-only `select("*").limit(1)` per table, this project's
      own established verification method — HEAD/count-style queries
      have previously given false positives here) that all 34 tables +
      1 storage bucket (`interview-diagrams`) + 3 Postgres functions
      (`ai_credits_reserve`/`commit`/`release`) exist before declaring
      the database ready.
- [ ] No RLS is enabled on any table — this is intentional, application-
      level authorization is the actual boundary (do not "fix" this).

## 2. Stripe

- [ ] A real Stripe account exists, in **live mode** for production
      (not test mode).
- [ ] `STRIPE_SECRET_KEY` set (org-scoped billing system).
- [ ] `STRIPE_WEBHOOK_SECRET` set, and a webhook endpoint registered in
      the Stripe dashboard pointing at
      `POST /api/billing/webhooks/stripe`.
- [ ] `STRIPE_PLATFORM_WEBHOOK_SECRET` set (a **different** secret from
      the one above — two independent billing systems, two independent
      webhook endpoints), registered pointing at
      `POST /api/billing/platform/webhook`.
- [ ] `STRIPE_PRICE_JOB_SEEKER_PRO`, `STRIPE_PRICE_JOB_SEEKER_PREMIUM`,
      `STRIPE_PRICE_RECRUITER_PRO`, `STRIPE_PRICE_RECRUITER_BUSINESS`
      set to real, live-mode Stripe Price IDs. (`JOB_SEEKER_FREE`/
      `RECRUITER_FREE` need no price id — not Stripe-backed.)
- [ ] No Stripe publishable key is needed — this app never loads
      Stripe.js client-side; all checkout/portal flows are server-created
      redirect URLs.
- [ ] Confirm actual dollar pricing has been decided by the business
      before creating these Price IDs — every quota/limit number in
      `platform-plan-registry.ts` is a provisional architecture default,
      not settled pricing (see the Milestone 2 report's Commercial Plan
      Review section).

## 3. OpenAI

- [ ] `OPENAI_API_KEY` set to a production key with adequate rate
      limits/billing configured on the OpenAI side for expected launch
      traffic.
- [ ] `OPENAI_BASE_URL` and `OPENAI_MODEL` confirmed correct for
      production (verify these aren't pointed at a dev/proxy endpoint).
- [ ] Confirm the OpenAI account's own spend limits/alerts are
      configured on OpenAI's side — this app's own cost protection
      (entitlement/quota/anonymous rate limiting) reduces but does not
      eliminate the value of a provider-side backstop.

## 4. Environment Variables (complete list, names only)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
PLATFORM_ADMIN_BOOTSTRAP_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PLATFORM_WEBHOOK_SECRET
STRIPE_PRICE_JOB_SEEKER_PRO
STRIPE_PRICE_JOB_SEEKER_PREMIUM
STRIPE_PRICE_RECRUITER_PRO
STRIPE_PRICE_RECRUITER_BUSINESS
```

Verify none of the above is ever prefixed `NEXT_PUBLIC_` — only
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` should be, and
both are Supabase's own intentionally-public client credentials, not
secrets in the traditional sense.

## 5. Domain

- [ ] Production domain configured and pointed at the hosting platform.
- [ ] Supabase Auth's configured Site URL / redirect URLs updated to the
      real production domain (affects OAuth callback and email
      confirmation/recovery links — currently likely set to a
      dev/localhost URL).
- [ ] Stripe Checkout `successUrl`/`cancelUrl` are built from the
      request's own origin at runtime (`platform-billing-service.ts`) —
      no separate domain configuration needed there, but confirm the app
      is served over HTTPS in production (required by Stripe).

## 6. Authentication

- [ ] OAuth providers (Google/Microsoft/GitHub/LinkedIn), if used,
      configured with real production Client ID/Secret in the Supabase
      dashboard (Authentication → Providers) — code-ready but each
      provider only becomes usable once configured there; not an env
      var in this repo.
- [ ] Confirm `PLATFORM_ADMIN_BOOTSTRAP_SECRET` is set to a real, random,
      production-only value — different from any value used in
      development.

## 7. Admin Bootstrap

- [ ] After the app is live and the intended first admin has signed up
      normally (email/password or OAuth), have that person call
      `POST /api/admin/bootstrap` with the secret in the
      `x-bootstrap-secret` request header (not the body — the route
      never parses one). This can only ever promote the caller's own
      account — never use it to promote a different account.
- [ ] Rotate/remove `PLATFORM_ADMIN_BOOTSTRAP_SECRET` awareness once the
      intended admin(s) are bootstrapped, if the business wants to
      reduce the window this mechanism is usable (the endpoint itself
      has no time-based expiry — it remains callable indefinitely by
      anyone who knows the secret and has a session).

## 8. Webhook Configuration

Covered in §2 — both Stripe webhook endpoints must be registered
separately in the Stripe dashboard, each with its own signing secret.
No other webhook consumers exist in this application.

## 9. Migrations

Covered in §1. Re-stated here for emphasis: **migration #17
(`add_contact_messages.sql`) is new as of this milestone and has not
been applied anywhere yet**, including the environment this audit ran
against — `POST /api/contact` will return a 500 (correctly, by design —
see the Milestone 2 report) until it is applied.

## 10. Storage

- [ ] `interview-diagrams` storage bucket exists (created by migration
      #2) — confirmed already present in the environment this audit ran
      against.
- [ ] No other storage bucket is used by this application.

## 11. Backups

Supabase provides automatic backups on paid tiers as a platform feature
— confirm the production Supabase project is on a plan that includes
this, and confirm the actual retention window/restore process with
Supabase's own documentation for the plan tier chosen. This repository
does not implement or document its own backup mechanism (correctly —
that would duplicate what the managed database already provides).

## 12. Deployment

No deployment config is committed to this repo (no `vercel.json`, no
`Dockerfile`) — this is a documented, deliberate gap (see `CLAUDE.md`).
`npm run build && npm run start` works for any Node-capable host; Vercel
is the README's suggested default with zero extra config needed for a
standard Next.js app. Choose a host and follow its own standard Next.js
deployment guide — do not invent a custom pipeline unless the business
specifically wants one.

## 13. Rollback

No rollback tooling exists in this repo. The practical rollback path
today is whatever the chosen hosting platform provides natively (e.g.
Vercel's own "promote a previous deployment" feature) — this requires no
code or config in this repository, only using the host's own dashboard.
Database migrations in this project are additive/idempotent
(`if not exists`/`create or replace`) by convention — there is no
"down" migration for any file; a schema rollback would need to be
written by hand if ever required, which has not happened in this
project's history.
