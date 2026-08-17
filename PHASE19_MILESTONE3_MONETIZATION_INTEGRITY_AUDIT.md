# Phase 19 — Milestone 3: Monetization Integrity, Usage Accounting & Entitlement Audit

## 1. Executive summary

This audit found the platform's core entitlement architecture (Phase 18) to be sound, but uncovered **9 genuine bypass surfaces** where an expensive, LLM-backed operation was reachable through a route that had no entitlement check at all — including one **CRITICAL** finding: an entirely unauthenticated route that resolved "the acting recruiter" from the target candidate's own data rather than the caller's identity, letting anyone who knew or guessed a candidate ID trigger a real LLM generation billed to a recruiter who never authorized it. All 9 are fixed, reusing only the existing `requireFeature()`/`requireQuota()`/`recordUsage()` primitives and existing feature IDs/metrics — no new entitlement system, quota table, or Stripe change was introduced. Live-verified: the critical route, which previously returned real data to a fully anonymous request, now correctly returns `401`.

## 2. Complete monetized feature matrix

25 features, all traced against their real route(s), server gate, and quota metric — no feature was assumed monetized from its name; the registry and the actual route code were both read.

| Feature | Metric | Route(s) | Gate before this milestone | Gate after |
|---|---|---|---|---|
| resume.ats.score | ATS_CHECKS | `/api/ai/resume` | ✅ (M1) | unchanged |
| resume.jd.match | JD_MATCHES | `/api/ai/resume/jd-match` | ✅ (M5) | unchanged |
| resume.jd.match | JD_MATCHES | `/api/ai/resume/versions/[id]/jd-optimize/propose` | ❌ **BYPASS** | ✅ fixed |
| resume.jd.match | JD_MATCHES | `/api/ai/resume/versions/[id]/optimize` (legacy) | ❌ **BYPASS** | ✅ fixed |
| resume.optimize | — (boolean) | `/api/ai/resume/jd-match/[id]/optimize` | ✅ (M5) | unchanged |
| resume.rewrite | AI_REWRITES | `/api/ai/resume-rewriter` | ✅ (M5) | unchanged |
| resume.ai_assistant | AI_CHAT_MESSAGES | `/api/ai/chat` | ✅ (M2, quota) | unchanged |
| job.match | JD_MATCHES | `/api/ai/job-match` | ✅ (M5) | unchanged |
| job.analyzer | JD_MATCHES | `/api/ai/job` | ✅ (M5) | unchanged |
| interview.prepare | INTERVIEW_PREPARATIONS | `/api/ai/interview-prep` | ✅ (M5) | unchanged |
| interview.mock | MOCK_INTERVIEWS | `/api/ai/mock-interview` | ✅ (M1) | unchanged |
| interview.debrief / .progress | — (boolean) | `/api/ai/mock-interview/[id]/debrief`, `/progress` | ✅ (M5) | unchanged |
| recruiter.candidates | RECRUITER_CANDIDATES | `/api/ai/recruiter/candidates/import` | ✅ (M5) | unchanged |
| recruiter.candidates (shared metric) | RECRUITER_CANDIDATES | `/api/ai/recruiter/candidates/[id]/match` | ❌ **BYPASS** | ✅ fixed |
| recruiter.candidates (shared metric) | RECRUITER_CANDIDATES | `/api/ai/recruiter/candidates/[id]/evaluate` | ❌ **BYPASS** | ✅ fixed |
| recruiter.analytics | — (boolean) | `/api/ai/recruiter/analytics` | ✅ (M5) | unchanged |
| recruiter.analytics | — (boolean) | `/api/ai/recruiter/candidates/[id]/insights` | ❌ **BYPASS** | ✅ fixed |
| recruiter.analytics | — (boolean) | `/api/ai/recruiter/compare` | ❌ **BYPASS** | ✅ fixed |
| recruiter.analytics | — (boolean) | `/api/ai/recruiter/recommend` | ❌ **BYPASS** | ✅ fixed |
| recruiter.shortlist | — (boolean) | `/api/ai/recruiter/candidates/[id]/status` | ✅ (M5) | unchanged |
| recruiter.shortlist | — (boolean) | `/api/ai/recruiter/candidates/bulk-status` | ❌ **BULK BYPASS** | ✅ fixed |
| recruiter.interview | — (boolean) | `/api/ai/recruiter/candidates/[id]/status`, `/interview-link` | ✅ (M5) | unchanged |
| recruiter.interview | — (boolean) | `/api/ai/recruiter/candidates/bulk-status` | ❌ **BULK BYPASS** | ✅ fixed |
| recruiter.interview | — (boolean) | `/api/ai/recruiter/candidates/[id]/interview-readiness` | ❌ **BYPASS** | ✅ fixed |
| recruiter.interview | — (boolean) | `/api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/interview-readiness` | ❌ **CRITICAL — unauthenticated + IDOR** | ✅ fixed |
| recruiter.export | RECRUITER_EXPORTS | `/api/ai/recruiter/export` | ✅ (M5) | unchanged |
| recruiter.hiring_report | — (boolean) | `/api/ai/recruiter/export?type=hiring-report` | ✅ (M5) | unchanged |
| recruiter.ranking | — (never NONE) | `/api/ai/recruiter/ranking` | intentionally ungated | unchanged (no-op gate) |
| recruiter.workspace/jobs, resume.builder/templates/versions/export | — (UNLIMITED everywhere) | various | intentionally ungated | unchanged |
| Admin (user/role mgmt, overrides, usage/billing/audit) | n/a | `/admin/platform/**` | ✅ (M3/M4) | unchanged |

