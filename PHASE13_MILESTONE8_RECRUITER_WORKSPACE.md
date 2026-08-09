# Phase 13 Milestone 8 — Enterprise Recruiter Workspace

## Goal

Give a recruiter a workspace to manage many candidates at once: a
dashboard, a sortable/filterable candidate table, side-by-side
comparison, AI-generated per-candidate insights, a shortlisting
workflow, tags, notes, and exports — all built from the resumes,
ATS/JD-match analysis, and interview-prep infrastructure this arc
already has, without modifying any of it.

## Architecture

Every prior milestone in this arc was single-record-by-ID (one resume,
one rewrite session, one LinkedIn profile). This is the first with a
genuine list — `CandidateService` holds an in-memory `Map` of thin
overlay records, each one referencing (never copying) a real
`resumeId` / optional `jdMatchId` / optional `prepId`:

```
resumeService.analyzeUpload()  (Milestone 1, unmodified, called once per file)
        │
        ▼
POST /api/ai/recruiter/candidates/import   CandidateService.importResumes()
  {files: File[]}                            │
        │                                    ├─► suggestTags(resume) — deterministic
        │                                    │     tag auto-suggestion (candidate-tags.ts)
        │                                    │
        │                                    └─► if a workspace JD is already active,
        │                                          auto-matches via jdMatchService.analyze()
        ▼                                          (Milestone 1, unmodified)
   CandidateRecord {resumeId, jdMatchId, prepId, status, tags, notes, ...}
        │
        ├─► PATCH .../status, .../tags        (mutations)
        ├─► POST  .../notes, .../fields
        ├─► POST  .../match                    → jdMatchService.analyze() (on demand/retry)
        ├─► POST  .../insights                  → candidate-insights.ts (1 LLM call)
        ├─► POST  .../interview-readiness       → prepService.generate() (Milestone 3, unmodified)
        │
        ├─► GET .../dashboard                   → deterministic aggregate stats
        ├─► GET .../ranking                      → candidate-score.ts + candidate-ranking.ts
        ├─► POST .../compare {2-5 ids}           → candidate-comparison.ts (table + 1 LLM call)
        ├─► POST .../recommend {topN}            → candidate-recommendation.ts (1 LLM call)
        └─► GET .../export?format=csv|excel|pdf  → candidate-export.ts
```

Every display field (name, role, company, ATS score, JD match, skills)
is read live from `resumeService`/`jdMatchService`/`prepService` at
request time via `toSummary()` — never denormalized onto the
candidate record itself, matching every other milestone's
"reference, don't duplicate" discipline.

## No new persistence layer, no independent TTL

