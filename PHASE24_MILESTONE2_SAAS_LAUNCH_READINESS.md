# Phase 24 — Milestone 2: SaaS Launch Preparation & Monetization Execution

## 1. Executive Summary

Phase 24 M1 classified the engineering as **B — Production Ready with
Minor Prerequisites**. This milestone converts that into launch
mechanics: a customer-facing commercial plan structure, three
operational/legal reference documents, and one genuine, minimal code fix
(the contact form no longer silently discards submissions).

**One defect was found and fixed**: `/api/contact` previously only
`console.log`'d a submission and always claimed success — a real
visitor's message was invisible beyond an ephemeral log line, with no
durable record and no honest failure signal. Fixed with the safest
minimal change reachable using existing architecture (no new external
email provider — none is configured anywhere in this repo, and adding
one is a business decision): a new `contact_messages` table + a route
change that persists the message and fails closed (an honest error) if
the write fails, since this is a primary action, not secondary
bookkeeping.

Three reference documents were created: `docs/SAAS_LEGAL_REQUIREMENTS.md`,
`docs/PRODUCTION_OBSERVABILITY_RUNBOOK.md`, and
`docs/PRODUCTION_ENVIRONMENT_CHECKLIST.md`.

No other code was changed. Everything else audited this milestone
(billing UX, monetization matrix, AI cost protection, customer
onboarding, authentication entry points) was re-confirmed correct and
unchanged from Phase 23/24 M1's already-exhaustive findings — not
re-derived from scratch, per this milestone's own instruction not to
reopen that work.

## 2. Commercial Plan Review

Mechanically read fresh from `platform-plan-registry.ts` (current
source, not a prior summary). **Every quota number below is a
provisional architecture default, not settled pricing — explicitly
documented as such in the registry's own header comment.** All monthly/
annual dollar prices are marked **BUSINESS DECISION REQUIRED** — no
price exists anywhere in this codebase to report; only Stripe Price ID
*references* (`STRIPE_PRICE_JOB_SEEKER_PRO`, etc.) exist, and those
Price IDs themselves are configured in Stripe, not this repo.

### Job Seeker

| | Free | Pro | Premium |
|---|---|---|---|
| Monthly price | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** |
| Annual price | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** |
| Resume Builder/Templates/Versions/Export | Unlimited | Unlimited | Unlimited |
| ATS Score | 5/month | 50/month | Unlimited |
| JD Matching | 5/month | 50/month | Unlimited |
| Resume Optimization | Not included | Unlimited | Unlimited |
| Resume Rewriting | Not included | 30/month | Unlimited |
| AI Resume Assistant (chat) | Not included | 300 messages/month | 2,000 messages/month |
| LinkedIn Optimizer | Not included | 30/month | Unlimited |
| Job Match | 5/month | 50/month | Unlimited |
| Job Description Analyzer | 5/month | 50/month | Unlimited |
| Cover Letter Generator | 3/month | 30/month | Unlimited |
| Interview Preparation | 3/month | 15/month | Unlimited |
| Mock Interview | 2/month | 15/month | Unlimited |
| Interview Debrief / Progress / Study Plan | Not included | Unlimited | Unlimited |
| **Upgrade path** | → Pro or Premium via `/settings/billing` | → Premium via Stripe Billing Portal (direct Pro→Premium checkout is blocked by design — duplicate-subscription prevention; upgrades go through the portal) | (top tier) |

### Recruiter

| | Free | Pro | Business |
|---|---|---|---|
| Monthly price | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** |
| Annual price | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** | **BUSINESS DECISION REQUIRED** |
| Recruiter Workspace / Job Management | Unlimited | Unlimited | Unlimited |
| Candidate Import + Ranking (shared quota) | 25/month | 200/month | Unlimited |
| Candidate Analytics | Not included | Unlimited | Unlimited |
| Candidate Shortlisting | Not included | Unlimited | Unlimited |
| Interview Pipeline | Not included | Unlimited | Unlimited |
| Candidate Export | Not included | 50/month | Unlimited |
| Hiring Decision Reports | Not included | Not included | Unlimited |
| **Upgrade path** | → Pro or Business via `/settings/billing` (role self-activated on first checkout attempt, Phase 23 M4) | → Business via Stripe Billing Portal | (top tier) |

