# Phase 24 — Final Launch Execution Gate

Read-only verification against the live, connected environment. No code
was changed, no destructive operation was performed, no secret value is
printed anywhere in this document. This is the final gate before opening
the product to real customers — the engineering milestone cycle closes
here.

## 1. What Is Already Production-Ready

- **Database**: all 34 tables, the 1 storage bucket, and all 3 Postgres
  credit-reservation functions are live and verified — including
  `contact_messages`, which has been applied since Milestone 2 (see §5).
- **Code**: every customer journey (job seeker, recruiter, admin),
  entitlement/quota enforcement, IDOR protection, and persona-aware
  routing was re-confirmed via live probes this session — zero
  regressions found anywhere.
- **Admin**: one real ADMIN account already exists in this environment;
  the bootstrap mechanism itself is safe and unchanged.
- **Contact form**: now genuinely persists submissions — live-tested
  end-to-end this session (a real row was written and read back, then
  removed as test cleanup).
- **AI cost protection, webhook security, entitlement resolution**: all
  previously verified exhaustively (Phase 23) and re-confirmed
  unregressed (Phase 24 M1/M2, this gate).

## 2. Exact Launch Blockers

| # | Blocker | Type |
|---|---|---|
| 1 | Stripe is completely unconfigured (zero credentials) | Operational |
| 2 | Terms of Service, Privacy Policy, refund/cancellation policy text do not exist | Legal |
| 3 | No support email or help-center link is published anywhere in the UI | Operational (minor) |

Nothing on this list is a code defect. All three are addressed below
with an exact procedure or an exact checklist to hand to the
business/legal owner.

## 3. Manual Actions Required

1. Configure Stripe end-to-end (§6 below, exact sequence).
2. Apply nothing further to Supabase — already fully applied and
   verified (§9).
3. Publish a support email/help-center link in the footer once decided.
4. Confirm the production Supabase project's Auth Site URL/redirect
   URLs are set to the real domain (affects OAuth callback and
   email-confirmation/recovery links) before go-live.

## 4. Business Decisions Required

See §8 for the full commercial checklist. Summary:
- Real dollar pricing for all 6 paid tiers (Job Seeker Pro/Premium,
  Recruiter Pro/Business) — nothing in the codebase has a price, only
  provisional quota numbers.
- Whether `interview.study_plan`'s Free-tier restriction should be
  enforced (currently inert — delivered regardless of tier) or removed
  from the plan comparison.
- Whether removing a user's RECRUITER role should also cancel their
  Stripe subscription (unresolved since Phase 23 M4).
- Which email provider, if any, should back contact-form notifications
  and future transactional email.

## 5. Legal Decisions Required

Per `docs/SAAS_LEGAL_REQUIREMENTS.md` (source of truth — not rewritten
here):

```
[ ] Terms of Service              — BUSINESS/LEGAL ACTION REQUIRED (does not exist)
[ ] Privacy Policy                — BUSINESS/LEGAL ACTION REQUIRED (does not exist)
[ ] Refund/Cancellation Policy    — BUSINESS/LEGAL ACTION REQUIRED (mechanism works; no policy text exists)
[ ] AI disclosure                 — BUSINESS/LEGAL ACTION REQUIRED (marketing copy only, no formal disclosure)
[ ] Data deletion policy          — BUSINESS/LEGAL ACTION REQUIRED (the underlying capability IS implemented — account/resume/candidate deletion + data export all work; only the published policy TEXT describing it is missing)
[ ] Contact/support information   — PARTIAL (form now works, §5 of this doc; no support email published)
```

No legal language was written by this audit, per explicit instruction.

## 6. Stripe Setup Required

**Confirmed this session: zero `STRIPE_*` environment variables are
present.** Live Stripe E2E is BLOCKED — no checkout/webhook/payment test
was performed or fabricated.

Exact manual sequence:

1. **Products** — in the Stripe Dashboard, create 4 products: Job
   Seeker Pro, Job Seeker Premium, Recruiter Pro, Recruiter Business
   (Free tiers need no Stripe product — they're not Stripe-backed).
2. **Prices** — attach one recurring price per product (monthly, and
   annual if the business wants an annual option — both need real
   dollar amounts decided first, §8).
3. **Webhook** — register **two** separate webhook endpoints (this app
   has two independent billing systems):
   - `POST https://<production-domain>/api/billing/webhooks/stripe`
     (organization billing)
   - `POST https://<production-domain>/api/billing/platform/webhook`
     (platform/personal billing — the one that governs Job Seeker/
     Recruiter plans)
4. **Environment variables** — set (names only, this document prints no
   values): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (org endpoint's
   signing secret), `STRIPE_PLATFORM_WEBHOOK_SECRET` (platform
   endpoint's own, different signing secret), `STRIPE_PRICE_JOB_SEEKER_PRO`,
   `STRIPE_PRICE_JOB_SEEKER_PREMIUM`, `STRIPE_PRICE_RECRUITER_PRO`,
   `STRIPE_PRICE_RECRUITER_BUSINESS`. No publishable key is needed — this
   app never loads Stripe.js client-side (confirmed, Phase 24 M1).
5. **Checkout** — no code change needed; `POST /api/billing/platform/checkout`
   already creates a real Checkout Session once the above is configured.
6. **Portal** — no code change needed; `createBillingPortalSession()`
   already works once a real Stripe customer exists.
7. **Test payment** — once live, perform one real test-mode (or a real
   $-amount live-mode, business's choice) checkout manually through the
   actual UI (`/settings/billing` → select a plan) to confirm the whole
   chain end-to-end. This audit could not perform this step — no
   credentials exist in this environment.
8. **Webhook** — confirm in the Stripe Dashboard that the test
   checkout's `checkout.session.completed` and
   `customer.subscription.created` events show a successful (2xx)
   delivery to the platform endpoint.
9. **Entitlement** — confirm the test account's `/settings/billing` page
   now shows the paid plan and the corresponding feature becomes usable
   (e.g. a Recruiter Pro purchase unlocks `recruiter.analytics`).

## 7. Supabase Actions Required

**None — fully verified this session, read-only:**

```
Tables:            34/34 EXISTS (including contact_messages)
Storage bucket:    interview-diagrams EXISTS
Postgres functions: ai_credits_reserve / ai_credits_commit / ai_credits_release — all 3 EXIST (verified by real execution, not just a metadata probe)
Migrations:        all 17 files applied
```

No further Supabase action is required before launch. If deploying this
same codebase to a **different, fresh** Supabase project in the future,
apply all 17 migration files in filename order via the SQL Editor first
— this environment does not need that step repeated.

## 8. Business Decision Checklist — Commercial Plans

Every quota number is the current, live provisional default from
`platform-plan-registry.ts` (unchanged since Milestone 2's mechanical
derivation — not re-decided here). Every price is unset in the
codebase by design.

### Job Seeker

| | Free | Pro | Premium |
|---|---|---|---|
| Monthly price | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** |
| Annual price | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** |
| AI Assistant (chat) quota | Not included | 300 msgs/mo | 2,000 msgs/mo |
| Resume quota (ATS/JD Match) | 5/mo each | 50/mo each | Unlimited |
| Resume Optimize / Rewrite | Not included / Not included | Unlimited / 30/mo | Unlimited / Unlimited |
| Interview Prep quota | 3/mo | 15/mo | Unlimited |
| Mock Interview quota | 2/mo | 15/mo | Unlimited |
| Cover Letter / LinkedIn Optimizer | 3/mo / Not included | 30/mo / 30/mo | Unlimited / Unlimited |
| Included features | Builder/templates/versions/export always unlimited on every tier | + optimize, debrief, progress, study plan | Everything unlimited except AI Assistant (capped, not unlimited) |

### Recruiter

| | Free | Pro | Business |
|---|---|---|---|
| Monthly price | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** |
| Annual price | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** |
| Candidate quota (import + ranking, shared) | 25/mo | 200/mo | Unlimited |
| Export quota | Not included | 50/mo | Unlimited |
| Analytics / Shortlist / Interview Pipeline | Not included (all three) | Unlimited (all three) | Unlimited (all three) |
| Hiring Decision Reports | Not included | Not included | Unlimited |
| Included features | Workspace + job posting always unlimited on every tier | + analytics, shortlist, interview, capped export | Everything unlimited |

No pricing value was chosen by this audit. Business must supply all
cells marked **BUSINESS DECISION REQUIRED** before Stripe Products/
Prices (§6) can be created.

## 9. Production Environment Status

```
Supabase:            CONFIGURED — URL + anon key + service-role key all present; all schema verified live (§7)
Stripe:               NOT CONFIGURED — zero credentials (§6)
OpenAI:               CONFIGURED — API key, base URL, and model all present
Authentication:        Supabase Auth active; admin bootstrap secret configured (§10); OAuth provider setup status not independently checkable from this repo (configured per-provider in the Supabase dashboard, not an env var here) — confirm before launch if OAuth login is expected to work
Domain:                 not verified by this audit (outside repo scope) — confirm production Auth redirect URLs point at the real domain before go-live
Admin bootstrap:        already completed for this environment — 1 real ADMIN account exists (§10)
Storage:                interview-diagrams bucket EXISTS
Migrations:             17/17 applied, verified live (§7)
```

No secret value was displayed anywhere in this verification.

## 10. Admin Bootstrap Procedure

**Already complete for this environment** — verified fresh this session:
2 total users, 1 holds `ADMIN`, `PLATFORM_ADMIN_BOOTSTRAP_SECRET` is
configured. No bootstrap action was performed by this audit.

For reference, if a **different** environment ever needs its first
admin: sign up/log in normally as the intended admin account, then send

```
POST /api/admin/bootstrap
Header: x-bootstrap-secret: <the configured secret>
```

(the secret goes in the header, never the request body — the route
never parses one). This can only ever promote the caller's own account,
never a different one. Not performed here since it's already done.

## 11. Final Launch Scorecard

| Category | Status | Notes |
|---|---|---|
| Code | 🟢 GREEN | Zero regressions found this session |
| Database | 🟢 GREEN | 34/34 tables, bucket, 3 functions, all verified live |
| Authentication | 🟢 GREEN | Working; confirm OAuth provider + redirect URL config for production domain |
| Stripe | 🔴 RED | Zero credentials — launch blocker for monetization |
| Billing (platform + org) | 🟢 GREEN | Code correct, role-filtered UI correct, cannot process real money until Stripe is configured |
| AI cost control | 🟢 GREEN | Re-verified unregressed |
| Admin | 🟢 GREEN | Bootstrapped, working |
| Job Seeker journey | 🟢 GREEN | Live-probed this session, no regression |
| Recruiter journey | 🟢 GREEN | Live-probed this session, no regression |
| Legal | 🔴 RED | ToS/Privacy/refund policy do not exist — launch blocker for accepting real users |
| Contact | 🟢 GREEN | Fixed and live-verified end-to-end this session |
| Observability | 🟡 YELLOW | See §12 classification below |
| Backup | 🟢 GREEN | Supabase-managed on paid tiers; confirm plan tier |
| Monitoring (usage/cost) | 🟢 GREEN | `/admin/usage`/`/admin/analytics` already live |
| Support | 🟡 YELLOW | No support email/help-center link published yet |

## 12. Post-Launch Monitoring Checklist

From `docs/PRODUCTION_OBSERVABILITY_RUNBOOK.md`, classified by urgency:

**REQUIRED BEFORE SCALE** (not before an initial soft-launch, but before
meaningful real traffic/revenue):
- Stripe webhook failure visibility beyond `console.error` (currently
  only Stripe's own dashboard sees delivery failures).
- Error monitoring for unhandled exceptions (no `error.tsx`/Sentry-class
  tool exists today).

**RECOMMENDED**:
- A `/api/health` endpoint for uptime monitoring (does not exist).
- LLM-failure-specific alerting (OpenAI 429/5xx currently just becomes a
  generic error response).
- Alerting on the anonymous-rate-limiter's documented fail-open path
  (a missing `anonymous_ai_requests` table silently removes anonymous
  cost protection rather than blocking requests — worth knowing
  immediately if it ever regresses).

**OPTIONAL**:
- Structured/aggregated logging beyond raw `console.*`.
- A formal backup/DR runbook (Supabase already manages this on paid
  tiers).
- CI/CD rollback tooling (none exists; the hosting platform's own
  rollback feature, e.g. Vercel's "promote a previous deployment," is
  the practical path today — see §13).

None of the above blocks an initial launch; all are genuinely absent and
should be deliberately scheduled, not silently skipped.

## 13. Rollback Plan

No custom rollback tooling exists in this repository (no CI/CD config,
no deployment scripts) — this is a documented, deliberate gap. The
practical rollback path is whatever the chosen hosting platform provides
natively (e.g. redeploying a previous build/commit through the host's
own dashboard). Database migrations in this project are additive/
idempotent by convention (`if not exists`/`create or replace`, never a
destructive rewrite) — there is no "down" migration for any of the 17
files, and none has ever been needed. If a genuine schema rollback is
ever required, it must be written by hand at that time; nothing in this
audit fabricates one that doesn't exist.

## 14. Final GO / NO-GO Recommendation

**Conditional GO.**

The engineering product is real, correct, and ready — every journey,
every entitlement check, every security boundary, and the database
itself were independently re-verified this session with zero
regressions and zero fabricated results. Nothing here is an engineering
blocker.

**Two hard blockers remain, both entirely outside engineering**: Stripe
must be configured before a single dollar can be processed (§6), and
Terms of Service / Privacy Policy must be published before accepting
real users and their personal data (§5). Until both are resolved, this
is **NO-GO for a public, monetized launch** — but the application is
fully capable of a **soft/internal launch today** (real signups, full
job-seeker and recruiter functionality, admin oversight) with billing
and public marketing withheld until Stripe and legal content are ready.

**Recommended sequence**: (1) finalize pricing and publish legal
content in parallel, (2) configure Stripe against the finalized pricing
and run one real manual checkout end-to-end, (3) publish a support
contact, (4) go live publicly. Observability items in §12 marked
"required before scale" should land before or immediately alongside
step 4, not after.

**The engineering milestone cycle is CLOSED.** No Phase 25 is proposed —
every remaining item is operational, legal, or commercial, exactly the
category this gate was instructed to hand off rather than convert into
more engineering work. Nothing in this session has been committed.
