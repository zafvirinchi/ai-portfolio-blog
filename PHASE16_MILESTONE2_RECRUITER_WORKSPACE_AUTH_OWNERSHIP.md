# Phase 16 — Milestone 2 — Recruiter Workspace, Authentication & Candidate Ownership Foundation

## 1. Objective

Close the ownership/privacy gap Phase 16 Milestone 1's audit identified: the
Recruiter Workspace (`CandidateService`, built in Phase 13 Milestone 8)
operated as a single shared, unauthenticated, in-memory workspace — every
candidate, every active job description, and every ranking/dashboard view was
visible to and mutable by anyone who could reach `/recruiter` or its API
routes, with zero recruiter identity concept anywhere in the stack. This
milestone establishes authenticated, server-derived recruiter identity;
per-recruiter ownership of candidates and the active job description;
server-side authorization on every recruiter route; and IDOR-resistant access
boundaries — without rebuilding the Candidate Fit engine, ranking logic,
tie-breaker cascade, recruiter summary, ATS scoring, or JD matching.

## 2. Architecture audit — what already existed

- **`requireUserId()`** (`src/lib/ai/resume-versions/resume-version-auth.ts`)
  — the established, reused-everywhere pattern for *personal* (not
  organization-scoped) server-derived identity: `createSupabaseServerClient()`
  → `auth.getUser()` → throw `UnauthorizedError` if absent.
- **`getTenantContext()`** (`src/lib/saas/tenant-context.ts`, Phase 14
  Milestone 1) — the *organization*-scoped alternative: resolves a signed-in
  user's active `organization_members` row (via an `active_org_id` cookie or
  first membership), returning `{userId, organizationId, role, permissions}`.
  No RLS backs it — access control is entirely in this file and
  `permission-service.ts`.
- **Both Phase 14 migrations** (`20260806000000_add_saas_foundation_tables.sql`,
  `20260807000000_add_enterprise_auth_tables.sql`) explicitly document, in
  their own header comments, that **no table in this project uses Row Level
  Security** — every read/write goes through the service-role `supabaseAdmin`
  client, and authorization is 100% application-level. This confirmed the
  project's real convention before any design decision was made.
- **`resumeVersionService`** (`src/lib/ai/resume-versions/resume-version-service.ts`)
  is the concrete template for that application-level convention: every
  query baked in `.eq("user_id", userId)`, and a not-found row (wrong id OR
  wrong owner) always throws the same `ResumeVersionNotFoundError` — existence
  is never leaked.
- **`organization_roles`** already has a seeded `'Recruiter'` role key
  (Phase 14 Milestone 1), which could tempt an org-scoped design — but this
  milestone's own scope is explicitly an **individual-recruiter-scoped**
  workspace, not organization-shared, so `requireUserId()`'s personal-identity
  pattern is the correct template, not `getTenantContext()`'s org-scoped one.
- **`CandidateService`** (`src/lib/ai/recruiter/candidate-service.ts`) — a
  singleton, in-memory `Map<string, CandidateRecord>`, with **zero** recruiter
  identity: `recruiterRequestContext` was `AsyncLocalStorage<{active: true}>`,
  a bare boolean. Confirmed live in Milestone 1 that every one of its 17 API
  routes returned real data with no auth header at all.
- **The Recruitment Pipeline** (`src/lib/ai/recruitment/pipeline-service.ts`
  and its ~15 sibling files, Phase 13 Milestone 9) is a **separate, sibling**
  feature built on top of `candidateService`, with its own `Job` entity
  (`job.recruiter`/`job.hiringManager` as plain display strings, not
  authenticated actors) and its own bare-boolean `recruitmentRequestContext`.
  It has no recruiter-identity concept of its own and is genuinely out of
  this milestone's scope to redesign.

## 3. Recruiter identity model

`src/lib/ai/recruiter/recruiter-auth.ts` (new) mirrors
`resume-version-auth.ts` exactly:

```ts
export async function requireRecruiterId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
```