**UI terminology verified against the entitlement registry**: `/settings/billing`'s
"Enabled Features" list and plan-comparison grid render
`FEATURE_REGISTRY[featureId].label` directly (`src/app/settings/billing/page.tsx`,
`PlanComparison.tsx`) — there is no second, hand-maintained label list
that could drift out of sync with the registry. The table above uses
those exact registry labels.

**Discrepancy note (already classified as a product decision in Phase
23, restated here for completeness, not re-litigated)**: `interview.study_plan`
shows "Not included" on Free above per the registry, but the study plan
is currently delivered as part of the already-gated Interview
Preparation report regardless of tier — the Free-tier restriction is
inert today. Business should decide whether to enforce it or remove the
distinction from the plan table.

## 3. Billing UX

Re-confirmed unchanged from Phase 23 M3/M5 (no billing UI file was
modified this milestone): `/settings/billing` shows current plan (per
role held), usage against each relevant metric with reset-date
descriptions, an upgrade CTA (role-filtered plan comparison — a
JOB_SEEKER-only account never sees a Recruiter plan card and vice
versa), and "Manage Subscription" → Stripe Billing Portal for
downgrade/cancellation. The recruiter experience is the same page,
same component, filtered by role — verified this is not a separate,
divergent implementation. Organization billing (`/billing`) remains a
structurally separate page/layout with its own empty state and a
cross-link back to personal billing (Phase 23 M3 fix) — the two systems
are not merged, and this milestone did not touch either.

## 4. Legal Artifacts

Terms of Service, Privacy Policy, and refund-policy text do not exist in
the codebase (confirmed fresh, same result as Phase 24 M1). Per explicit
instruction, no legal language was invented. Full inventory, purpose,
and exact UI placement for each artifact — plus the data business/legal
needs to supply — is in **`docs/SAAS_LEGAL_REQUIREMENTS.md`** (new this
milestone).

## 5. Contact / Support — Fix Implemented

**Defect**: `POST /api/contact` (`src/app/api/contact/route.ts`)
unconditionally returned `{success: true}` after only a `console.log` —
no durable record, no failure signal, a real visitor's message could be
permanently lost with the sender told it succeeded.

**Fix** (minimal, no new external dependency): 
- New migration `supabase/migrations/20260819000000_add_contact_messages.sql`
  — a `contact_messages` table (id, name, email, message, created_at),
  no RLS (consistent with every other table in this project — the
  service-role route is the only writer).
- `src/app/api/contact/route.ts` now inserts via `supabaseAdmin` and
  **fails closed** (returns a real error) if the write fails — this is
  the message's only purpose (a primary action, unlike login bookkeeping
  which correctly fails open because a prior action already succeeded),
  so pretending success on a failed write would be dishonest.
- `src/components/contact/ContactForm.tsx` already correctly checks
  `response.ok` and shows a generic failure message — no client change
  needed.

No email provider was added — none exists anywhere in this repo
(confirmed by Phase 24 M1's grep for nodemailer/sendgrid/resend/mailer,
zero matches), and adding one is explicitly a business decision (which
provider, whose inbox) this audit should not make unilaterally. Until a
provider is chosen, submissions are durably queryable via the Supabase
SQL Editor — this project's own already-established operational tool.

**This migration has not been applied to any environment yet** — until
it is, the route will correctly return a 500 rather than the previous
(silently broken) fake success. See §17/§18 for the exact operational
step required, and `docs/PRODUCTION_ENVIRONMENT_CHECKLIST.md` §9.

## 6. Observability

