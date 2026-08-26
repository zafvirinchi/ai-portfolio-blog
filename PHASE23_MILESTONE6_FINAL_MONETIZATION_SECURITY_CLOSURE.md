# Phase 23 — Milestone 6: Final Monetization & LLM Attack-Surface Closure Verification

## 1. Executive Summary

This milestone independently re-verified, from source, that the P0
defect found in Phase 23 M5 (8 unauthenticated, uncapped-cost LLM routes
under the legacy `src/app/api/ai/recruitment/**` tree) is fully closed,
and that no equivalent unauthenticated or unauthorized LLM-generation
path remains anywhere in the recruiter/recruitment subsystem.

**Every one of the 29 route files under `src/app/api/ai/recruitment/**`
was individually read and classified** (not sampled, not trusted from a
prior summary). Result: 9 routes are genuinely LLM-generating, and all 9
are now correctly gated (`requireRecruiterId()` + `requireFeature()`,
verified before any lookup or LLM call). The remaining 20 routes are
deterministic CRUD/reporting operations with zero OpenAI/LLM imports,
consistent with this subsystem's long-documented, deliberately
unauthenticated design for non-cost operations.

Live, unauthenticated probes against all 9 LLM routes, the real
`/api/ai/recruiter/**` workspace, and the platform checkout route all
confirm correct rejection — including with forged identity fields
(`recruiterId`, `userId`) planted directly in the request body, which
are provably never consulted.

**No new defect was found this milestone.** Full validation
(tsc/lint/tests/build/verify.sh/security scan/code-quality scan) passes
clean, with two pre-existing, out-of-scope findings noted and correctly
left untouched (§14). **Zero code was changed in this milestone.**

## 2. M5 P0 Defect Verification

Re-read all 8 fixed route files directly (not from the M5 report — from
current source) to independently confirm the fix, not merely trust that
it was applied:

| Route | `requireRecruiterId()` present | `requireFeature()` present, correct id | Order (auth → entitlement → lookup → LLM) | Catch block uses `entitlementErrorResponse()` |
|---|---|---|---|---|
| `.../pipeline/[candidateId]/recommendation` | ✅ | ✅ `recruiter.hiring_report` | ✅ | ✅ |
| `.../interviews/[interviewId]/feedback/summarize` | ✅ | ✅ `recruiter.interview` | ✅ | ✅ |
| `.../interviews/[interviewId]/generate-kit` | ✅ | ✅ `recruiter.interview` | ✅ | ✅ |
| `.../emails/invitation` | ✅ | ✅ `recruiter.interview` | ✅ | ✅ |
| `.../emails/reminder` | ✅ | ✅ `recruiter.interview` | ✅ | ✅ |
| `.../emails/offer` | ✅ | ✅ `recruiter.hiring_report` | ✅ | ✅ |
| `.../emails/rejection` | ✅ | ✅ `recruiter.hiring_report` | ✅ | ✅ |
| `.../emails/follow-up` | ✅ | ✅ `recruiter.candidates` | ✅ | ✅ |

All 8 confirmed structurally identical to each other and to the
pre-existing precedent (`interview-readiness`, Phase 19 M3). Live-probed
unauthenticated (§11) — all 401.

## 3. Legacy Recruitment Route Inventory (Complete, 29/29)

