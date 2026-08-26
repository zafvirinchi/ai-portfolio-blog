# Phase 23 — Milestone 2: Recruiter SaaS Identity, Organization Model & Monetization Alignment Audit

## 1. Executive Summary

This milestone traced the complete identity, data-ownership, and billing
lineage from Supabase signup through recruiter/organization identity to
entitlement resolution, to answer one question: is the Recruiter Workspace's
total independence from the organization system (A) correct architecture,
(B) an incomplete organization model, or (C) two intentionally separate SaaS
models that should stay separate?

**Finding: (C) / Model D ("existing intentional split").** The Recruiter
Workspace is a complete, self-consistent, independently-monetized product
under the per-user platform billing system (Phase 18-20). The organization
system (Phase 14) is a genuinely separate B2B team-management product with
its own billing, roles, and audit trail. They are not two halves of one
unfinished design — each is fully functional on its own, and the recruiter
workspace's lack of `organization_id` is not a gap, it's the documented,
deliberate scope of that feature (`recruiter-auth.ts`'s own header comment).

One real nuance was found and is documented precisely in §6: the
organization billing/credit system is *additively* wired into a subset of
**job-seeker** routes (resume analysis, mock interview, AI chat) as a
secondary, non-blocking-when-absent usage-metering layer — never into any
recruiter route. This doesn't change the classification; it's a deliberate
extension of "separate products," not evidence of a merged model.

**No genuine security, IDOR, authorization, or billing defect was found.**
Two candidate mismatches were investigated in depth (§7, §11) and both
resolved as intentional, correctly-designed behavior on closer inspection —
not defects requiring a fix. **No application code was changed in this
milestone.**

## 2. Identity Model

- **Root identity**: Supabase Auth (`auth.users`). `auth-service.ts`'s
  `login()`/`register()` never reference personas or roles — no role is
  assigned at signup time.
- **JOB_SEEKER / RECRUITER / ADMIN persona**: stored in
  `auth.users.app_metadata.platform_roles` (an array), key constant
  `APP_METADATA_ROLES_KEY` in `src/lib/billing/persona-service.ts:21`.
  Read via `resolvePlatformRoles(userId)` (`persona-service.ts:36-46`,
  defaults to `["JOB_SEEKER"]` on any lookup failure). Written only via
  `setPlatformRoles()` (`persona-service.ts:65-75`), which requires the
  Supabase Admin API (service-role) — never client-writable, matching
  CLAUDE.md's stated rule.
- **`recruiter_id`**: **is literally `auth.users.id`.** There is no separate
  `recruiters` table or profile row. `requireRecruiterId()`
  (`src/lib/ai/recruiter/recruiter-auth.ts:20-31`) does nothing but
  `supabase.auth.getUser()` → return `user.id`. The file's own comment
  states this is deliberate: "a recruiter's candidates/JD belong to their
  own `auth.users` id, never to a whole organization." Consequently, "can
  one user own multiple recruiter profiles?" is structurally moot — the 1:1
  mapping is enforced by there being no separate entity to duplicate.
- **`organization_id`**: created via `OrganizationService.create()`
  (`src/lib/saas/organization-service.ts:15-63`), which inserts the org row
  (`owner_id: ownerId`), seeds all 8 `organization_roles` from
  `DEFAULT_ROLE_PERMISSIONS`, and auto-adds the creator as an
  `organization_members` row with `role_key: "Owner"`. Resolved for a
  request via `getTenantContext()` (`tenant-context.ts:42-102`): session →
  `active_org_id` cookie → matching active membership, else the user's
  oldest active membership, else `null`.
- **Multiple organizations per user**: yes, many-to-many.
  `listMyOrganizations()` (`tenant-context.ts:115-148`) can return several
  orgs for one user; `organization_members`'s natural key is
  `(organization_id, user_id)`, not `user_id` alone.
- **Organization membership roles**: `Owner, Admin, Recruiter, Hiring
  Manager, HR, Interviewer, Candidate, Viewer`
  (`organization-schema.ts:10-19`). **Important naming collision, not a
  code defect**: the org role literally named `"Recruiter"` is a
  team-permission label inside the organization system and is entirely
  unrelated to the platform `RECRUITER` persona that gates the Recruiter
  Workspace. They share a name and nothing else.
- **Does org membership affect recruiter permissions?** No — exhaustively
  grepped for `getTenantContext`/`organizationId`/`organization_id` across
  `src/lib/ai/recruiter/**` and `src/app/api/ai/recruiter/**`: the only
  matches are the explanatory comment in `recruiter-auth.ts`. Zero
  executable coupling.
- **Does org billing affect any recruiter feature?** No — zero references
  to any org billing/subscription function from recruiter code (one
  transitive, inert import chain in a test file's mock setup only, never
  actually triggered — see §6).

## 3. Recruiter Data Model

Only two persisted tables back the Recruiter Workspace, both from
`supabase/migrations/20260813000000_add_recruiter_persistence.sql`:

| Entity | `user_id`? | `recruiter_id`? | `organization_id`? | Current owner (enforced in app code) |
|---|---|---|---|---|
| `recruiter_jobs` | No | Yes (`references auth.users(id)`) | No | `.eq("recruiter_id", recruiterId)`, funneled through `recruiterJobService.getJob()` (`recruiter-job-service.ts:43-50`) |
| `recruiter_candidates` | No | Yes (`references auth.users(id)`) | No | `.eq("recruiter_id", recruiterId)`, funneled through the private `requireRecord()` choke point (`candidate-service.ts:212-219`) |

There is no recruiter billing table — recruiter billing is entirely the
platform system's per-user Stripe subscription (§5), keyed by `user_id`,
not a recruiter-specific table.

Two explicitly-named unscoped internal accessors exist on `CandidateService`
(`getForSystemUse`, `listForSystemUse`, etc., `candidate-service.ts:452-479`)
with doc comments reading "Never call this from an API route." They are used
only by the separate, legacy **Recruitment Pipeline** subsystem
(`src/app/api/ai/recruitment/**`, note "recruitment" not "recruiter") — a
distinct feature that is documented across 4+ prior audits and in CLAUDE.md
as **intentionally unauthenticated**. This is out of this milestone's scope
and was not touched, per CLAUDE.md's explicit instruction not to add
authentication to that subsystem as a side effect of unrelated work. Flagged
here only for completeness since it shares the underlying `recruiter_candidates`
rows.

## 4. Organization Model

- Full file inventory of `src/lib/saas/**`: `organization-service.ts` (CRUD,
  suspend/reactivate/delete, ownership transfer), `membership-service.ts`
  (member add/role-change/remove, invitation create/accept/reject/revoke),
  `tenant-context.ts` (session+org resolution), `permission-service.ts`
  (role/permission DB-backed checks), `organization-schema.ts` (roles/
  permissions/statuses), `organization-types.ts` (TS row types),
  `audit-service.ts` (`audit_logs`), `activity-service.ts`
  (`activity_logs`, feature-usage events), `team-service.ts` (read-only
  roster aggregation), `workspace-service.ts` (sub-org workspace CRUD).
- Roles/permissions: 8 roles (§2), 8 permissions (`Manage Users`, `Manage
  Billing`, `Manage Candidates`, `Manage Jobs`, `Manage Interviews`, `Manage
  Knowledge`, `Manage Resume Analysis`, `Manage AI Credits`), enforced via
  `requirePermission(context, permission)` (`permission-service.ts:27-31`),
  checked live against the DB-seeded `organization_roles` table.
- Invitations: `POST /api/saas/organizations/[orgId]/invitations` requires
  `"Manage Users"` permission, creates a 7-day-TTL token row (no email is
  actually sent — the route comments this explicitly), accepted via
  `POST /api/saas/invitations/[token]/accept`.
- Org billing (`billing-service.ts`, `stripe-provider.ts`,
  `subscription-service.ts`, `credit-service.ts`): one Stripe
  customer/subscription **per `organization_id`**, its own webhook handler
  (`src/app/api/billing/webhooks/stripe/route.ts`), and its own
  `usage_tracking`/`credit_transactions` tables gated against
  `PLAN_DEFINITIONS` (`plan-service.ts:14-91`).
- Org audit log: `audit-service.ts`, records every mutation across
  `organization-service.ts`/`membership-service.ts`/`workspace-service.ts`.

**Usage by other parts of the app**: the recruiter workspace does not use
it at all (§2). Admin uses it in exactly one route
(`src/app/api/admin/rag-documents/route.ts` — knowledge-base ingestion
gated by org plan limits when an org exists). Job-seeker AI routes have a
real, deliberate, additive usage-metering coupling — see §6.

## 5. Platform Billing Model

Single source of truth per CLAUDE.md: `platform-schema.ts` → `feature-registry.ts`
→ `platform-plan-registry.ts` → `entitlement-service.ts`. 25 `FEATURE_IDS`
total (`platform-schema.ts:71-118`): 9 `resume.*`, 3 `job.*`, 5 `interview.*`
(all tagged `primaryPersona: "JOB_SEEKER"` in `feature-registry.ts`), and 9
`recruiter.*` (all tagged `primaryPersona: "RECRUITER"`). No feature is
dual-tagged.

Plans: `JOB_SEEKER_FREE/PRO/PREMIUM` and `RECRUITER_FREE/PRO/BUSINESS`
(`platform-plan-registry.ts:29-188`). Every enforcement function
(`getEntitlement`, `requireFeature`, `checkQuota`, `requireQuota`,
`recordUsage`, `resolveEffectivePlans` — `entitlement-service.ts:147-357`)
takes only `userId: string`. The file's own header comment: "the ONLY
externally-supplied value any function here takes is a userId... resolved...
never from a request body or query parameter." Callers always pass
`user.id` — whether obtained via `getOptionalUserId()`/`requireUserId()`
(job-seeker routes) or `requireRecruiterId()` (recruiter routes, which is
the *same* `user.id`, per §2).

**A recruiter can subscribe and use the full Recruiter Workspace without
ever creating or joining an organization** — confirmed structurally: no
recruiter route or entitlement function references organization membership
or billing anywhere.

| Persona | Billing Model | Subscription Owner | Relevant Features |
|---|---|---|---|
| JOB_SEEKER | Platform (per-user, fixed Stripe Price IDs) | `user_id` | 9 `resume.*`, 3 `job.*`, 5 `interview.*` |
| RECRUITER | Platform (per-user, fixed Stripe Price IDs) | `user_id` | 9 `recruiter.*` |
| ADMIN | N/A — unconditional bypass of every plan/quota check | — | All features, all personas |
| (Organization, separate product) | Organization (per-org, dynamic Stripe `price_data`) | `organization_id` | Team seats, shared AI-credit pools for a narrow subset of job-seeker actions (§6); zero recruiter features |

`src/app/settings/billing/page.tsx:13-21` documents the split explicitly in
a code comment (not on-screen copy — see §11 for the UX implication):
"a new, account-level (individual user) billing page — deliberately NOT a
duplicate of `/billing/*`... that area manages a team's shared
subscription; this one manages the signed-in user's own Job Seeker/Recruiter
plan, independent of any organization."

## 6. Organization Billing / Feature Entitlement Matrix (Monetization Audit)

Verified directly (not just via research-agent report) by reading
`src/lib/ai/usage/usage-context.ts`, `src/lib/billing/credit-service.ts`, and
three actual route files:

- `withUsageContext(feature, operation, fn)` (`usage-context.ts:41-60`)
  resolves `getTenantContext()`; if no org, `fn` runs completely untouched
  (a true no-op — "identical to this milestone never having been added,"
  per its own comment). If an org is resolved, it wraps `fn` in an
  `AsyncLocalStorage` context carrying `organizationId`/`subscriptionId`
  for downstream usage-tracking.
- `checkCredits(featureKey)` (`credit-service.ts:76-90`) is a genuine,
  **fail-closed** gate: `if (!organizationId) return;` (no-op for non-org
  users), but for an org member it throws `InsufficientCreditsError` if the
  org's shared monthly credit balance for that feature is exhausted.
  `consumeCredits()` (`credit-service.ts:93+`) records usage only after
  success, matching the "record after success only" rule.
- Verified in `src/app/api/ai/resume/route.ts`, `mock-interview/route.ts`,
  and `chat/route.ts`: all three call `checkCredits()` **before** the
  expensive LLM operation, call the **platform** `requireQuota()`
  independently (also before the LLM call) when a user is signed in, run
  the operation inside `withUsageContext()`, then call `consumeCredits()`
  and `recordUsage()` only after success. Both gates are correctly ordered
  and neither can be bypassed by the other — this is a genuine, deliberate
  **dual-gate** design for these three routes specifically, not a
  mismatch or a race condition.
- `interview-prep/route.ts` uses `withUsageContext()` (usage-tracking only)
  but **not** `checkCredits`/`consumeCredits` — softer, non-blocking
  metering, no fail-closed org gate.
- `linkedin`/`cover-letter` routes: explicitly **not instrumented at all**
  by either system beyond platform entitlement — confirmed by
  `usage-context.ts:17-19`'s own comment naming them as a deliberate
  exclusion.
- **No recruiter route uses `withUsageContext`, `checkCredits`, or
  `consumeCredits`** — confirmed by direct grep, zero matches in
  `src/app/api/ai/recruiter/**`.

Full feature monetization table:

| Feature | Platform entitlement | Org entitlement | Both? | Notes |
|---|---|---|---|---|
| Resume Analyzer / ATS Score | `ATS_CHECKS` quota | `resume_upload` credits | **Both** | Dual-gated, verified |
| Job Match | `JD_MATCHES` quota | — | Platform only | |
| JD Matching | `JD_MATCHES` quota | — | Platform only | |
| JD Analyzer | `JD_MATCHES` quota | — | Platform only | |
| Resume Optimizer | `resume.optimize` (boolean) | — | Platform only | |
| Resume Rewriter | `resume.rewrite` + `AI_REWRITES` quota | — | Platform only | |
| Interview Preparation | `INTERVIEW_PREPARATIONS` quota | usage-tracking only (non-blocking) | Mostly platform | Org side is metering, not a gate |
| Mock Interview | `MOCK_INTERVIEWS` quota | `mock_interview` credits | **Both** | Dual-gated, verified |
| Interview Debrief / Progress | `interview.debrief` / `interview.progress` (boolean) | — | Platform only | Sub-actions of an already-gated session, correct per architecture |
| Interview Study Plan | *(none directly)* | — | **Inherited** | See §11 — not a gap, correctly protected transitively |
| LinkedIn Optimizer | `resume.linkedin_optimizer` + `LINKEDIN_OPTIMIZATIONS` quota | — | Platform only | Deliberately excluded from org metering |
| Cover Letter | `job.cover_letter` + `COVER_LETTERS` quota | — | Platform only | Deliberately excluded from org metering |
| AI Assistant / Chat | `resume.ai_assistant` + `AI_CHAT_MESSAGES` quota | `ai_chat` credits | **Both** | Dual-gated, verified |
| Recruiter Workspace (umbrella) | `recruiter.workspace` (unlimited, never invoked) | — | Neither (no umbrella gate needed) | Each action gated individually instead |
| Jobs (posting) | `recruiter.jobs` (boolean, unlimited all tiers) | — | Platform only | |
| Candidate Import | `RECRUITER_CANDIDATES` quota (via `checkQuota`, not `requireFeature`) | — | Platform only | |
| Candidate Matching | `RECRUITER_CANDIDATES` quota | — | Platform only | |
| Ranking (dedicated endpoint) | *(none directly)* | — | **Inherited** | See §11 — deterministic re-sort of already-quota-checked data |
| Evaluation | `RECRUITER_CANDIDATES` quota | — | Platform only | |
| Shortlist / Status change | `recruiter.shortlist` (boolean) | — | Platform only | |
| Interview (recruiter-side) | `recruiter.interview` (boolean) | — | Platform only | |
| Analytics | `recruiter.analytics` (boolean) | — | Platform only | |
| Hiring Decisions | `recruiter.hiring_report` (boolean) | — | Platform only | |
| Exports | `recruiter.export` + `RECRUITER_EXPORTS` quota | — | Platform only | |

## 7. Security / IDOR Findings

Focused audit of all 17 route files under `src/app/api/ai/recruiter/**` plus
the chat-tool recruiter dispatch path in `resume.tool.ts`:

- **Identity derivation**: every route resolves `recruiterId` via
  `await requireRecruiterId()` as its first step — never from body, query,
  or path params. The chat-tool path seeds `recruiterRequestContext` from
  the same server-resolved session id (`chat/route.ts:118`), never
  client-supplied.
- **Ownership enforcement**: funneled through two small choke points —
  `candidate-service.ts`'s private `requireRecord(candidateId, recruiterId)`
  (used by every mutating/generative method) and
  `recruiter-job-service.ts`'s `getJob(recruiterId, jobId)`. A foreign ID
  always resolves to a `CandidateNotFoundError` → HTTP 404, never a
  distinguishing 403 (preserves the existing "don't confirm existence to an
  unauthorized caller" pattern). Two read-only methods (`get()`,
  `getProfile()`) inline an equivalent `.eq()` filter instead of calling
  `requireRecord()` directly — a minor code-duplication note, not a
  vulnerability (identical two-column filter either way).
- **Bulk operations**: `bulkUpdateStatus()` (`candidate-service.ts:587-636`)
  and `listByIds()` (export path, `candidate-service.ts:412-434`) both
  verify the **entire** requested ID set against `recruiter_id` in one
  query before any write/read proceeds (`owned.length !== candidateIds.length`
  → throws for the whole batch) — no partial-success bypass found.
- **Cross-recruiter reachability**: checked every route; `jobId` is always
  re-verified through `getJob(recruiterId, jobId)` even when passed
  alongside an already-verified `candidateId` (e.g. `matchCandidate`
  independently re-checks both, preventing "attach my candidate to another
  recruiter's job"). `reEvaluateCandidate` deliberately never accepts an
  external `jobId` at all, reusing the candidate's own already-verified
  `record.jobId`.
- **`organization_id` client input**: zero matches anywhere in
  `src/app/api/ai/recruiter/**`.
- **Billing/customer IDs from client input**: zero matches; all
  entitlement calls key off the server-derived `recruiterId` only.

**Conclusion: no exploitable IDOR or cross-recruiter access was found.**
The one known, pre-existing issue — the separate Recruitment Pipeline
subsystem's unscoped `*ForSystemUse` accessors — is out of scope (§3), is
already documented across multiple prior audits as an intentional design
with one prior partial fix (`interview-readiness` route), and was correctly
left untouched per CLAUDE.md's explicit instruction.

## 8. Current Architecture Classification: Model D

The current implementation matches **Model D — "existing intentional split"**
most closely, with one documented nuance:

- Recruiter Workspace = Model A shape internally (User → `user.id` doubling
  as `recruiter_id` → Recruiter Workspace → individual platform
  subscription; organization is completely unrelated and untouched by any
  recruiter code path).
- Organization system = a fully independent B2B team product with its own
  billing, roles, invites, and audit trail — not a stub, not incomplete for
  its own stated purpose (team/workspace management), just unconnected to
  recruiter identity.
- The one point of contact between the two systems is narrow and
  deliberate: organization credit-tracking additively meters (and can
  fail-closed gate) three **job-seeker** routes (resume, mock-interview,
  chat) for users who happen to belong to an org — never recruiter routes,
  never a persona/role decision, purely "does this session have an active
  org membership."

This is **not** Model B (no incomplete-organization-model evidence — the
recruiter workspace was never partially built against organizations and
abandoned; it was built recruiter_id-scoped from its first migration
onward) and **not** Model C (recruiter identity does not derive from
organization membership under any code path).

## 9. UX Implications

Per Phase 23 Milestone 1 (already implemented, unchanged by this milestone):
JOB_SEEKER default redirect is `/resume-analyzer`; the organization
onboarding banner in `/settings` is now suppressed for JOB_SEEKER-only
users and shown only for RECRUITER/ADMIN personas. Given this milestone's
findings, that M1 design is **already correctly aligned** with the actual
architecture — no further UX change is indicated:

- `/settings/organization` should remain: job-seeker-hidden-by-default (as
  of M1) ✅, recruiter-visible ✅ (an org-role-holding recruiter — the org
  system's own distinct `"Recruiter"` member role, §2 — may legitimately
  want it, and any recruiter persona *can* create one, it's just never
  required), admin-visible ✅, and **completely independent from the
  Recruiter Workspace** ✅ — confirmed structurally, not just by UI
  convention.
- No dashboard switcher is needed: `isRecruiter`/`isAdmin` are independent
  OR-checks; a multi-role user already gets a deterministic single primary
  surface per M1's routing, and nothing in this milestone's findings
  changes that calculus.

## 10. No Speculative Database Changes

None were made. No `organization_id` was added to any recruiter table, no
recruiter-membership concept was introduced, no new billing table or role
was created. Per the Final Rule, this is the correct outcome: no audit
finding in §2-§8 identified an existing schema contract that already
implies these are required, and no genuine defect was found that a schema
change would fix.

## 11. Genuine Defects Found

**None required a code change.** Two candidates were investigated to
falsification and both resolved as intentional, correct behavior:

1. **`recruiter/ranking/route.ts` has no `requireFeature`/`requireQuota`
   call.** Investigated directly: `computeRanking()`
   (`candidate-service.ts:753-759`) is a pure, deterministic re-sort
   (`rankCandidates()`) over candidates already fetched by `list()` — zero
   LLM calls, zero new resource cost, over data whose *creation* (import/
   match) was already quota-checked. This matches CLAUDE.md's own stated
   principle that deterministic, zero-LLM-cost views over already-owned
   data are deliberately left ungated elsewhere in this codebase (e.g. the
   interview-prep `coverage` route, see #2 below). **Not treated as a
   defect and not fixed** — but flagged as worth a product-team decision:
   the plan registry's own doc describes "`candidates`+`ranking`" as a
   nominally shared quota metric, yet the ranking endpoint itself never
   consumes or checks it. Since resolving this requires a monetization
   *policy* decision (should re-viewing already-imported candidates in
   ranked order cost quota, or is it correctly free like every other
   deterministic derived view in this app?) rather than a code-correctness
   finding, and the task instructs not to make product decisions from code
   alone, this is reported for product review, not auto-fixed.
2. **`interview.study_plan` has no route-level `requireFeature`/
   `requireQuota` call anywhere.** Investigated directly: the study plan is
   generated by `buildStudyPlan()` inside
   `interview-intelligence-service.ts`, served exclusively by
   `[prepId]/coverage/route.ts` — a read-only, deterministic sub-action
   (confirmed via that route's own comment: "read-only, deterministic,
   zero-LLM analysis over an already-generated report... unguessable
   `prepId`"). This is the exact, documented "ephemeral session" pattern
   from CLAUDE.md: the session's own `start()`-equivalent route
   (`interview-prep/route.ts`, gated by `INTERVIEW_PREPARATIONS` quota)
   protects every sub-action by construction, since an unentitled caller
   can never obtain a valid `prepId`. **Correctly protected, not a
   defect.**

No IDOR, no authorization bypass, no client-controllable identity, no
billing-identity confusion, and no race between entitlement checks and
expensive operations were found anywhere in the audited surface.

## 12. Changes Made

**None.** `git status` before and after this milestone's investigation is
identical for all application source files — zero recruiter, organization,
billing, or entitlement files were modified. No migrations were created or
applied.

## 13. Recommended Future Architecture

Not a current defect, but worth surfacing as a **business decision**, not
an engineering gap: today, a hiring team of N recruiters needs N separate
individual `RECRUITER_*` platform subscriptions — there is no seat-sharing
or team-billed recruiter plan, because the Recruiter Workspace and the
Organization system are, correctly, unconnected. If the product direction
ever wants "Enterprise Recruiter" team billing (shared seats, org-level
recruiter analytics, org-scoped candidate pools), that would be a
deliberate, explicit Model B/C migration — introducing `organization_id` on
`recruiter_jobs`/`recruiter_candidates`, a recruiter-facing org-membership
concept, and org-tier platform plans — and should be scoped as its own
product-led milestone with real requirements, not inferred from this audit.
**No such milestone is proposed here** — there is no concrete, currently
broken product/engineering gap that demands it; this is purely an FYI for
future business planning.

## 14. Migration Requirements

None. No schema change is required by any finding in this audit.

## 15. Operational Prerequisites

None beyond what is already documented in prior Phase 21/22 reports
(applying the 14 pending Supabase migrations in order, configuring Stripe
price IDs for both billing systems, etc.) — unchanged by this milestone.

## 16. Test / Build / Verification Results

Since no application code was modified, this section confirms the
pre-existing baseline remains healthy (no regression introduced by the
audit process itself):

```
npx tsc --noEmit    → clean, zero errors
npm run lint         → 1 pre-existing warning (unrelated: <img> in blog/[slug]), 0 errors
npm test              → 102 files, 1222/1222 tests passing
npm run build         → exit 0, all routes compiled
git status            → zero application-source diffs from this milestone
```

No new regression tests were added, per the task's own instruction: "Do not
manufacture tests for architecture that is intentionally unchanged." The
`.claude/hooks/{code-quality-check,security-check,verification-check}.mjs`
hooks are edit-triggered and correctly did not fire, since no file edits
occurred this milestone.

## Final Rule Applied

No genuine code defect was found. Per instruction: application code was not
modified, no migrations were created, no organization dependency was
invented into the recruiter workspace, and the architecture is documented
above honestly, including the one narrow, real cross-system coupling found
(§6) and the two investigated-and-resolved false leads (§11). No Milestone 3
is proposed — the one forward-looking item (§13) is an explicit future
business decision, not a concrete unresolved defect. Nothing in this
milestone has been committed.