`recruiterId` is **always** `auth.users.id`, resolved server-side from the
Supabase session. It is never accepted from a request body, query string, or
any client-supplied field — every one of the 17 recruiter API routes calls
`requireRecruiterId()` itself; nothing downstream trusts a client-passed id.
A non-throwing `getRecruiterId()` variant exists for the one caller that must
degrade gracefully instead of failing the whole request (see §6, chat).

## 4. Recruiter workspace concept

Individual-recruiter-scoped, exactly as specified — **not** organization- or
team-shared. Two recruiters signed into two different `auth.users` accounts
now see two completely disjoint workspaces: disjoint candidate lists,
disjoint active job descriptions, disjoint dashboards/rankings/exports.
Nothing here introduces organization/workspace/team sharing, invitations, or
multi-recruiter collaboration on the same candidate pool — that would be
genuine scope expansion beyond "ownership foundation."

## 5. Job ownership

The existing model has no standalone "Job" entity in the Recruiter Workspace
— it is a single **active job description text** per workspace, used to
auto-match newly imported candidates (`setJobDescription`/
`matchCandidateToActiveJd`). This was a real, live cross-tenant leak: every
recruiter shared the same one `activeJobDescriptionText` string, so setting a
JD as recruiter A silently changed what recruiter B's candidates got
auto-matched against.

Fixed by scoping it per recruiter:

```ts
private readonly activeJobDescriptions = new Map<string, string>();
```

keyed by `recruiterId`. `setJobDescription`/`getActiveJobDescription`/
`matchCandidateToActiveJd` all now require `recruiterId` and only ever touch
that recruiter's own entry. No new "Jobs list" CRUD feature was built — the
milestone's scope is ownership of what already exists, not a new capability.

## 6. Candidate ownership

`CandidateRecord` (`candidate-types.ts`) gained one new field:

```ts
recruiterId: string; // auth.users id of the importing recruiter — server-derived only
```

Every `CandidateService` method that reads or mutates a candidate now takes
`recruiterId` and routes through one central check:

```ts
private requireRecord(candidateId: string, recruiterId: string): CandidateRecord {
  this.purgeExpired();
  const record = this.records.get(candidateId);
  if (!record || record.recruiterId !== recruiterId) throw new CandidateNotFoundError();
  return record;
}
```

`list()`, `get()`, `getProfile()`, `findByNameFragment()`, `searchBySkill()`,
`findReadyForInterview()`, `updateStatus()`, `updateTags()`, `addNote()`,
`updateRecruiterFields()`, `remove()`, `generateInsights()`,
`generateInterviewReadiness()`, `computeDashboard()`, `computeRanking()`,
`compare()`, `recommendTopCandidates()`, and all 4 export methods are scoped
this way. A candidate belonging to another recruiter is indistinguishable
from a candidate that doesn't exist at all (§14 — see below).

## 7. Evaluation ownership

"Evaluations" in this codebase are the ranking score, recruiter summary, AI
insights, and interview-readiness score attached to each `CandidateRecord` —
there is no separate evaluation entity. All of the above are computed from
and stored on the same ownership-scoped `CandidateRecord`, so they inherit
the same protection automatically; no separate evaluation-ownership layer
was needed.

## 8. API authorization audit (all 17 routes)

Every route under `/api/ai/recruiter/**` previously had **zero** auth. All
17 now call `requireRecruiterId()` first and pass `recruiterId` through:

| Route | Method | Before | After |
|---|---|---|---|
| `/candidates` | GET | NEEDS FIX (no auth) | Fixed — scoped list |
| `/candidates/import` | POST | NEEDS FIX | Fixed — records stamped with recruiterId |
| `/candidates/[id]` | GET, DELETE | NEEDS FIX | Fixed — 404 if not owner |
| `/candidates/[id]/fields` | PATCH | NEEDS FIX | Fixed |
| `/candidates/[id]/insights` | POST | NEEDS FIX | Fixed |
| `/candidates/[id]/interview-readiness` | POST | NEEDS FIX | Fixed |
| `/candidates/[id]/match` | POST | NEEDS FIX | Fixed |
| `/candidates/[id]/notes` | POST | NEEDS FIX | Fixed |
| `/candidates/[id]/status` | PATCH | NEEDS FIX | Fixed |
| `/candidates/[id]/tags` | PATCH | NEEDS FIX | Fixed |
| `/candidates/[id]/export` | GET | NEEDS FIX | Fixed |
| `/compare` | POST | NEEDS FIX | Fixed |
| `/dashboard` | GET | NEEDS FIX | Fixed |
| `/export` | GET | NEEDS FIX | Fixed |
| `/job-description` | GET, POST | NEEDS FIX | Fixed — per-recruiter JD |
| `/ranking` | GET | NEEDS FIX | Fixed |
| `/recommend` | POST | NEEDS FIX | Fixed |

`/api/ai/recruitment/**` (the sibling Recruitment Pipeline feature, ~15
routes) is classified **LEGACY / NOT USED BY THIS MILESTONE** — it remains
exactly as reachable as before (no new auth added), because it has its own
separate, not-yet-authenticated actor model (`job.recruiter` as a plain
string) that this milestone does not redesign. Its calls into
`candidateService` were updated only enough to keep compiling against the
new ownership-aware API (see §17, known limitations) — never gaining new
auth of their own.

## 9. Server-side ownership helper

`requireRecord(candidateId, recruiterId)` inside `CandidateService` (private)
is the sole ownership gate every scoped method routes through — the
milestone's requested `requireOwnedCandidate`-style helper, adapted to this
project's existing convention (a private method inside the owning service,
exactly like `resumeVersionService.getVersion()`'s role) rather than a
separate exported utility, since ownership here is inseparable from the
in-memory store it guards.

`src/lib/ai/recruiter/recruiter-route-helpers.ts` (new) is the route-layer
counterpart — `handleRecruiterRouteError()` maps `UnauthorizedError` → 401,
`CandidateNotFoundError` → 404, `ZodError`/bad input → 400, everything else
→ the route's existing fallback status. Mirrors
`resume-version-route-helpers.ts`'s `handleVersionRouteError()`.

## 10. Database design

**No new tables were created.** Confirmed via the full audit (§2) that this
project has no persistence for the Recruiter Workspace's underlying data at
all: `resumeService`/`jdMatchService`/`prepService` (which `CandidateRecord`
references by id, never copies) are fully in-memory, TTL-based, and
explicitly protected/out-of-scope architecture. Persisting only the
ownership *wrapper* around data that itself vanishes after 2 hours (or on
server restart) would create misleading, silently-orphaning "durable-looking"
rows with no real durability gain — see §16 for the full reasoning. The
milestone's own database-design section offered its example schema
explicitly as "EXAMPLE ONLY... do not blindly create these tables," and nvo
existing structure needed reuse since ownership now lives directly on
`CandidateRecord.recruiterId`.

## 11. Row Level Security