| Route | Class | LLM? | Notes |
|---|---|---|---|
| `analytics` (GET) | B Deterministic | No | `computeAnalytics()`, pure aggregation |
| `export` (GET) | D Export | No | CSV/Excel/PDF report rendering, zero OpenAI import |
| `insights` (GET) | B Deterministic | No | `computeInsights()`, pure aggregation |
| `interviews` (GET/POST) | B Deterministic | No | Scheduling only |
| `interviews/[id]/feedback` (POST) | B Deterministic | No | Records a rating/notes, no generation |
| `interviews/[id]/status` (PATCH) | B Deterministic | No | Status transition |
| `interviews/[id]/feedback/summarize` (POST) | **A LLM** | **Yes** | **Fixed, M5** |
| `interviews/[id]/generate-kit` (POST) | **A LLM** | **Yes** | **Fixed, M5** |
| `jobs` (GET/POST) | B Deterministic | No | CRUD |
| `jobs/[id]` (GET/PATCH/DELETE) | B Deterministic | No | CRUD |
| `jobs/[id]/analytics` (GET) | B Deterministic | No | Same aggregation as top-level analytics, scoped to one job |
| `jobs/[id]/duplicate` (POST) | B Deterministic | No | Field copy |
| `jobs/[id]/status` (PATCH) | B Deterministic | No | Status transition |
| `jobs/[id]/pipeline` (GET/POST) | C Data retrieval | No | Enrichment join + attach; `maxDuration=60` is a leftover flag, not evidence of an LLM call (verified: zero OpenAI import) |
| `jobs/[id]/pipeline/[cid]` (GET) | C Data retrieval | No | Read-only join |
| `jobs/[id]/pipeline/[cid]/assign` (PATCH) | B Deterministic | No | Field update |
| `jobs/[id]/pipeline/[cid]/stage` (PATCH) | B Deterministic | No | Stage transition |
| `jobs/[id]/pipeline/[cid]/interview-readiness` (POST) | **A LLM** | **Yes** | Pre-existing fix (Phase 19 M3) — re-verified intact |
| `jobs/[id]/pipeline/[cid]/export` (GET) | D Export | No | PDF render only; pre-existing pipeline-membership fix (Phase 21 M1) re-verified intact |
| `jobs/[id]/pipeline/[cid]/recommendation` (POST) | **A LLM** | **Yes** | **Fixed, M5** |
| `notifications` (GET) | E Other | No | Read-only list |
| `notifications/[id]/read` (PATCH) | E Other | No | Flag update |
| `offers` (GET/POST) | B Deterministic | No | CRUD |
| `offers/[id]/status` (PATCH) | B Deterministic | No | Status transition |
| `emails/invitation` (POST) | **A LLM** | **Yes** | **Fixed, M5** |
| `emails/reminder` (POST) | **A LLM** | **Yes** | **Fixed, M5** |
| `emails/offer` (POST) | **A LLM** | **Yes** | **Fixed, M5** |
| `emails/rejection` (POST) | **A LLM** | **Yes** | **Fixed, M5** |
| `emails/follow-up` (POST) | **A LLM** | **Yes** | **Fixed, M5** |

**9 of 29 routes are genuinely LLM-generating. All 9 are now gated.**
Every remaining route was confirmed to import zero OpenAI/LangChain
client anywhere in its call chain (checked the underlying service file
for each, not just the route file).

## 4. LLM Call Graph

Traced every real generator this milestone's scope covers:

- **Recruitment pipeline (9 routes, §3)**: `pipelineService.generateHiringRecommendation()`, `interviewScheduler.generateFeedbackSummary()`, `interviewScheduler.generateInterviewKit()`, `notification-service.ts`'s 4 `generate*Email()` functions, `candidateService.generateInterviewReadiness()` — each traced to its route, each now (or already) sitting behind `requireRecruiterId()` + `requireFeature()`.
- **Real recruiter workspace** (`src/app/api/ai/recruiter/**`) — unchanged since M5's mechanical trace (git-confirmed: zero files in this directory modified since M5). `candidateService.matchCandidate/reEvaluateCandidate/generateInsights/compare/recommendTopCandidates`, `recruiterJobService.createJob` (JD parsing) — all previously confirmed gated by `requireFeature`/`requireQuota` before the call, all unchanged.
- **Chat tools** (`resume.tool.ts`'s recruiter branch) — unchanged since M5; `recruiterId` still provably session-derived only (`recruiterRequestContext`, seeded from `authUser?.id` in `chat/route.ts`, never a client-supplied field); compare/recommend still gated by `requireFeature(recruiterId, "recruiter.analytics")` before the LLM call, matching their REST siblings exactly.
- **Ranking, coverage/study-plan** — re-confirmed deterministic (no OpenAI import), correctly ungated, per the established M2 conclusion — not regressed.

No new generator function was found reachable from this milestone's
scope that lacks the gate pattern above.

## 5. Authentication/Authorization Verification

All 9 LLM routes: identity resolved exclusively via
`requireRecruiterId()` (`recruiter-auth.ts` — `supabase.auth.getUser()`
only, zero body/query parsing for identity). Live-probed with a forged
`recruiterId`/`userId` planted directly in the POST body (§11) — rejected
identically to a request with no body at all, proving the field is never
read for authorization.

**Ownership, precisely stated**: for the 8 newly-fixed routes, the
underlying data (`pipelineService`/`jobService`/`interviewScheduler`/
`offerService`) is a shared, process-memory, in-memory store with **no
per-recruiter ownership column at all** — this is true of all 29 routes
in this legacy tree, not specific to the 8 fixed this milestone, and
pre-dates M5. The fix therefore closes the **cost/authentication**
exposure (a real session + a real RECRUITER entitlement is now required
for every LLM call) but does not — and per CLAUDE.md's explicit
instruction not to redesign this subsystem, should not — retrofit
per-recruiter data ownership onto a legacy data model that was never
designed with it. This is the same, exact scope boundary the
`interview-readiness` precedent already established: that route's own
"ownership" comes entirely from delegating to the real, Supabase-backed
`candidateService` (which does have `recruiter_id` scoping) — the 8
newly-fixed routes have no equivalent real-data path to delegate to,
since their operations are native to the legacy in-memory pipeline. **Any
authenticated recruiter can act on any job/candidate/interview/offer
within this shared legacy store** — unchanged before and after this
fix, consistent with the subsystem's long-documented "intentionally
unauthenticated for non-cost/IDOR-specific defects" design, and
explicitly out of scope to redesign per this milestone's own
instructions.

## 6. IDOR Results

Searched the full recruiter/recruitment subsystem for `userId`/
`recruiterId`/`candidateId`/`jobId`/`organizationId` read from a request
body/query/route param and used for an authorization decision:

- **`src/app/api/ai/recruiter/**`** (the real workspace): confirmed
  unchanged from M2/M5 — `recruiterId` always from `requireRecruiterId()`;
  `candidateId`/`jobId` are route/body params used only to *look up* a
  record, with the actual authorization always re-derived from the
  session-resolved `recruiterId` via `requireRecord()`/`getJob()` — a
  route parameter identifies a resource, never authorizes one.
- **`src/app/api/ai/recruitment/**`** (the 9 LLM routes): identical
  pattern — `jobId`/`candidateId`/`interviewId`/`pipelineCandidateId`/
  `offerId` all identify a resource in the shared store; the
  authorization decision is exclusively "is there a real session with
  the RECRUITER feature entitled," never "does this id belong to you"
  (§5's documented, pre-existing scope boundary).
- **Platform billing** (`checkout`/`overview`): `userId` is always
  `requireUserId()`-derived; live-probed with a forged `userId` body
  field (§11) — ignored, request still resolves the real session.
- **Stripe webhook**: unchanged from M4/M5 — identity resolved via
  `stripe_customer_id` mapping, never trusted `metadata.userId`.

**No IDOR was found where a caller could act as another specific
recruiter, use another user's Stripe identity, or trigger an LLM billed
to an account other than their own.** The one pre-existing, explicitly
out-of-scope characteristic is §5's shared-store cross-recruiter *data*
visibility within the legacy pipeline — not an identity-spoofing or
billing-attribution defect.

## 7. Entitlement/Quota Ordering

All 9 LLM routes: `try { requireRecruiterId() → requireFeature() →
[resource lookup] → LLM call }`. Order is auth → entitlement →
resource-lookup → LLM — every rejection branch (`UnauthorizedError` from
`requireRecruiterId()`, or `FeatureNotEntitledError` from
`requireFeature()`) returns before the resource lookup or the LLM call is
ever reached, live-proven in §11 and by the M5 regression tests (each
asserting the underlying generator mock was never called on rejection).

None of the 9 call `requireQuota()` — correct and consistent, not a gap:
`recruiter.hiring_report`/`recruiter.interview`/`recruiter.candidates`
(as used by `follow-up`) are boolean-access features on their relevant
plans for these specific actions, matching the exact precedent already
set by `interview-readiness` (feature-only gate, no quota check). No
quota metric was invented or added.

## 8. Usage-Accounting Verification

None of the 9 LLM routes call `recordUsage()` — consistent with §7 (no
metric is checked, so none is recorded), matching `interview-readiness`'s
own established precedent exactly. This is not a new gap introduced by
M5's fix; it mirrors the one pre-existing route in this exact family.
Multi-agent fan-out is not reachable from any of these 9 routes (they
each make a single, direct generator call). No retry logic exists in any
of the 9 that could double-charge. No bulk variant of these 9 routes
exists (each operates on exactly one `pipelineCandidateId`/`interviewId`
per call) — no multiplication-of-charge concern applies here. **No usage-
accounting defect found; usage policy was not modified.**

## 9. Alternate-Route Bypass Analysis

Re-verified the specific classes named:

- **Single-item vs. bulk**: `bulkUpdateStatus()` (real recruiter
  workspace) still gates the entire batch via one upfront ownership
  query before any write — unchanged from M2/M4, not touched this
  milestone.
- **Dedicated route vs. chatbot**: compare/recommend still identically
  gated on both paths (§4) — the Phase 19 fix remains intact, re-verified
  fresh from source, not merely cited from M5.
- **New route vs. legacy route**: this is exactly what M5/M6 targeted —
  the legacy `recruitment/**` tree's 9 LLM routes now carry the
  identical gate as their `recruiter/**` counterparts reach through
  different call paths; no longer usable as a bypass.
- **UI action vs. direct API**: irrelevant distinction server-side — every
  gate is enforced in the route/service layer, never only in UI code;
  confirmed via direct `curl` probes bypassing the UI entirely (§11).
- **Session continuation vs. session creation**: ephemeral-session
  features (resume-rewriter, mock-interview, etc.) still correctly gate
  only at session start, per the documented "unguessable id" architecture
  — unchanged, out of this milestone's recruiter-specific scope, not
  re-audited in depth here since no code in that area changed.

**No alternate-route entitlement bypass found.**

## 10. Client Entitlement UX Verification

Re-confirmed the 4 components fixed in M5 (`ResumeUpload.tsx`,
`MockInterviewDebrief.tsx`, `MockInterviewProgress.tsx`,
`JdOptimizationReview.tsx`) still correctly render `UpgradePrompt` for
`AUTH_REQUIRED`/`FEATURE_NOT_INCLUDED`/`QUOTA_EXCEEDED` — unchanged since
M5 (git-confirmed no further edits). `UpgradePrompt` itself continues to
route `AUTH_REQUIRED` to `/login`, name the unlocking plan for
`FEATURE_NOT_INCLUDED`, and show usage/reset info for `QUOTA_EXCEEDED` —
unchanged, re-confirmed by direct read. Every recruiter export button
(`RecruiterReportsTab`, `RecruiterComparisonTab`, `RecruiterCandidateTable`)
still uses `downloadExport()` (fetch+blob), never raw `<a href>`, for any
export whose route can reject with an entitlement error — unchanged
since the M5 sweep, re-spot-checked this milestone. No raw JSON error
body was found rendered directly as UI in any component checked this or
last milestone.

## 11. Persona Routing Verification

Re-read `finalizeLogin()`, all three MFA-verify routes, `auth/callback/route.ts`,
and (this milestone's own §2/§7 area of interest) `reset-password/route.ts` —
all unchanged since M5, all still correctly wired: `defaultLandingPath` is
computed once via `resolveDefaultLandingPath()` and consumed by every
completion path. Grepped `src/` fresh for `/settings/organization` — the
same 7 occurrences as M5, all legitimately org-scoped, zero generic
post-auth default remaining. RECRUITER → `/recruiter`; everyone else
(including ADMIN-only) → `/resume-analyzer`; multi-role deterministically
prioritizes RECRUITER — all unchanged, all re-confirmed from current
source rather than assumed.

## 12. Stripe/Role Lifecycle Verification

Re-read (not re-decided) the M4 finding: `removePlatformRole()` still
does not touch Stripe/`platform_subscriptions`; `resolveEffectivePlans()`
still fully and immediately cuts off recruiter entitlements the instant
the role is removed, regardless of subscription state (re-confirmed via
the same code paths M4/M5 already traced, unchanged).

**Classification: B — product/operations decision required.** This is
unchanged from M4/M5; it is not reclassified as a defect (access control
is correct — a former recruiter genuinely cannot use recruiter features)
and not reclassified as intentional-and-final (no code or documentation
anywhere states this is the deliberately desired end state for billing).
No cancellation logic was implemented, per explicit instruction.

## 13. Migration/Operational State

Independently re-verified (read-only, no destructive operation):

```
Migrations: all required tables confirmed EXISTS via select("*").limit(1)
            (same 22-table set M5 verified — not re-run in full this
            milestone since no schema-relevant code changed; spot-checked
            anonymous_ai_requests and platform_subscriptions again,
            both still EXISTS).
Stripe:     still NOT configured — zero STRIPE_*/PLATFORM_STRIPE_* env vars.
Admin:      unchanged — 1 ADMIN-role user of 2 total.
Secrets:    unchanged — no NEXT_PUBLIC_-prefixed secret exists.
```

Live Stripe E2E unavailable because credentials are not configured. No
checkout/webhook test was fabricated.

## 14. Defects Found

**None.** Two pre-existing, out-of-scope items were noted during
validation and are explicitly NOT defects requiring a fix in this
milestone:

1. `src/app/api/ai/cover-letter/route.ts` — flagged by the security
   scan's heuristic ("identity field read from request input"); spot-
   checked directly — no `userId`/`recruiterId`/`customerId`/
   `organizationId` field exists anywhere in this file. A false
   positive, consistent with this hook's known imprecision (documented
   at the start of this engagement). This file is outside this
   milestone's recruiter/recruitment scope and was not modified.
2. `console.log("[auth] Password Changed", ...)` in
   `reset-password/route.ts`, flagged by the code-quality scan
   (advisory-only, never fails) — pre-existing (not introduced by M5/M6),
   and consistent with the identical, deliberate audit-logging
   convention already used by `finalizeLogin()`'s own
   `console.log(...Login Success...)` elsewhere in this same module —
   not a defect.

## 15. Fixes Made

**None.** Per the Fix Policy: no genuine defect was found, so no code
was changed.

## 16. Deferred Product Decisions

One, unchanged from M4/M5, re-confirmed not resolvable by this audit:
should removing a user's RECRUITER role also cancel their Stripe
subscription? (§12, Classification B.)

## 17. Operational Prerequisites

One, unchanged: Stripe credentials (secret key, platform webhook secret,
price IDs) remain unconfigured in this environment.

## 18. Validation Results

```
npx tsc --noEmit                        -> clean, zero errors
npm run lint                             -> 1 pre-existing warning (unrelated: <img> in blog/[slug]), 0 errors
npm test                                  -> 111 files, 1260/1260 tests passing
npm run build                             -> exit 0, all routes compiled
.claude/skills/verification/verify.sh    -> TSC/LINT/TESTS/BUILD: PASS
                                             SECURITY SCAN: PASS (473 files scanned, 1 pre-existing false-positive finding, §14)
                                             CODE-QUALITY SCAN: PASS WITH ADVISORY WARNINGS (13 findings, all pre-existing/out-of-scope, §14)
```

Live probes (fresh, this milestone, against the running dev server):
all 9 LLM-generating recruitment routes → 401 unauthenticated, including
with forged `recruiterId`/`userId` fields planted in the request body;
the 20 deterministic/export routes remain reachable per their documented,
unchanged design; `/api/ai/recruiter/jobs` and
`/api/billing/platform/checkout` also correctly reject forged-identity
bodies purely on session absence.

## 19. Final Classification

**PHASE 23 — CODE COMPLETE**

Zero unauthenticated LLM paths remain (9/9 verified gated). Zero
unauthorized recruiter LLM paths were found (identity is provably
session-derived end to end, live-proven against forged body fields).
Zero alternate-route entitlement bypasses were found (dedicated/chatbot/
legacy/bulk paths all verified consistent). Zero new IDOR findings (the
one pre-existing, documented, explicitly out-of-scope characteristic is
the legacy pipeline's shared-store cross-recruiter data visibility, which
is a deliberate architectural boundary this milestone was instructed not
to redesign, not an identity or billing-attribution defect). Entitlement/
quota ordering is correct everywhere checked. Usage accounting has no
double-charge or wrong-metric defect. Persona routing is complete and
consistent across every authentication-completion path.

No Milestone 7 is proposed. The two open items (Stripe configuration;
the role-removal/subscription-cancellation product decision) are
operational and product prerequisites, not code defects, and were
correctly left untouched per this milestone's explicit instructions.
Nothing in this milestone has been committed — no code was changed.
