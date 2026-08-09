# Phase 13 Milestone 9 — AI Recruitment Pipeline

## Goal

Turn the Recruiter Workspace's candidate pool (Milestone 8) into a full
hiring pipeline: real job openings, a Kanban-style stage board per job,
scheduled interviews with AI-generated kits, job-specific AI hiring
recommendations, offers, notifications, analytics, and AI-detected
pipeline insights — all additive, none of it touching the now-protected
Recruiter Workspace (`candidateService`, `candidate-ranking.ts`) or
anything else in the DO-NOT-MODIFY list.

## Architecture

This is the first milestone to build **on top of** a previous
milestone's own service, not just on the original resume/JD-match
primitives. A `PipelineCandidate` is a thin, job-scoped wrapper around
an existing Milestone 8 candidate — never a new resume-import path:

```
candidateService.list()/.get()   (Milestone 8, read-only)
        │
        ▼
POST /api/ai/recruitment/jobs/[jobId]/pipeline   PipelineService.attachCandidate()
  {candidateId}                                    │
        │                                          ├─► synthesizeJdText(job) — this
        │                                          │     job's own structured fields
        │                                          │     (title/skills/experience/
        │                                          │     education), not Milestone 8's
        │                                          │     workspace-wide JD
        │                                          │
        │                                          └─► jdMatchService.analyze()
        │                                                (Milestone 1, read-only) →
        │                                                a job-specific jdMatchId
        ▼
   PipelineCandidate {candidateId, jobId, stage, stageHistory, jdMatchId, ...}
        │
        ├─► PATCH .../stage          → candidate-stage.ts (unconstrained moveStage)
        ├─► POST  .../recommendation → hiring-recommendation.ts (1 LLM call, job-specific)
        ├─► POST  .../interview-readiness → passthrough to candidateService (Milestone 8)
        │
        ├─► POST /interviews          → interview-scheduler.ts
        │     .../generate-kit          (1 LLM call: checklist + questions + eval form)
        │     .../feedback               (plain recruiter input, no LLM)
        │     .../feedback/summarize     (1 LLM call, grounded in the given notes)
        │
        ├─► POST /offers              → offer-service.ts (plain data + status)
        │
        ├─► GET /jobs/[jobId]/analytics → pipeline-analytics.ts (deterministic)
        └─► GET /insights               → pipeline-insights.ts (deterministic)
```

Every score displayed for a pipeline candidate that depends on job fit
(ATS, JD Match) is recomputed **per job** via `pc.jdMatchId` — never
inherited from whatever workspace-wide JD Milestone 8's own
`candidateService` might separately have set. Resume Score and
Interview Readiness remain genuinely Milestone-8-owned concepts, read
straight from `candidateService.getProfile()`.

## Pipeline workflow

Create a job (Draft by default) → open it → attach existing candidates
from the pool (auto-computes a job-specific JD match for each) → move
candidates through the Kanban board (native HTML5 drag-and-drop in the
UI; the API itself is unconstrained — any stage to any stage, including
backward, since real hiring workflows aren't strictly linear) →
schedule interviews per stage → generate an AI interview kit → capture
feedback → optionally generate a polished feedback summary → generate a
job-specific AI hiring recommendation → create and progress an offer →
land on Hired or Rejected.

## Stage management

`CANDIDATE_STAGES` = the spec's 8 forward stages (Applied → Screening →
ATS Passed → Technical Interview → Manager Interview → HR Interview →
Offer → Hired) plus `Rejected` as a side-branch terminal reachable from
any point. `candidate-stage.ts`'s `moveStage()` is deliberately
unconstrained — it just appends `{stage, enteredAt, actingRole}` to
`stageHistory` — matching "allow drag and drop" rather than enforcing a
rigid state machine. That history is the source of truth for both the
hiring funnel (`PIPELINE_STAGES.map(stage => candidates who ever
reached this stage)`, a monotonically non-increasing funnel) and
time-to-hire (Applied → Hired timestamp delta, averaged across hired
candidates). `isStuck()`/`daysInStage()` (7-day default threshold)
back both the Analytics dashboard and the AI Insights "stuck
candidates"/"bottlenecks" detections.