No new monitoring platform was installed, per explicit instruction. A
recommendation-and-incident-response reference,
**`docs/PRODUCTION_OBSERVABILITY_RUNBOOK.md`** (new this milestone),
documents exactly what's missing (error monitoring, webhook-failure
alerting, health endpoint — all confirmed absent, unchanged from Phase
24 M1), what already exists and should be reused rather than duplicated
(`/admin/usage`/`/admin/analytics` for cost/usage visibility), and the
specific alert conditions worth watching for this application's own
architecture (webhook signature failures, anonymous-rate-limit
fail-open scenarios, stalled subscription webhooks, OpenAI errors, admin
role-change events).

## 7. Production Environment Checklist

**`docs/PRODUCTION_ENVIRONMENT_CHECKLIST.md`** (new this milestone)
covers Supabase, Stripe, OpenAI, the complete environment-variable list
(names only), domain/Auth redirect configuration, admin bootstrap,
webhook registration, the now-17-file migration order (including the new
contact-messages migration), storage, backups, deployment, and rollback
— consolidated from this milestone's and Phase 24 M1's findings into one
actionable, checkbox-style document.

## 8. Customer Onboarding

Re-confirmed unchanged from Phase 23 M3/M5: the homepage
(`ProductEntryPoints.tsx`) exposes both "For Job Seekers" →
`/resume-analyzer` and "For Recruiters" → `/recruiter` entry points with
one-line descriptions of what each unlocks (resume analysis/ATS/job
matching/interview prep for job seekers; candidate import/screening/
ranking/shortlisting for recruiters), immediately below the hero. The
static nav (`Navbar.tsx`) additionally exposes direct links to Resume
Analyzer, Job Match, Recruiter, and Billing at every breakpoint (desktop
inline, mobile via the hamburger toggle, Phase 23 M3). This already
satisfies "what can I do here?" for both personas without further
change — no navigation or onboarding defect was found. No homepage
redesign was performed, per explicit instruction.

## 9. Authentication Entry Point

Re-confirmed unchanged from Phase 23 M3/M5/M6, spot-checked live this
milestone: homepage shows Login/Sign Up at every breakpoint
(`AuthCta`/`MobileNav`). Persona-aware landing (`resolveDefaultLandingPath()`,
wired through password login, all 3 MFA-verify routes, OAuth callback,
and password reset) sends JOB_SEEKER → `/resume-analyzer`, RECRUITER →
`/recruiter`, multi-role deterministically prioritizes RECRUITER,
ADMIN-only → `/resume-analyzer` (no special-cased admin landing — admin
reaches `/admin` via direct URL/nav, unchanged by design). Existing
RECRUITER signup → recruiter landing is correct because RECRUITER is
never assignable before an account exists (self-service activation only
happens post-first-login) — a brand-new signup is always JOB_SEEKER by
construction, so this is not a gap. **No defect found.**

## 10. Monetization Conversion Flow

Traced conceptually (source-level, unchanged from Phase 23 M4/M5/M6, not
re-derived): Free user hits a `requireFeature`/`requireQuota` rejection
→ route returns the structured `entitlementErrorResponse()` shape →
client's `readEntitlementError()` renders `UpgradePrompt` with the
correct code/plan-name hint/usage info → user clicks through to
`/settings/billing` → selects a plan → `POST /api/billing/platform/checkout`
(role self-activated first if RECRUITER, Phase 23 M4 fix) → Stripe
Checkout → `checkout.session.completed`/`customer.subscription.*`
webhook → `platform_subscriptions` upsert → next `resolveEffectivePlans()`
call picks it up → feature access unlocked. Every link in this chain was
independently source-verified across Phase 23 M4-M6; this milestone
re-confirmed via `git diff` that zero files in the billing/entitlement
layer changed since M6's clean validation, so the chain is unchanged.

**Live Stripe E2E unavailable because credentials are not configured**
(confirmed again this milestone — zero `STRIPE_*` env vars). No
checkout/webhook test was fabricated.