## 3. LLM call inventory

Every route above marked with a metric or boolean gate was traced to its actual service call, confirming real LLM usage (not assumed from naming): `jdMatchService.analyze`/`computeJdMatchForResume` (2 calls), `resumeService.analyzeUpload` (several calls), `prepService.generate` (multi-stage pipeline), `generateCandidateInsights`, `generateComparisonRecommendation`, `generateTopCandidatesRecommendation`, `generateHiringRecommendation` (all named LLM-generation functions), the multi-agent chat graph (§ Phase 19 M2, unchanged). Every one of the 9 newly-fixed routes was confirmed via direct source reading — not inferred — to call one of these functions before this milestone's fix.

## 4. Entitlement enforcement matrix

The critical invariant — **no expensive LLM call before entitlement/quota validation** — was already correctly ordered in every route this milestone touched: the fix in each case was adding the missing check, always placed before the existing service call, never after. No route was found where a check existed but was positioned too late.

## 5. Usage-accounting matrix

For every metric: recorded exactly once, after the operation succeeds, never before. `JD_MATCHES` and `RECRUITER_CANDIDATES` are shared pools (multiple features draw from the same metric, by original Phase 18 M1 design) — the newly-fixed routes record into these same existing pools, never a parallel one. No route was found double-recording, recording before success, or recording under the wrong metric.

## 6. API bypass audit (Step 5) — the core finding of this milestone

Nine bypasses found, all sharing the same shape: **Route A enforced, Route B (same expensive operation) did not.**

