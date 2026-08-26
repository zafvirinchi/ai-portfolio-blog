# SaaS Legal Requirements — Business/Legal Review Needed

This document is **not legal advice**. It exists to hand the business/
legal team a precise list of what the application currently does and
does not have, so they can supply real, authoritative content. No legal
language in this document should be published as-is on the live site.

Audited: Phase 24 Milestone 1 (initial discovery) and Milestone 2 (this
document). Confirmed via direct source search — no `/terms`, `/privacy`,
or refund-policy page/copy exists anywhere in `src/`.

---

## 1. Terms of Service

**Status: does not exist in the codebase.**

**Purpose**: the contract governing use of the product — acceptable use,
account termination rights, liability limits, dispute resolution,
intellectual property (who owns AI-generated resumes/cover letters/
recommendations), and the relationship between the two personas
(JOB_SEEKER, RECRUITER) and the platform.

**What business/legal must provide**:
- Governing law/jurisdiction.
- Acceptable-use rules specific to this product (e.g., can a recruiter
  upload a candidate's resume without the candidate's knowledge? — this
  product's own architecture already does this via `getProfileForSystemUse`-
  style internal reads; legal should confirm this is covered).
- Liability limitation language for AI-generated content (resumes,
  cover letters, interview feedback, hiring recommendations) — the
  product does not currently warrant accuracy of any generated content.
- Account termination/suspension rights.
- Subscription/billing terms cross-reference (see §3, Refund Policy).

**Where it should appear in the UI**:
- A new `/terms` route (mirroring the existing `/contact` page pattern —
  `src/app/(site)/contact/page.tsx`).
- Linked from `Footer.tsx` (currently logo + copyright only — no links at
  all, see `src/components/layout/Footer.tsx`).
- Linked from `SignupForm.tsx`/`RegisterPage` near the submit button
  ("By signing up, you agree to the Terms of Service and Privacy
  Policy" — standard SaaS pattern, not currently present).

## 2. Privacy Policy

**Status: does not exist in the codebase.**

**Purpose**: disclose what personal data is collected and why. This
product genuinely collects and processes real personal data across
multiple systems — legal needs an accurate inventory to write an
accurate policy, not a generic template:

- Account data: email, password (hashed by Supabase Auth), MFA
  factors/backup codes, trusted devices, session history, IP addresses
  (`auth_sessions`, `security_events`, `trusted_devices` tables).
- Resume content: uploaded resumes, parsed structured data, AI analysis
  results (`resume_versions` and the ephemeral resume-analyzer/
  resume-rewriter/LinkedIn/cover-letter stores).
- Recruiter-side candidate data: candidate resumes, notes, evaluation
  status, decision history (`recruiter_candidates`) — this is personal
  data about a THIRD PARTY (the candidate), not the recruiter account
  holder, which typically carries distinct disclosure obligations legal
  should specifically address.
- Billing data: held by Stripe, not this database — only a Stripe
  customer id and subscription status are stored locally
  (`platform_billing_customers`, `platform_subscriptions`).
- AI processing: resume/candidate content is sent to OpenAI for
  analysis — legal should confirm OpenAI's own data-processing terms are
  compatible with the product's own privacy commitments.

**What business/legal must provide**: a data inventory sign-off (the
list above, refined), retention periods, third-party processor list
(Supabase, Stripe, OpenAI, at minimum), and the user's rights
(access/export/delete — see §6, already technically implemented).

**Where it should appear in the UI**: same pattern as §1 — new
`/privacy` route, linked from `Footer.tsx` and the signup flow.

## 3. Refund / Cancellation Policy

**Status: the cancellation MECHANISM exists; no policy TEXT exists.**

The code already lets a user cancel via the Stripe Billing Portal
(`createBillingPortalSession()` in `src/lib/billing/platform-billing-service.ts`,
surfaced as "Manage Subscription" on `/settings/billing`). What's
missing is a plain-language sentence explaining the actual policy —
e.g., "Cancel anytime; you'll retain access until the end of your
current billing period. No partial refunds are issued for unused time."
(illustrative only — business must decide the real terms).

**What business/legal must provide**: whether refunds are ever issued
(full, partial, prorated, never), the cancellation-effective-date policy
(immediate vs. end-of-period — the code already correctly implements
"access continues until Stripe's own `canceled_at_period_end` takes
effect," so the policy text should match what the code actually does,
not invent a different behavior).

**Where it should appear in the UI**: `/settings/billing`, near the
"Manage Subscription" button (`src/app/settings/billing/page.tsx`), and
ideally on the pricing/plan-comparison view before checkout.

## 4. AI Usage / Disclosure

**Status: marketing copy mentions "AI-powered" in a few places; no
formal disclosure exists.**

Every feature in this product is AI-generated content presented to a
real decision-maker (a job seeker deciding what to submit, a recruiter
deciding who to interview/hire). Business/legal should decide whether a
disclosure statement is required (jurisdiction-dependent, especially for
AI-assisted hiring-decision tools — some jurisdictions have specific
AI-in-hiring disclosure/audit requirements that go beyond ordinary ToS
language).

**Where it should appear in the UI**: candidates for a short, standard
disclosure line: on `/resume-analyzer`, `/cover-letter`, `/mock-interview`
result screens ("AI-generated — review before use"), and on the
Recruiter Workspace's recommendation/insights panels
(`RecruiterInsightsTab.tsx`, the hiring-recommendation output) — these
are the highest-stakes generated outputs (a recommendation about a real
candidate) and are the most likely candidates for a mandatory
disclosure depending on jurisdiction.

## 5. Contact / Support Information

**Status: partially exists.** `/contact` (`src/app/(site)/contact/page.tsx`)
renders a real form. As of Phase 24 Milestone 2, submissions are now
durably persisted (`contact_messages` table — see the Milestone 2
report's Contact/Support section) rather than only logged. No support
email address or help-center link exists in `Footer.tsx` or anywhere
else in the UI.

**What business must provide**: a real support email address or
help-center URL, and a decision on SLA/response-time expectations if
any are to be published.

## 6. Account / Data Deletion

**Status: already implemented in code — this section confirms it for
legal's awareness, no action needed on the code side.**

- Account deletion: `/settings/profile` → "Danger Zone" →
  `DELETE /api/auth/profile` → `deleteAccount()`
  (`src/lib/auth/auth-service.ts`) — deletes sessions, trusted devices,
  MFA data, password history, security alerts, org/workspace
  memberships, then the Supabase Auth user itself. Blocks deletion (with
  a clear error) while the user still owns an organization.
- Resume-version deletion: `DELETE /api/ai/resume/versions/[id]`.
- Recruiter candidate-record deletion: `DELETE /api/ai/recruiter/candidates/[candidateId]`.
- Personal data export: `/settings/profile` → "Download Personal Data" →
  `GET /api/auth/profile/export`.

Legal should confirm these existing mechanisms actually satisfy
whatever regulatory deletion/portability obligations apply (e.g.
GDPR/CCPA-style requirements) — this is a compliance-sufficiency
question, not a "does the button exist" question, and is explicitly out
of scope for this document to answer.

---

## Summary Table

| Artifact | Status | Blocking for launch? |
|---|---|---|
| Terms of Service | Missing | Yes — before accepting real signups |
| Privacy Policy | Missing | Yes — before collecting real personal data |
| Refund/Cancellation policy text | Missing (mechanism works) | Yes — before charging real money |
| AI disclosure | Missing (business decision) | Business/legal to decide |
| Contact/support info | Partial (no support email) | Recommended |
| Account/data deletion | Implemented | No further code action needed |