## 11. AI Cost Control (Regression Check Only)

Per explicit instruction, not re-audited exhaustively. Confirmed via
`git diff` that zero files under `src/app/api/ai/**`, `src/lib/ai/**`,
or `src/lib/billing/entitlement-service.ts` changed since Phase 23 M6's
clean, exhaustive validation (9/9 LLM-generating recruitment routes
gated, 87 entitlement call sites correctly ordered, usage recorded
exactly once, anonymous rate limiting intact). **No regression
detected; no defect found.**

## 12. Account / Data Lifecycle

| Capability | Classification | Evidence |
|---|---|---|
| Account deletion | **IMPLEMENTED** | `/settings/profile` → Danger Zone → `DELETE /api/auth/profile` → `deleteAccount()` |
| Resume deletion | **IMPLEMENTED** | `DELETE /api/ai/resume/versions/[id]` |
| Candidate deletion | **IMPLEMENTED** | `DELETE /api/ai/recruiter/candidates/[candidateId]` |
| Personal data export | **IMPLEMENTED** | `/settings/profile` → "Download Personal Data" → `GET /api/auth/profile/export` |
| Subscription cancellation | **IMPLEMENTED** | Stripe Billing Portal via `/settings/billing` → "Manage Subscription" |
| Recruiter deactivation | **MISSING** | No code path removes/suspends the RECRUITER role from one's own account (only an ADMIN can remove a role from another user, `removePlatformRole()`) — a recruiter can only stop paying (cancel subscription, falls back to `RECRUITER_FREE`), not fully deactivate the persona itself |
| Compliance sufficiency (GDPR/CCPA-style) of the above | **BUSINESS/LEGAL DECISION** | Whether these existing mechanisms satisfy specific regulatory obligations is not a code question this audit can answer |

## 13. Launch Scorecard

| Category | Status | Blocker | Action |
|---|---|---|---|
| Code | 🟢 GREEN | None | — |
| Database | 🟢 GREEN | None — all 34 tables, 1 bucket, 3 functions live | Apply the 1 new migration (§5) before relying on `/contact` |
| Authentication | 🟢 GREEN | None | Confirm production OAuth redirect URLs before go-live |
| Billing (platform) | 🟢 GREEN | None (code) | — |
| Billing (organization) | 🟢 GREEN | None (code) | — |
| Stripe | 🔴 RED | Zero credentials configured | Configure per `docs/PRODUCTION_ENVIRONMENT_CHECKLIST.md` §2 |
| AI cost protection | 🟢 GREEN | None | — |
| Admin | 🟢 GREEN | None — 1 admin already bootstrapped in this environment | — |
| Job seeker journey | 🟢 GREEN | None | — |
| Recruiter journey | 🟢 GREEN | None | — |
| Legal | 🔴 RED | ToS/Privacy/refund policy do not exist | Business/legal to supply content per `docs/SAAS_LEGAL_REQUIREMENTS.md` |
| Support | 🟡 YELLOW | Contact form now durable (fixed); no support email published; no real email notification yet | Publish a support email in the footer; decide a mail provider if desired |
| Observability | 🟡 YELLOW | No error monitoring/alerting/health endpoint | Optional before launch, recommended before scale — see runbook |
| Backup | 🟢 GREEN | Supabase-managed on paid tiers | Confirm production project's plan tier includes this |
| Monitoring (cost/usage) | 🟢 GREEN | `/admin/usage`/`/admin/analytics` already exist | — |
| Marketing readiness | 🟡 YELLOW | Homepage/onboarding is functionally correct; no AI-disclosure copy; no pricing page with real $ amounts yet | Publish real pricing once decided (§2); consider AI-disclosure copy per legal review |

## 14. Defects Discovered

One, described in full in §5: `/api/contact` silently discarded
submissions while claiming success.

## 15. Fixes Made