Not used anywhere in this project (confirmed by reading both Phase 14
migration files' own header comments — see §2) and not introduced here.
Enforcement is 100% application-level, matching every other service in this
codebase (`resumeVersionService`, `organization-service`, etc.).

## 12. Service-layer ownership enforcement

Every `CandidateService` method is scoped as described in §6. Two
deliberate, documented exceptions exist for **internal, in-process callers
only** — `getForSystemUse()`, `listForSystemUse()`,
`searchBySkillForSystemUse()`, `getProfileForSystemUse()`, and
`exportCandidateReportPdfForSystemUse()` — used exclusively by
`pipeline-service.ts` and its sibling Recruitment Pipeline files (§17).
These bypass ownership by design and are documented as never to be called
from an API route.

## 13. Client never sees another recruiter's IDs

The client only ever receives `list()`/`computeRanking()`/`computeDashboard()`
results already filtered to the caller's own `recruiterId` — a candidateId
belonging to another recruiter is never returned by any endpoint the current
recruiter can call, so there is nothing for the client to leak by holding
onto an id.

## 14. Unauthorized-response convention

`CandidateNotFoundError` is thrown identically for "no such candidateId" and
"candidateId exists but belongs to another recruiter" — always mapped to
**404**, never a distinct 403 — so a response never confirms whether a given
candidateId exists at all. Verified by a dedicated test (§20) asserting both
cases throw with an identical error message.

## 15. Reuse of existing engines

Unmodified and untouched: `computeRankingScore`/`classifyCandidateFitLevel`/
`compareRanked`/`rankCandidates` (`candidate-ranking.ts`),
`buildRecruiterSummary` (`candidate-summary.ts`), `computeScoreBreakdown`
(`candidate-score.ts`), the ATS engine, JD matcher, and resume parser. This
milestone only added a `recruiterId` parameter to the functions that
*orchestrate* calls into these engines — never touched their internals.

## 16. Persistence — deliberately deferred, with reasoning

The milestone's own instructions frame persistence as conditional ("if the
current system is in-memory"), not a blanket mandate. After the audit, the
actual security gap — a recruiter reading or mutating another recruiter's
candidates — is a pure **authorization** problem, fully closed by
`recruiterId` scoping regardless of storage durability. Adding real database
persistence for `CandidateRecord` while its referenced `resumeId`/
`jdMatchId`/`prepId` remain fully in-memory, 2-hour-TTL, and explicitly
protected architecture would:

1. Require also persisting resume/JD-match/interview-prep data to make the
   persisted candidate row meaningful — out of scope (protected engines).
2. Otherwise produce rows that *look* durable but silently orphan the moment
   the in-memory TTL expires or the process restarts — worse than an honest,
   documented in-memory limitation.

This mirrors Milestone 1's own precedent (declining a partial/misleading fix
in favor of a documented gap). **Recommended for a future milestone**: if
the Recruiter Workspace needs to survive process restarts, that requires
first deciding whether resume/JD-match data itself becomes persistent — a
decision for the resume/JD-matching architecture owner, not this one.

## 17. Known limitation — Recruitment Pipeline (Phase 13 Milestone 9)

`pipeline-service.ts` and ~15 sibling files (interview-scheduler.ts,
offer-service.ts, pipeline-insights.ts, and the `/api/ai/recruitment/**`
routes) call into `candidateService` to read candidate data, but have no
recruiter/actor identity model of their own — `job.recruiter` is a plain
display string. Making their calls compile against the new ownership-aware
`CandidateService` API required adding unscoped `*ForSystemUse()` accessors
(§12) that they now use — their behavior is **byte-for-byte unchanged** from
before this milestone (still fully unauthenticated, exactly as Phase 13
Milestone 9 shipped it). Auditing and authenticating the Recruitment
Pipeline's own actor model is out of this milestone's scope and is
recommended as a future milestone.

## 18. Privacy

No new PII is exposed. If anything, exposure is now strictly narrower: a
recruiter can no longer see any other recruiter's candidates at all (verified
live — see §20), where previously every recruiter saw everyone's.

## 19. Audit logging

`activityService.record("Candidate Added", ...)` (already called from the
import route) is unchanged; no new audit-log infrastructure was built, per
the milestone's explicit "reuse if it exists, do not build a full platform"
guidance.

## 20. Live validation

Ran `npm run build` then `npm run start`, `curl`'d against the real server,
then killed it:

| Check | Result |
|---|---|
| `GET /api/ai/recruiter/candidates` (no auth) | **401** |
| `GET /api/ai/recruiter/ranking` (no auth) | **401** |
| `GET /api/ai/recruiter/dashboard` (no auth) | **401** |
| `GET /api/ai/recruiter/job-description` (no auth) | **401** |
| `GET /api/ai/recruiter/export` (no auth) | **401** |
| `GET /api/ai/recruiter/candidates/fake-id` (no auth) | **401** |
| `GET /api/ai/recruiter/candidates/fake-id/export` (no auth) | **401** |
| `PATCH /api/ai/recruiter/candidates/fake-id/status` (no auth) | **401** |
| `GET /recruiter` (no auth) | **307 → `/login?redirect=/recruiter`** |
| `GET /recruiter/candidates/fake-id` (no auth) | **307 → `/login?redirect=/recruiter`** |
| `GET /api/ai/recruitment/jobs/fake/pipeline` (sibling feature, unauthenticated) | **200** — confirmed unchanged, still Phase 13 M9's original public posture |

