# Phase 23 — Milestone 5: End-to-End Persona, Billing & Customer Journey Production Readiness Audit

## 1. Executive Summary

This milestone re-audited the complete JOB_SEEKER and RECRUITER lifecycle
from scratch, per explicit instruction not to trust M1-M4's conclusions.
Three parallel fresh investigations (raw-error-UI exposure, a mechanical
entitlement-matrix cross-check, and a from-source re-trace of the
auth/landing wiring) surfaced **one severe (P0) defect and several real
P1/P2 defects that had not been found in any prior milestone.**

**P0 — genuine cost/security defect, fixed**: the entire
`src/app/api/ai/recruitment/**` legacy pipeline tree (distinct from the
real `src/app/api/ai/recruiter/**` workspace) contained **8 routes making
real, uncapped OpenAI calls with zero session check and zero entitlement
check** — reachable by any unauthenticated caller on the internet who
knew or guessed a job/candidate/interview id. Fixed using the exact
precedent CLAUDE.md already sanctions for this subsystem (the one
previously-fixed `interview-readiness` route): add `requireRecruiterId()`
+ `requireFeature()`, nothing more.

**P1 — broken customer journey, fixed**: four client components
(including the app's primary entry point, resume upload) showed a raw
generic error string instead of `UpgradePrompt` when a real, reachable
entitlement/quota rejection occurred — a Free-tier user hitting their
5/month ATS-check limit, mock-interview debrief/progress, or JD
re-optimization got a dead-end error with no explanation or upgrade path.

**P2 — incomplete/inconsistent wiring, fixed**: the persona-aware
post-login landing (M3) was never wired into the password-reset
completion path — an *existing* RECRUITER resetting a forgotten password
landed on `/resume-analyzer` instead of `/recruiter`, inconsistent with
every other completion path.

**No genuine defect was found** in webhook lifecycle, chat-entitlement
gating, multi-role resolution, IDOR protection, or the personal/org
billing separation — all re-verified fresh and confirmed correct.

**All 22 relevant Supabase tables checked are live and applied** (a
broader, independently re-verified check than M4's 11-table sample).
Stripe remains unconfigured in this environment (confirmed fresh, zero
`STRIPE_*` env vars). No secret is exposed to the client.

## 2. Job Seeker Journey Result

Re-traced signup → login → Resume Analyzer → versions → JD matching →
optimizer/rewriter → interview prep → mock interview → AI assistant →
LinkedIn → cover letter → billing → UpgradePrompt. Every quota/feature
check fires before its expensive operation (verified exhaustively, §8).
**Fixed defects** (see §12/§13): Resume Analyzer's ATS-quota rejection,
mock-interview debrief/progress quota rejections, and JD-optimization
quota rejection all now correctly show `UpgradePrompt` instead of a raw
string. Anonymous behavior is unchanged (anonymous rate limiting was not
touched). No accidental organization requirement anywhere in this
journey — re-confirmed, unchanged from M1-M3.

## 3. Recruiter Journey Result

Re-traced signup → self-service activation → `/recruiter` → jobs →
candidates → matching/evaluation/insights → comparison/recommendation →
interview readiness → shortlist → interview scheduling → analytics →
exports → billing → upgrade/checkout → Stripe subscription state. Every
step within `src/app/api/ai/recruiter/**` (the real, entitlement-scoped
workspace) was re-confirmed correct — identity always session-derived,
every expensive action gated, bulk operations gate the whole batch,
exports use fetch+blob never raw `<a href>`, chat-driven tools mirror
their REST siblings' gates exactly (re-verified fresh, §8/§9 below).

**The one genuine gap found this milestone is NOT in this real workspace
— it's in the separate, legacy Recruitment Pipeline tree** (`/api/ai/
recruitment/**`), see §12. That subsystem's job/candidate stores are
process-memory, unscoped by recruiter — the fix closes the cost/auth
exposure (a real session + entitlement is now required) but does not
(and structurally cannot, without a larger restructuring outside this
milestone's scope) add per-recruiter ownership to that legacy store's
own data model. This residual characteristic pre-dates this milestone
and is unchanged by the fix.

## 4. Auth/Persona Routing Result

Fresh, from-source re-trace (not trusting M3's summary) confirmed:
`resolveDefaultLandingPath()` is correctly computed once inside
`finalizeLogin()` and correctly consumed by password login, all three
MFA-verify routes, and the OAuth callback (only as a fallback when no
explicit `?redirect=` is present). No leftover hardcoded
`/settings/organization` default exists anywhere — all 7 remaining
occurrences are legitimately org-scoped navigation, re-confirmed.

**Two gaps found and fixed** (§12/§13): (a) `register()`'s
`defaultLandingPath` was computed but discarded by the API route and
never read by `SignupForm` — zero live impact today (a brand-new signup
is always JOB_SEEKER-only, so the value was always `/resume-analyzer`
anyway) but genuinely incomplete wiring, fixed for consistency and
future-proofing at near-zero cost; (b) the password-reset completion path
never computed a persona-aware landing at all — a real, reachable gap for
existing RECRUITER accounts, fixed by reusing
`resolveDefaultLandingPath()` in the reset-password route exactly as
login does.

## 5. Personal vs. Organization Billing Result

Re-confirmed unchanged and correct: `/settings/billing` (personal,
role-filtered plan cards, already correct per M3/M4) vs. `/billing`
(organization, its own empty state when no org exists). Job seekers and
recruiters never need an organization anywhere in their journey — no
code path was found that requires one. Organization credit-checks
(`checkCredits`/`consumeCredits`/`withUsageContext`) remain additive-only
on resume/mock-interview/chat routes for users who happen to belong to
an org, a true no-op otherwise — re-confirmed, unchanged from M2/M4. No
billing UI mixes the two systems misleadingly.

## 6. Stripe Lifecycle Result

Re-confirmed from M4, not re-litigated in full depth this milestone
(no code in this layer changed except the M4 checkout-role-activation
fix, which is untouched): signature verification precedes body parsing,
idempotent upsert-by-`stripe_subscription_id`, out-of-order protection
via the Stripe event's own `created` timestamp, forged-metadata
protection via customer-id-based identity resolution — all still
correct, all still covered by existing tests. Stripe credentials remain
absent from this environment (confirmed fresh via direct env grep — zero
`STRIPE_*` variables).

## 7. Recruiter Role / Subscription Result

Unchanged from M4, re-confirmed: removing RECRUITER immediately and
fully cuts off recruiter entitlements (no security defect); the
underlying Stripe subscription is left running, unaddressed by any code
path (a real, documented operational gap, not auto-fixed here either,
per this milestone's own instruction not to make speculative
product-policy decisions). **Classification: B — product/operations
decision required.** The exact decision needed: should removing a
user's RECRUITER role also prompt/trigger cancellation of their
underlying Stripe subscription? This is a business policy choice (e.g.
"pause access, keep billing" vs. "removing the role should also end the
subscription") that this audit cannot make on its own.

## 8. Entitlement Matrix Result

Mechanically re-derived from source (not from any prior report):
27 `FEATURE_IDS` (corrected — prior summaries cited 25), 10 `USAGE_METRICS`,
87 `requireFeature`/`requireQuota`/`checkQuota`/`recordUsage` call sites
across 40 route files — every single one fires before its route's real
expensive operation; no metric is ever recorded under a different name
than it was checked against; no cross-persona mismatch (`recruiter.*`
never appears outside `src/app/api/ai/recruiter/**`, plus one correctly
recruiter-scoped route under the `recruitment/` URL tree). Four feature
IDs (`resume.builder`/`templates`/`versions`/`export`) and one
(`recruiter.workspace`) have no live enforcing route — all five are
UNLIMITED on every relevant plan, so this is inert, not a leak; not
fixed, consistent with "do not invent new quotas." `interview.study_plan`
is a phantom entitlement (Free = NONE in the registry, but the study
plan is delivered as part of the already-`interview.prepare`-gated
report regardless of tier) — a real product-policy ambiguity, not a code
defect, documented for review, not fixed. **The one genuine, severe
finding** — the entire ungated `recruitment/**` cost-bearing tree — is
covered in full in §12/§13.

## 9. Security/IDOR Result

Re-searched fresh for every class the task named: no `userId`/
`recruiterId`/`organizationId` is ever read from a request body anywhere
in `src/app/api/ai/recruiter/**` or the platform billing routes; the
`POST /api/billing/platform/checkout` route resolves identity via
`requireUserId()` before the `planKey` body field is ever consulted
(re-verified live, §14); Stripe customer/subscription identity is always
resolved server-side from the authoritative customer mapping, never
client input (re-confirmed, §6); candidate/job/export ownership remains
`requireRecord()`/`getJob()`-verified, unchanged. The 8 newly-fixed
recruitment routes now also require a real session — closing the one
security-relevant gap found this milestone.

## 10. UI/UX Result

Homepage, mobile nav, persona landing, billing page, and
`UpgradePrompt`'s own AUTH_REQUIRED/FEATURE_NOT_INCLUDED/QUOTA_EXCEEDED
handling were all re-confirmed correct and unchanged from M1-M3. **New
finding this milestone**: 4 components (resume upload, mock-interview
debrief, mock-interview progress, JD re-optimization) showed a raw error
string instead of `UpgradePrompt` for a real, reachable entitlement
rejection — fixed (§13). No "Create Organization" prompt appears for a
JOB_SEEKER-only user (unchanged, M1). No misleading Organization-vs-
Personal-Billing labeling was found beyond what M3 already fixed.

## 11. Operational Readiness Result

Independently re-verified, more thoroughly than any prior milestone (22
tables checked, not 11):

```
Migrations:  ALL applied — platform_subscriptions, platform_billing_customers,
             platform_usage_events, platform_entitlement_overrides,
             organizations, organization_members, organization_roles,
             organization_invitations, recruiter_jobs, recruiter_candidates,
             auth_sessions, password_history, security_events, security_alerts,
             mfa_backup_codes, mfa_email_challenges, trusted_devices, audit_logs,
             resume_versions, anonymous_ai_requests all confirmed EXISTS via a
             direct select("*").limit(1) probe.
Stripe:      NOT configured — zero STRIPE_*/PLATFORM_STRIPE_* env vars present.
Admin:       exactly 1 user holds the ADMIN role (of 2 total users) — a safe,
             expected bootstrap state, no anomaly.
Secrets:     confirmed no NEXT_PUBLIC_-prefixed secret exists; the two
             NEXT_PUBLIC_ vars present (Supabase URL, anon key) are the
             standard, intentionally-public Supabase client credentials.
Build/lint/tsc/tests: all clean (see §17).
```

**Methodology correction worth recording**: an early check in this
milestone incorrectly reported the anonymous-AI-rate-limit table as
missing, because it guessed the table name from the migration
*filename* (`anonymous_ai_rate_limits`) rather than the actual table the
code creates (`anonymous_ai_requests`, confirmed in
`anonymous-ai-rate-limiter.ts:40`). Re-checked with the correct name —
the table exists. Recorded here as a reminder that migration filenames
and table names in this repo are not always identical.

## 12. Defects Found

| # | Severity | Finding |
|---|---|---|
| 1 | **P0** | 8 routes under `src/app/api/ai/recruitment/**` made real, uncapped OpenAI calls with zero session/entitlement check — recommendation, feedback-summarize, generate-kit, and 5 email-generation routes |
| 2 | **P1** | `src/app/api/ai/resume/route.ts` never called `entitlementErrorResponse()` — a `QuotaExceededError` was collapsed to a bare `{error}` with no `code`/`limit`/`used`/`period`, so the client could never recognize it |
| 3 | **P1** | `ResumeUpload.tsx` had no entitlement handling at all — showed a generic string on the app's primary entry point's quota rejection |
| 4 | **P1** | `MockInterviewDebrief.tsx` showed a raw error string instead of `UpgradePrompt` for a real `interview.debrief` (NONE on Free) rejection |
| 5 | **P1** | `MockInterviewProgress.tsx` — identical defect for `interview.progress` |
| 6 | **P2** | `JdOptimizationReview.tsx` showed a raw error string instead of `UpgradePrompt` for a `JD_MATCHES` quota rejection, inconsistent with its sibling panels that handle it correctly |
| 7 | **P2** | Password-reset completion never computed a persona-aware landing path — an existing RECRUITER resetting their password landed on `/resume-analyzer` instead of `/recruiter` |
| 8 | **P3** | `register()`'s computed `defaultLandingPath` was silently dropped by the API route and never read by `SignupForm` — zero live impact (new signups are always JOB_SEEKER), fixed for consistency |
| 9 | **P3** | `interview.study_plan`'s Free-tier NONE restriction is inert — the study plan is delivered regardless of tier as part of the already-gated interview-prep report — a product-policy ambiguity, not fixed |
| 10 | **P3** (documented, not fixed — explicit instruction) | Removing RECRUITER leaves the Stripe subscription running unaddressed — re-confirmed from M4, classification B (product/ops decision required) |
| 11 | **P3 (unreachable today)** | `RecruiterDashboardTab.tsx`'s job-creation error handling doesn't use `UpgradePrompt`, but `recruiter.jobs` is unlimited on every RECRUITER plan and the `/recruiter` activation gate (M3) prevents a non-recruiter from ever reaching this form — not fixed, documented only |
| 12 | **P3 (inert, no leak)** | `resume.builder`/`templates`/`versions`/`export`/`recruiter.workspace` have no live enforcing route — all UNLIMITED on every relevant plan, so no access differentiation exists to enforce — not fixed |

## 13. Fixes Made

All reuse existing architecture; no new entitlement/billing/auth system,
no schema change, no new dependency:

1. **8 recruitment-pipeline routes** — added `requireRecruiterId()` +
   `requireFeature(recruiterId, "recruiter.X")` + `entitlementErrorResponse()`
   error handling, matching the exact pattern already established by
   this tree's one previously-fixed route (`interview-readiness`, Phase
   19 M3). Feature mapping: recommendation/offer/rejection →
   `recruiter.hiring_report`; feedback-summarize/generate-kit/invitation/
   reminder → `recruiter.interview`; follow-up → `recruiter.candidates`.
2. **`src/app/api/ai/resume/route.ts`** — now calls
   `entitlementErrorResponse()` first in its catch block, matching every
   sibling gated route (resume-rewriter, cover-letter, linkedin, ...).
3. **`ResumeUpload.tsx`** — added the `ApiError`-carries-body pattern
   already used by `JobUpload.tsx`/`JobMatchUpload.tsx`/`JdUpload.tsx`,
   plus `readEntitlementError()` + `UpgradePrompt`.
4. **`MockInterviewDebrief.tsx`**, **`MockInterviewProgress.tsx`** —
   added `readEntitlementError()` + `UpgradePrompt` handling on their
   fetch rejection paths.
5. **`JdOptimizationReview.tsx`** — same, matching its sibling panels.
6. **`src/app/api/auth/reset-password/route.ts`** — now calls
   `resolveDefaultLandingPath(user.id)` (the same function `finalizeLogin()`
   already uses) and returns it; **`reset-password/page.tsx`** now
   redirects there instead of a flat `/resume-analyzer`.
7. **`src/app/api/auth/register/route.ts`**, **`SignupForm.tsx`** — wired
   the already-computed `defaultLandingPath` through, for consistency
   (currently a no-op in practice, see Finding #8).

Every fix reuses an existing, already-tested pattern from elsewhere in
this codebase — no new abstraction was introduced anywhere.

## 14. Deferred Product Decisions

One, unchanged and re-confirmed from M4, not re-decided here per
explicit instruction: **should admin removal of the RECRUITER role also
cancel the user's Stripe subscription (fully or at period end), or
should billing remain intentionally independent of role state?** Current
behavior (billing continues untouched) is technically consistent and not
a security defect, but is very likely not what an admin performing a
role removal intends. Recommend a deliberate product decision, then a
narrowly-scoped implementation reusing the existing `createBillingPortalSession`/
subscription-cancellation primitives already in `platform-billing-service.ts`
— explicitly out of scope for this audit to decide unilaterally.

## 15. Operational Blockers

- Stripe credentials (secret key, platform webhook secret, price IDs)
  remain unconfigured in this environment — unchanged prerequisite,
  independently re-confirmed this milestone.
- No other operational blocker — all relevant migrations are live and
  applied (§11).

## 16. Tests and Validation

Added regression tests for every fix in §13 (24 new tests across 8 new
route test files for the P0 recruitment-pipeline fix, plus 1 new test
proving `resume/route.ts`'s corrected error shape). Client-component
fixes (§13 items 3-6) were not independently unit-tested — this repo has
no component/UI test infrastructure (CLAUDE.md's own explicit,
established convention) and were instead verified by direct code review
against the already-proven `readEntitlementError()`/`UpgradePrompt`
pattern used correctly by 15+ other components in this same codebase.

```
npx tsc --noEmit    -> clean, zero errors
npm run lint         -> 1 pre-existing warning (unrelated: <img> in blog/[slug]), 0 errors
npm test              -> 111 files, 1260/1260 tests passing (25 new)
npm run build         -> exit 0, all routes compiled
```

## 17. Live Validation

```
POST /api/ai/recruitment/jobs/j1/pipeline/c1/recommendation      -> 401 (was previously an open, real LLM call)
POST /api/ai/recruitment/interviews/i1/feedback/summarize        -> 401 (same)
POST /api/ai/recruitment/interviews/i1/generate-kit               -> 401 (same)
POST /api/ai/recruitment/emails/invitation                        -> 401 (same)
POST /api/ai/recruitment/emails/reminder                          -> 401 (same)
POST /api/ai/recruitment/emails/offer                             -> 401 (same)
POST /api/ai/recruitment/emails/rejection                         -> 401 (same)
POST /api/ai/recruitment/emails/follow-up                         -> 401 (same)

GET  /recruiter                          -> 307 -> /login?redirect=/recruiter        (unchanged)
GET  /admin                              -> 307 -> /admin/login                       (unchanged)
GET  /api/ai/recruiter/jobs              -> 401                                        (unchanged)
GET  /api/billing/platform/overview      -> 401                                        (unchanged)
GET  /settings/billing                   -> 307 -> /login?redirect=/settings/organization (unchanged)
```

All confirmed against the pre-existing `next dev` server on port 3000
(HMR-reflected current source). Stripe live E2E and authenticated
browser E2E were **not** attempted — no Stripe test-mode credentials and
no real user session are available to this audit tool, and no live
mutation was made against the connected Supabase project.

```
STRIPE LIVE E2E: BLOCKED
Reason: no Stripe credentials configured in this environment.

AUTHENTICATED BROWSER E2E: BLOCKED
Reason: no real user session available; a live Supabase-mutating test
was deliberately not performed without explicit authorization.
```

## Final Classification

**READY WITH ONE OPERATIONAL PREREQUISITE (Stripe configuration) AND ONE
DEFERRED PRODUCT DECISION (role-removal/subscription policy, §14).**

One genuine P0 defect (real, unauthenticated LLM cost exposure across 8
routes) was found this milestone that no prior audit had caught — found
specifically because this milestone re-derived the entitlement matrix
mechanically from source instead of trusting prior conclusions, exactly
as instructed. It is now fixed and regression-tested. Several P1/P2
customer-journey UX defects were also found and fixed. No architecture
was redesigned, no second entitlement/billing/organization/recruiter/auth
system was created, no migration was added, and no existing security was
weakened anywhere in this milestone's changes — every fix reuses an
already-established pattern from elsewhere in this codebase. No
Milestone 6 is proposed; the two open items above are operational/product
prerequisites, not code defects. Nothing in this milestone has been
committed.