## Analytics engine

`pipeline-analytics.ts`'s `computeAnalytics()` is a pure, deterministic
function over already-fetched pipeline/JD-match data — no LLM call.
Applications/Shortlisted/Rejected/Offers/Hired are derived from real
stage state; average ATS and average JD Match are read from each
candidate's own job-specific `JdMatchResult` (via `pc.jdMatchId`), never
from Milestone 8's workspace-level score. Conversion rate is
Hired/Applications. Scoped per-job (`GET /jobs/[jobId]/analytics`) or
workspace-wide (`GET /analytics`).

## AI recommendations

`hiring-recommendation.ts` is genuinely distinct from Milestone 8's own
`candidate-insights.ts` (protected, unmodified): it's **job-specific**,
grounded strictly in *this job's* required/preferred skills rather than
a general resume read. One LLM call (temperature 0.2) produces a
classification (Hire Immediately / Strong Match / Needs Review) plus
cultural fit / technical skills / leadership potential ratings (reusing
Milestone 8's own exported `ratedDimensionSchema`/`RATING_LEVELS`,
read-only import — not a duplicate definition), risk factors, and
expected learning curve.

## Reporting

CSV/Excel/PDF for two list-level report types (Hiring Report, Pipeline
Report — no dedicated export file exists in this milestone's own
11-file package list, unlike Milestone 8's `candidate-export.ts`, so
rendering lives directly in `GET /api/ai/recruitment/export`). The
third report type, "Candidate Report," stays PDF-only and reuses
Milestone 8's own `candidateService.exportCandidateReportPdf()`
directly (read-only) — it's the same underlying resume/ATS/insights
artifact, not a new pipeline-specific document.

## Chat integration

`recruitmentRequestContext` is another boolean-flag singleton context
(mirroring Milestone 8's `recruiterRequestContext` — no per-session ID
exists to key on), threaded innermost in `/api/ai/chat/route.ts` after
`recruiterMode`. `resume.tool.ts` gets one more additive branch,
checked first, handling all 6 spec-named example commands (top
candidates in a skill, ready-for-HR filter, longest-waiting/stuck
detection, job-specific recommendation by title, interview feedback
summary, hiring funnel).

## What real testing found (and fixed)

A full end-to-end HTTP walkthrough (3 known candidates imported →
Senior Backend Engineer job created and opened → all 3 attached →
Priya moved through Applied→Screening→ATS Passed→Technical
Interview→**back to Screening**→Technical Interview, confirming
unconstrained stage movement → Technical interview scheduled → AI
interview kit generated (4 checklist items, 8 questions, 4 weighted
evaluation criteria) → feedback recorded and summarized (verified the
summary only restated the given notes, no invented performance claims)
→ job-specific hiring recommendation generated ("Hire Immediately," all
required+preferred skills correctly matched) → offer created,
sent, accepted → Priya hired, Ravi rejected → analytics and insights
checked → all 7 export combinations downloaded → chat integration
tested) surfaced two real, fixed bugs and confirmed one inherited,
already-documented limitation:

1. **Job-specific score bug in the enriched pipeline list and
   analytics.** The very first pipeline-list check showed `ATS: null,
   JD Match: null` for every candidate — `pipeline-service.ts`'s
   enrichment (in the `GET .../pipeline` route) and
   `pipeline-analytics.ts`'s `atsScores` collection were both reading
   Milestone 8's own `candidateService.list()`-computed `CandidateSummary
   .scores.atsScore`/`.jdMatch` — which are correctly `null` in this
   flow, since no Milestone-8-level workspace JD was ever set; the
   *job-specific* match this milestone computes lives on
   `pc.jdMatchId`, entirely separately. **Fixed** by resolving
   `jdMatchService.get(pc.jdMatchId)` and overriding just the
   `atsScore`/`jdMatch` fields with the job-specific result in both the
   pipeline list route and `computeAnalytics()`. Re-verified after a
   clean restart: scores populated correctly (74/81/50 across the three
   candidates, matching their real, distinct skill overlaps with the
   job) and stayed correct through every subsequent analytics check.
2. **The same root-cause bug, found again in `pipeline-insights.ts`**
   after the first fix — `computeTopCandidates()` was still ranking
   candidates using Milestone 8's workspace-level (null) ATS/JD-match
   scores rather than each candidate's job-specific match, silently
   under-ranking everyone on the JD-dependent factors. **Fixed** with a
   shared `jobScopedSummary()` helper that overrides those two score
   fields from the pipeline candidate's own `jdMatchId` before ranking
   — the same fix shape applied consistently a second time once the
   pattern was recognized, rather than treating it as an isolated
   one-off.
3. **Chat integration confirmed working correctly end-to-end** once
   the message carried enough resume/pipeline signal for the protected
   Planner to route to `resume-tool` — verified via the dev server log
   directly (`[recruitment] Analytics Generated { jobId: null,
   applications: 3 }`), proving the request-scoped context propagated
   correctly and the real handler executed with real data even when
   the final spoken reply was flattened by the protected multi-agent
   layer into a generic non-answer. This is the same inherited,
   already-documented limitation from Milestones 4/6/7/8 (Planner
   misrouting a bare command to an unrelated tool; a sufficiently
   terse or complex phrasing can also trip an unrelated tool's own
   parsing, as seen when "show hiring funnel for Senior Backend
   Engineer" without resume-signal words was routed to `rag-tool` and
   hit a Supabase query-syntax error on the raw message text) — not
   re-solved here, since routing lives in protected code. One genuine
   minor bug found alongside it: `detectJobTitleFragment()`'s regex
   captured a trailing filler word ("...Senior Backend Engineer job")
   instead of stopping at the real title boundary, breaking the
   job-title lookup. **Fixed** by adding `\s+job\b` as an explicit
   regex terminator alongside the existing `role`/`position` terminators.

No other fabrication or correctness issues were found — the interview
kit, feedback summary, and hiring recommendation all stayed strictly
grounded in the real job/resume/JD-match data given, matching the
anti-fabrication discipline every prior milestone in this arc has
already established and re-verified.

## Known limitations

- No auth gate — `/recruitment` is publicly reachable like every other
  Phase 13 AI feature page, consistent with Milestone 8's stated
  posture (this portfolio demo's whole AI-features arc is open, and
  the existing `/admin` area's own API routes have no auth checks
  either).
- Same in-memory, no-persistence-layer, no-independent-TTL pattern as
  every prior milestone — a `PipelineCandidate` is dropped the moment
  its underlying Milestone 8 candidate's resume has expired (~2h),
  same discipline Milestone 8 introduced for its own candidates
  relative to `resumeService`.
- "Role Support" (Recruiter/Hiring Manager/HR/Admin) is a labeling
  concept only — an optional `actingRole` tag on stage moves and
  interview feedback, not real authentication or access control.
- Chat commands still depend on the protected Planner routing the
  message to `resume-tool` with enough signal; a bare command can be
  misrouted (inherited from Milestones 4/6/7/8, not re-solved here).
- Hiring/Pipeline report rendering lives directly in the export route
  rather than a dedicated file, since this milestone's own 11-file
  package list doesn't allocate one (unlike Milestone 8's
  `candidate-export.ts`).

## Future extensions

- **Multiple simultaneous requisitions with cross-job candidate
  views**: today a candidate can be attached to several jobs
  independently, but there's no single view showing all of a
  candidate's pipeline memberships across jobs at once.
- **Configurable stage order per job**: some roles may want a
  different or shorter pipeline (e.g. skip Manager Interview) —
  `PIPELINE_STAGES` is currently a single fixed sequence shared by
  every job.
- **Persistent workspace storage**: once the "Database Schema"
  constraint is lifted for a future phase, a real database-backed
  store would remove the ~2h session cap this milestone inherits from
  Milestone 8.
- **Bulk stage/notification actions**: move or notify several
  candidates at once from the Pipeline/Candidates tabs, rather than
  one at a time.