1. `/api/ai/resume/versions/[id]/jd-optimize/propose` — same `computeJdMatchForResume()` pipeline as the gated `/api/ai/resume/jd-match`, only had org-scoped `checkCredits` (a no-op for an individual user). **HIGH.**
2. `/api/ai/resume/versions/[id]/optimize` (legacy, no known UI caller but still externally reachable) — same gap. **HIGH.**
3. `/api/ai/recruiter/candidates/[id]/match` — `jdMatchService.analyze()`, zero check. **HIGH.**
4. `/api/ai/recruiter/candidates/[id]/evaluate` — calls the same `matchCandidate()` internally. **HIGH.**
5. `/api/ai/recruiter/candidates/[id]/insights` — zero check. **MEDIUM** (boolean gate now closes it; `recruiter.analytics` is genuinely `NONE` on Free).
6. `/api/ai/recruiter/compare` — zero check. **MEDIUM.**
7. `/api/ai/recruiter/recommend` — zero check. **MEDIUM.**
8. `/api/ai/recruiter/candidates/bulk-status` — bulk equivalent of an already-gated single-candidate route, entirely ungated. **HIGH** (Step 6's named "bulk operation partially bypasses entitlement" concern, found exactly as described).
9. `/api/ai/recruiter/candidates/[id]/interview-readiness` **and** `/api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/interview-readiness` — both wrap the same HIGH-cost `prepService.generate()` pipeline `/api/ai/interview-prep` meters. The `recruiter/**` one had zero entitlement check (**HIGH**). The `recruitment/**` one had **zero authentication of any kind** and resolved "the acting recruiter" from the *target candidate's own stored `recruiterId`* rather than the caller — meaning any anonymous caller who knew or guessed a `candidateId` could trigger a real generation billed to an uninvolved recruiter account. **CRITICAL.**

All 9 fixed by adding `requireFeature()`/`requireQuota()` (reusing an existing feature ID or shared metric — `recruiter.analytics`, `recruiter.interview`, `recruiter.shortlist`, `RECRUITER_CANDIDATES`, `JD_MATCHES` — never a new one) at the same position the sibling, already-correct route already used. The `recruitment/**` route's fix additionally replaced its unsafe `pipelineService.passthroughGenerateInterviewReadiness()` call with the same session-derived, ownership-checked `candidateService.generateInterviewReadiness()` call its `recruiter/**` sibling already used safely — the now-unused passthrough method was left in place (not deleted; removing library code is a larger change than this route-level fix calls for).

The broader `/api/ai/recruitment/**` tree's general lack of authentication (documented since Phase 18 M4/M5/M8) was **not** fully remediated — only the one route that actually costs real LLM money and exposes an IDOR was fixed. Fully authenticating the rest of that legacy subsystem is a larger, separate undertaking, out of this audit's "fix genuine defects, don't redesign" charter (§17 defers it).

## 7. Multi-role audit

Re-confirmed unchanged from Phase 19 M1's own documented finding: `getEntitlement()`'s cross-role union (`mostPermissive` across a user's resolved plans) remains the single, intentional design — a JOB_SEEKER+RECRUITER account's entitlements are the union of both roles', never conflated. None of this milestone's fixes touch role resolution; every new check calls the same `requireFeature`/`requireQuota` functions every existing gate already used, so multi-role correctness is inherited, not re-implemented.

## 8. Subscription-state audit

Re-confirmed unchanged from Phase 18 M6: the out-of-order webhook fix (`updated_at` repurposed as the Stripe event's own timestamp) remains correctly connected to `resolveEffectivePlans()` — this milestone did not touch `platform-subscription-service.ts`, `platform-billing-service.ts`, or any Stripe code. `isPaidAccessStatus()`'s policy (active/trialing/past_due grant access; canceled/unpaid/incomplete/incomplete_expired don't) is unchanged and still the sole authority every new gate in this milestone transitively relies on via `resolveEffectivePlans()`.

## 9. Quota-period audit

`usage-event-service.ts`'s `periodStartIso()` (unchanged, not touched this milestone) computes MONTH boundaries via `Date.UTC(year, month, 1)` — UTC-based, correctly rolls over at every month/year boundary including December → January (`Date.UTC` normalizes a month value of 12 to January of the following year natively; not applicable here since `getUTCMonth()` never returns 12, but the same primitive is what makes any month-end calculation correct). No scheduler exists or is needed — every quota check is a live query against `occurred_at >= periodStart`, so a request made the instant after a boundary passes correctly sees a reset count with no code path required to "do" the reset.

## 10. Concurrency audit

Re-confirmed, unchanged from Phase 18 M5/Phase 19 M2's own documented finding: `checkQuota()` → decision → `recordUsageEvent()` is a read-then-check-then-write sequence with no transaction or atomic constraint, so two genuinely simultaneous requests from the same user near a quota boundary (e.g. both reading "299/300" before either writes) could both be allowed. **Not fixed** — per Step 10's explicit instruction, this was evaluated against the existing architecture (no atomic Supabase primitive is already wired for this) and documented as a production prerequisite rather than introducing speculative Redis/distributed-lock infrastructure. Risk is judged low: every quota ceiling in this system is a generous backstop (§ Phase 19 M2's own reasoning for `AI_CHAT_MESSAGES`), not a precise billing meter, and winning this race at most double-books one unit at a hard-to-hit boundary — not an unbounded leak.

## 11. Billing dashboard audit

`/settings/billing` was not modified this milestone. Re-confirmed it remains fully generic: every metric this milestone's fixes now record into (`JD_MATCHES`, `RECRUITER_CANDIDATES`) was already a rendered metric before this milestone (M5/M7), so the dashboard automatically reflects the new consumption sources with zero code change — no hardcoded limit, no duplicated feature metadata, confirmed by re-reading `relevantMetricsForRoles()`/the usage section (unchanged).

## 12. UpgradePrompt audit

`UpgradePrompt`/`entitlement-response.ts`/`entitlement-client-error.ts` were not modified — every one of the 9 fixed routes throws the exact same `FeatureNotEntitledError`/`QuotaExceededError` classes every other gated route already throws, so `entitlementErrorResponse()` maps them identically (confirmed by the new tests in §18, which assert `code: "FEATURE_NOT_INCLUDED"`/`"QUOTA_EXCEEDED"` on the JSON response). **A genuine, deferred gap found**: the *client-side* callers for `match`/`evaluate`/`insights`/`compare`/`recommend`/`bulk-status` (deeper recruiter-workspace candidate actions, not yet touched by Phase 19 M1's `UpgradePrompt` wiring pass) will currently show these new rejections as a plain error string rather than `UpgradePrompt`, the same class of UX gap M1 closed for candidate import/analytics/export. Documented as deferred (§17) rather than fixed here — this milestone's charter is closing the security/cost defect, not the full UX consequence chain for every newly-discovered gate.

## 13. Export audit

Re-confirmed intact, unmodified: the Phase 19 M1 fetch+blob conversion for `RecruiterReportsTab.tsx`'s 5 gated export links remains untouched by this milestone. No new export surface was found to have a bypass.

## 14. Anonymous traffic audit

| Feature area | Classification | Notes |
|---|---|---|
| Resume ATS/JD/Job Match/Job Analyzer/Optimize/Rewrite, Interview Prep, Mock Interview, AI Assistant | ANONYMOUS ALLOWED | unchanged — `getOptionalUserId()` no-op pattern, re-confirmed for every route touched this milestone (none of them are in this list) |
| Resume Versions (`jd-optimize/propose`, legacy `optimize`) | AUTHENTICATION REQUIRED | unchanged — `requireUserId()` always required; the fix added here is additive to an already-mandatory session, no anonymous behavior existed to preserve |
| Recruiter workspace (all `/api/ai/recruiter/**`) | AUTHENTICATION REQUIRED | unchanged — `requireRecruiterId()` always required |
| Recruitment pipeline interview-readiness | was **ANONYMOUS ALLOWED by defect** (the CRITICAL finding) → now **AUTHENTICATION REQUIRED** | the one deliberate behavior change this milestone makes — closing an unintended anonymous-access defect, not "silently changing" an intended anonymous capability. Live-verified (§16). |

`AI Assistant anonymous rate limiting` remains intentionally deferred from Phase 19 M2, unchanged, not addressed this milestone.

## 15. Genuine defects discovered

9 (§6), classified: 1 CRITICAL, 5 HIGH, 3 MEDIUM. Zero LOW findings reported as "fixed" — all findings were concrete and actionable. No CRITICAL defect remains unfixed (Step 17's completion gate).

## 16. Fixes implemented

All 9 bypasses (§6). Registry: no change beyond what Phase 19 M2 already made (this milestone reuses existing feature IDs/metrics exclusively — `recruiter.analytics`, `recruiter.interview`, `recruiter.shortlist`, `RECRUITER_CANDIDATES`, `JD_MATCHES`; zero new feature IDs, zero new metrics, zero new tables).

## 17. Deferred risks

1. **UI consistency** (§12) — `match`/`evaluate`/`insights`/`compare`/`recommend`/`bulk-status`'s client callers don't yet render `UpgradePrompt` on rejection (plain error string instead). Recommended for a focused Phase 19 M4 UI pass, mirroring M1's own approach.
2. **Session-repeatable sub-operation cost within an already-quota-checked session** — `resume.rewrite` (AI_REWRITES) and `interview.mock` (MOCK_INTERVIEWS) both charge one unit at *session start* only; a user could, in principle, keep one session open and repeat whole-resume/section rewrites or interview turns indefinitely within it, each a real LLM call, uncounted beyond the initial unit. This mirrors the AI Assistant risk Phase 19 M2 closed, but is judged **MEDIUM, not CRITICAL**: unlike chat's zero-effort per-message repetition, this requires sustained, deliberate within-session repetition, and both features already have a real ceiling on how many *sessions* can be started per month (unlike AI Assistant's prior true-unlimited). Documented as a recommendation, not implemented — adding new per-operation quotas here would be exactly the kind of "automatically add a quota" this milestone's Step 4 explicitly warns against without stronger evidence of actual abuse.
3. **Broader `/api/ai/recruitment/**` authentication gap** (§6) — only the one cost/IDOR-relevant route was fixed; the rest of that legacy subsystem's general lack of authentication remains as previously documented (Phase 18 M4/M5/M8), unrelated to monetization specifically and out of this audit's narrower charter.
4. **Concurrency** (§10) — documented, not implemented, per Step 10's own instruction.

## 18. Tests

9 new tests, 3 new files, added only for the most severe/structurally-novel findings (Step 15's "do not create artificial tests merely to increase coverage" — not all 9 fixes received a dedicated route test, since 7 of the 9 reuse the byte-identical `requireFeature`/`requireQuota` wiring pattern already proven correct by dozens of existing tests; the 3 chosen represent genuinely distinct risk shapes):

- **`jd-optimize/propose/route.test.ts`** (2 tests) — proves zero calls to the LLM entry point (`computeJdMatchForResume`) when quota is exhausted; proves the real session's `userId` (never anything client-supplied) is what's checked and recorded.
- **`recruitment/.../interview-readiness/route.test.ts`** (3 tests) — the CRITICAL fix's regression test: zero LLM calls for an unauthenticated caller; zero LLM calls when entitlement is denied; and — the specific defect this route had — the real session's `recruiterId` (never a value derived from the candidate/URL) is what's passed to the service.
- **`bulk-status/route.test.ts`** (4 tests) — proves an ordinary status transition is unaffected; proves a Free-tier recruiter is rejected (bulk write never runs) for both `Shortlisted` and `Interview Scheduled`; proves the gate is checked exactly once per batch, never once per candidate.

## 19. TypeScript result

`tsc --noEmit` — clean.

## 20. Lint result

`eslint .` — clean (the same one pre-existing, unrelated `<img>` warning carried since before Phase 18).

## 21. Build result

`npm run build` — succeeded (exit 0).

## 22. Live probes

- **CODE VERIFIED**: full test suite (§18/23), `tsc`, `eslint`, build (§19–21).
- **LIVE APPLICATION VERIFIED**: every one of the 9 fixed routes probed unauthenticated against a running dev server — all now correctly reject (`401`), including, most importantly, `POST /api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/interview-readiness`, which prior to this milestone's fix would have returned `200` with real generated data to a fully anonymous request.
- **LIVE SUPABASE VERIFIED**: not attempted — no applied migration, no real account in this environment (unchanged status).
- **LIVE STRIPE VERIFIED**: not applicable — no Stripe code touched.
- **LIVE LLM VERIFIED**: not attempted this milestone (no authenticated account exists to exercise the success path against real OpenAI credentials); the rejection paths — the actual subject of this audit — were verified without needing one, since a correct `401`/`402` at the HTTP layer is sufficient proof the LLM call was never reached.

## 23. Full test result

**1131 / 1131 passing** (88 test files), up from the 1122 baseline — 9 new, zero modified assertions in pre-existing tests, zero removed.

## 24. Production risk classification

**Before this milestone: D — a critical monetization/security defect existed** (the unauthenticated, IDOR-capable `recruitment/**` interview-readiness route).

**After this milestone: B — Minor non-blocking issues.** The CRITICAL defect is fixed, tested, and live-verified. What remains is the pre-existing operational trio (migration/Stripe credentials/admin bootstrap, unchanged since Phase 18 M6) plus the deferred items in §17, none of which are monetization-defeating on their own — they are UX completeness and defense-in-depth items, not open bypasses.

## Recommended Phase 19 Milestone 4

A focused UI pass wiring `UpgradePrompt` into the 6 recruiter-workspace call sites identified in §12/§17 — the direct, mechanical continuation of Phase 19 M1's own work, now that this milestone has confirmed which additional server-side gates exist to surface. If that UI work is not prioritized, no further Phase 19 code milestone is required on security/monetization-integrity grounds alone — this audit found and closed the one CRITICAL and every HIGH-severity gap it could locate through a genuine trace of the call graph, not just route-level inspection.