One, described in full in §5. Regression tests added
(`src/app/api/contact/route.test.ts`, 3 tests: rejects incomplete
input before touching the database, persists successfully, proves a
persistence failure is reported rather than swallowed). Registered in
`vitest.config.mts`'s `include` list.

## 16. Operational Blockers (unchanged categories from Phase 24 M1, restated with this milestone's precision)

1. Stripe configuration (§13, RED).
2. Legal artifact content — ToS/Privacy/refund policy (§13, RED).
3. The new `contact_messages` migration needs applying (§5, §9 of the
   environment checklist) before `/contact` is genuinely functional in
   any environment, including the one this audit ran against.
4. Support email / help-center link not yet published anywhere in the
   UI (§13, YELLOW).
5. Observability tooling — recommended, not blocking (§13, YELLOW).

## 17. Validation Results

```
npx tsc --noEmit    -> clean, zero errors
npm run lint         -> 1 pre-existing warning (unrelated: <img> in blog/[slug]), 0 errors
npm test              -> 112 files, 1263/1263 tests passing (3 new)
npm run build         -> exit 0, all routes compiled
.claude/skills/verification/verify.sh -> TSC/LINT/TESTS/BUILD: PASS
                                          SECURITY SCAN: PASS (475 files, 1 pre-existing false-positive, unchanged)
                                          CODE-QUALITY SCAN: PASS WITH ADVISORY WARNINGS (13 pre-existing findings, unchanged)
```

## 18. Final Decision

No P0/P1/P2 code defect remains (the one defect found, §5, is fixed and
regression-tested). **No further engineering milestone is proposed.**

### Final launch checklist

1. Apply `20260819000000_add_contact_messages.sql` (new).
2. Complete `docs/PRODUCTION_ENVIRONMENT_CHECKLIST.md` in full for the
   real production environment.
3. Configure Stripe (credentials, webhooks, price IDs) once pricing is
   decided.
4. Publish Terms of Service, Privacy Policy, and refund-policy copy once
   legal supplies content (`docs/SAAS_LEGAL_REQUIREMENTS.md`).
5. Publish a support email/help-center link in the footer.
6. (Recommended, not blocking) Stand up error monitoring and a health
   endpoint per `docs/PRODUCTION_OBSERVABILITY_RUNBOOK.md`.

### Business decisions required

- Actual dollar pricing for all 6 paid tiers (§2).
- Whether `interview.study_plan`'s Free-tier restriction should be
  enforced or removed from the plan table (§2, carried from Phase 23).
- Whether removing RECRUITER should also cancel the Stripe subscription
  (carried from Phase 23 M4-M6, unchanged, not re-decided here).
- Refund/cancellation policy terms; AI-disclosure requirements; which
  (if any) email provider to adopt for contact/notifications.
- Whether "recruiter deactivation" (distinct from cancellation) is a
  feature the business wants (§12).

### Operational configuration required

Everything in `docs/PRODUCTION_ENVIRONMENT_CHECKLIST.md` — Stripe
credentials, production Supabase project confirmation, domain/Auth
redirect URLs, the one new migration, admin bootstrap for the real first
admin.

### Recommended launch sequence

1. Legal content finalized and published (blocking for real signups).
2. Stripe fully configured and price IDs created against final pricing
   (blocking for monetization).
3. Apply the new migration; verify the full environment checklist.
4. Soft-launch (real users, real payments) with observability tooling
   in place if the business wants visibility from day one — not
   strictly blocking, but strongly preferable before real revenue flows.
5. Public launch / marketing push once support email and pricing page
   are live.

### What can launch immediately

The application itself — every customer journey, entitlement/quota
enforcement, IDOR protection, and the newly-fixed contact form (once its
one migration is applied) — is code-complete and ready.

### What must wait

Real monetization (needs Stripe credentials + decided pricing) and
public launch under real legal terms (needs ToS/Privacy Policy content)
must wait on the business/legal decisions above — these are not
engineering work remaining.

Nothing in this milestone has been committed.