`CandidateService` uses the exact same in-memory `Map` pattern as
every other service in this arc (`Database Schema` is a protected,
unmodified system). Unlike every sibling service, it has **no
independent expiry timer** — `list()`/`get()` lazily drop a candidate
the moment its underlying `resumeService.get(resumeId)` returns
`undefined` (the resume's own 2-hour TTL has elapsed). This avoids a
"ghost candidate" class of bug entirely, at the cost of capping a
workspace session to the same ~2h window every other feature in this
arc already has — a known, accepted limitation, not a gap.

## Candidate ranking

`candidate-score.ts` assembles a single candidate's score breakdown
from real sources only — `JdMatchResult`'s own fields once a JD match
exists (`atsScore`, `overallMatch`, `experienceScore`,
`leadershipScore`, `softSkillsScore` → Communication, `cloudScore`,
`aiScore`, `certificationScore`), plus a resume-only fallback heuristic
for every field when no JD match exists yet (e.g. a leadership-verb
keyword count, a skill-count-based skills score) — never an LLM guess,
never `null` when a cheap deterministic estimate is available. DevOps
has no equivalent field on `JdMatchResult` at all, so it's always a
local keyword-coverage check (Docker/Kubernetes/CI-CD/Jenkins/
Terraform/Ansible) regardless of JD-match state.

`candidate-ranking.ts` computes a weighted composite (ATS 20%, JD Match
20%, Experience 15%, Skills 10%, Projects 10%, Certification 5%,
Leadership 10%, Interview Readiness 10%) — but **redistributes weight
proportionally across only the factors actually populated** for a given
candidate, so a candidate without a JD match yet still ranks sensibly
on what's known rather than being penalized to zero for missing data.
Verified in testing: a candidate ranked #1 even before an interview-
readiness score existed for them, purely on ATS/JD-match/skills/
leadership.

## Comparison engine

The side-by-side table (Experience/ATS/JD Match/Skills/Projects/
Leadership/Communication/Cloud/AI/DevOps/Overall Score) is fully
deterministic, built directly from each selected candidate's
already-computed `candidate-score.ts` breakdown — the LLM never invents
or re-derives a single number. Only the narrative recommendation is
LLM-generated (temperature 0.2), and it's instructed to ground every
claim in the given table and tags — never invent a fact.

## AI insights

One LLM call per candidate bundles all 9 spec-named dimensions:
strengths, weaknesses, risk factors, and 5 Low/Medium/High-rated
dimensions (hiring recommendation, leadership potential, career growth,
learning ability, culture fit, technical depth) plus their
explanations. Grounded strictly in the resume (and JD match data, if
present) — this package writes third-person analysis *about* a
candidate rather than first-person candidate-authored content (a cover
letter, a LinkedIn About section), so it carries a lighter in-prompt
grounding instruction rather than a dedicated `validator.ts` (not in
this milestone's own 11-file list).

## Tags

`candidate-tags.ts`'s `suggestTags()` is fully deterministic — it maps
real resume signal (skills, achievements, work-experience descriptions)
onto the spec's fixed 12-tag palette. **Visa** and **Immediate Joiner**
are never auto-suggested — no resume field supports either, so they're
recruiter-manual-only, a stated no-fabrication boundary. Tags stay
editable after import via `updateTags()`, which filters against the
same closed set server-side regardless of what the client sends.

## Recruiter workflow

Import (bulk, sequential per-file, `{imported, failed}`) → optionally
set one workspace-level job description (auto-matches every unmatched
candidate, and any new import while a JD is active) → browse/search/
filter/sort the candidate table → change status (Pending Review →
Shortlisted/Interview Scheduled/On Hold/Offer/Hired/Rejected) → add
tags/notes (Recruiter/Interview/Technical/Manager) → generate AI
insights and (once JD-matched) interview readiness on demand per
candidate → rank the whole list → compare 2–5 candidates → get a
top-N recommendation → export the list (CSV/Excel/PDF) or a single
Candidate Report (PDF).

## Chat integration

`recruiterRequestContext` is the first genuinely ID-less context in
this arc — the workspace is a true singleton, so it carries a boolean
flag (`{ active: true }`) rather than a session ID, and `ChatBox` gets
a `recruiterMode?: boolean` prop instead of an ID prop. `resume.tool.ts`
gets one more additive branch (checked first) detecting: "strongest/
best X candidate," "who has X experience," "compare A and B," "who is
ready for interview," "recommend top N candidates" — each calling the
matching `candidateService` method and folding real, grounded data into
the reply.

## What real testing found (and fixed)

A full end-to-end HTTP walkthrough (3 distinct candidates imported in
one bulk request → workspace JD set, all 3 auto-matched → dashboard
aggregates → status transitions → tags edited manually including
Visa/Immediate Joiner → notes in all 4 categories → insights generated
→ interview readiness generated → ranking → 3-way comparison → top-N
recommendation → all 4 export formats → all 5 chat command types)
surfaced two real, fixed issues:

1. **Tag auto-suggestion bug.** `suggestTags()`'s Java check originally
   read `hasWholeWord(corpus, "java") && !hasWholeWord(corpus,
   "javascript")` — intended to stop "java" matching inside
   "javascript," but `\bjava\b`'s word-boundary semantics already can't
   match inside "javascript" on their own (word characters continue
   past the boundary). The extra guard was not just redundant but
   actively wrong: it suppressed the real "Java" tag entirely whenever
   "JavaScript" was *also* genuinely listed as a separate skill on the
   same resume — exactly the case in the very first test candidate
   (skills: "Java, Spring, JavaScript, ..."). **Fixed** by removing the
   redundant guard; re-verified after a clean restart that both "Java"
   and no false "Frontend"/other collateral tags appear correctly.
2. **Ungrounded "immediate availability" claim in the comparison
   recommendation.** The very first real comparison test produced "her
   extensive experience and immediate availability further enhance her
   candidacy" — but no candidate's notice period had been set (all
   `null`); the model invented an availability claim from nothing. The
   comparison/recommendation/insights prompts didn't previously mention
   notice period, availability, or salary at all, so there was no
   explicit instruction not to invent them. **Fixed** by adding an
   explicit rule to all three generators' prompts (`candidate-
   comparison.ts`, `candidate-recommendation.ts`, `candidate-
   insights.ts`): never invent or assume a notice period, availability,
   salary expectation, or location preference — if it isn't in the data
   given, don't mention it. Re-verified: the identical 3-candidate
   comparison, re-run after the fix, produced a recommendation with the
   same correct candidate and rationale but with zero mention of
   availability.

No fabrication observed anywhere else across testing — insights
correctly named a genuine gap ("no FinTech domain experience," "missing
Kafka," "short tenure at DataForge Analytics") without inventing
anything, and the "strongest Java candidate"/"who has Spring Boot
experience" chat searches correctly distinguished a candidate with
literal "Spring Boot" in their skills from one with only plain
"Spring."

**Chat routing confirms the same inherited, already-twice-documented
limitation from Milestones 4/6/7**: a bare command copied verbatim from
the spec's own examples ("Who is the strongest Java candidate?") was
misrouted by the protected Planner to `interview-tool` (Java interview
questions) before ever reaching `resume-tool`, since `resume-tool`'s
keyword list has no recruiter/candidate-workspace signal words. A
message with an explicit resume-signal phrase ("Looking at the resumes
in my workspace, who is the strongest Java candidate?") routed
correctly to `resume-tool` and produced a fully correct, grounded
answer. Not re-solved here — routing lives in the protected Planner.

## Known limitations

- Bulk import is bounded by serverless function timeouts, not solved
  with a background job queue (none exists in this codebase, and
  adding one is out of scope for an additive milestone) — the UI
  encourages batches of roughly 5–10 files rather than promising
  "hundreds in one click."
- Workspace state (candidates, the active JD, notes, tags) lives only
  in process memory and is capped to the underlying resumes' own ~2h
  TTL — restarting the server or letting a session go stale loses the
  workspace, same as every other feature in this arc.
- The workspace JD is singular — there's no way to screen different
  candidates against different roles simultaneously in the same
  workspace session.
- No auth gate — `/recruiter` is publicly reachable like every other
  Phase 13 AI feature page in this portfolio demo, consistent with the
  rest of the site's posture (the existing `/admin` area's own API
  routes have no auth checks either).
- Chat commands need enough resume/candidate-workspace signal for the
  protected Planner to route correctly — a sufficiently bare command
  can still be misrouted (inherited from Milestones 4/6/7).

## Future extensions

- **Persistent workspace storage**: a real database-backed candidate
  store (once the "Database Schema" constraint is lifted for a future
  phase) would remove the ~2h session cap entirely.
- **Multiple concurrent job requisitions**: let a workspace track
  several active JDs at once, with per-requisition candidate pools and
  dashboards instead of one shared JD.
- **Bulk status/tag actions**: apply a status change or tag to many
  selected candidates from the table at once, rather than one at a
  time.
- **Ranking-aware SEO-style feedback loop**: surface which specific
  missing skill would most improve a candidate's ranking score, mirroring
  the LinkedIn Optimizer's SEO-driven regeneration idea.