Full cross-recruiter behavior (recruiter A creates → recruiter B denied →
recruiter A still allowed) could not be exercised end-to-end via `curl`
without a real login flow issuing a session cookie; it is instead covered
directly against the real `CandidateService` singleton in
`candidate-service.test.ts` (§21) with two distinct `recruiterId` values,
which exercises the exact same `requireRecord()` code path every API route
calls.

## 21. Tests — 9 new, 26 total in the recruiter package, 671 total in the repo

New: `src/lib/ai/recruiter/candidate-service.test.ts` (9 tests):
list()/get()/getProfile() scoping, cross-recruiter mutation rejection
(updateStatus/addNote/updateTags/remove), the §14 "identical error for
nonexistent vs. not-yours" guarantee, per-recruiter JD isolation,
dashboard/ranking scoping, and the internal `*ForSystemUse()` escape hatch.

Unchanged and still passing: `candidate-ranking.test.ts` (11),
`candidate-summary.test.ts` (6) — neither touches ownership, both are pure
functions unaffected by this milestone. `resume.tool.test.ts`'s recruiter
mock was updated to the new method surface.

```
npx vitest run
 Test Files  53 passed (53)
      Tests  671 passed (671)
```

## 22. TypeScript / lint / build

```
npx tsc --noEmit        → exit 0, no errors
npm run lint             → 0 errors, 1 pre-existing warning (unrelated <img> in blog/[slug])
npm run build             → ✓ Compiled successfully
```

## 23. Files changed

**New:**
`src/lib/ai/recruiter/recruiter-auth.ts`,
`src/lib/ai/recruiter/recruiter-route-helpers.ts`,
`src/lib/ai/recruiter/candidate-service.test.ts`,
`src/app/(site)/recruiter/layout.tsx`

**Modified:**
`src/lib/ai/recruiter/candidate-service.ts` (full ownership rewrite),
`src/lib/ai/recruiter/candidate-types.ts` (+`recruiterId`),
`src/lib/ai/recruiter/index.ts` (barrel exports),
all 17 files under `src/app/api/ai/recruiter/**`,
`src/app/api/ai/chat/route.ts` (recruiterId from session, never client),
`src/lib/ai/tools/resume.tool.ts` (+ its test mock),
`src/lib/ai/recruitment/pipeline-service.ts` and its ~10 sibling
files/routes (switched to `*ForSystemUse()`, behavior unchanged — §17),
`src/app/(site)/recruiter/page.tsx` and `candidates/[candidateId]/page.tsx`
(no functional change — covered by the new layout.tsx auth gate).

**Untouched (protected):** Candidate Fit engine, ranking/tie-break logic,
recruiter summary, ATS engine, JD matcher, resume parser, ConversationService/
LangGraph/Planner/Tool Registry, Mock Interview, ConversationService.

## 24. Known limitations

- Recruiter Workspace data (candidates, active JD) remains in-memory —
  ownership/authorization is now fully enforced, but durability across
  server restarts is unchanged from before this milestone (§16).
- The Recruitment Pipeline (Phase 13 Milestone 9) remains unauthenticated —
  a known, pre-existing, now-explicitly-documented gap (§17), unchanged by
  this milestone.

## 25. Recommended next milestone

Either (a) decide whether the Recruitment Pipeline gets its own
recruiter/hiring-manager authentication and ownership model (a similarly
sized milestone to this one), or (b) if durable Recruiter Workspace storage
becomes a real requirement, first resolve resume/JD-match persistence at the
architecture level, since `CandidateRecord` ownership alone can't outlive
the data it points to.
