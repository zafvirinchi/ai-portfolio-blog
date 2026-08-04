# Phase 12 Milestone 3 — Enterprise ATS Scoring Engine

## Goal

Score a parsed `EnterpriseResume` (Milestone 1 schema, Milestone 2 parser)
the way real ATS software (JobScan/Enhancv/ResumeWorded/TopResume style)
does, **without** a Job Description — JD matching is Milestone 4+. Every
number the engine produces is deterministic and rule-based: zero OpenAI
calls, zero randomness. No resume rewriting, cover letters, interview
questions, or skill-gap analysis — those stay out of scope, same as
Milestones 1–2 kept parsing separate from analysis.

## Architecture

```
EnterpriseResume
        │
        ▼
EnterpriseAtsEngine.score()
        │
        ├─► computeSectionScores()        ats-score.ts — 10 section
        │                                 scorers (0-100% each), converted
        │                                 to points out of that section's
        │                                 weight
        │
        ├─► detectFormattingIssues()      ats-breakdown.ts — duplicate
        │                                 companies/projects/skills, large
        │                                 paragraphs, missing bullets,
        │                                 very short/long resume
        │
        ├─► computeTechnologyCoverage()   ats-breakdown.ts — per-technology
        │                                 mention counts → status
        │
        ├─► computeKeywordDensity()       ats-breakdown.ts — per-category
        │                                 (of 11) match density
        │
        ├─► detectBuzzwords()             ats-feedback.ts — weak-phrase
        │     detectAchievements()        occurrences; quantified-result
        │                                 pattern matches
        │
        ├─► buildFeedback()               ats-feedback.ts — FEEDBACK_RULES
        │                                 table evaluated against the
        │                                 resume
        │
        └─► buildInsights()               ats-feedback.ts — top strengths/
                                           weaknesses/critical improvements/
                                           immediate fixes, derived from the
                                           above
        │
        ▼
AtsReport { overallScore, weightedScore, sections, feedback,
            formattingIssues, technologyCoverage, keywordDensity,
            buzzwords, achievements, insights, processingTimeMs }
```

Every function above is pure: `(resume: EnterpriseResume) => ...`. The
only non-deterministic value anywhere in the output is `processingTimeMs`
(wall-clock, doesn't affect scoring — same pattern as
`EnterpriseResumeParseResult`).

### File layout (`src/lib/ai/resume-enterprise/ats/`)

| File | Responsibility |
|---|---|
| `ats-types.ts` | Const-tuple enums (section keys, technology categories, achievement types, priorities, statuses) and their derived types; internal interfaces (`FeedbackRule`, `TechnologyDictionaryEntry`, ...) |
| `ats-schema.ts` | Zod schemas for the `AtsReport` *output* shape — no OpenAI call anywhere in this package, so there's no hand-written `json_schema` mirror here (unlike `resume-schema.ts`/`resume-json-schema.ts`) |
| `ats-rules.ts` | All static data (section weights, thresholds, the 80-entry technology dictionary, weak phrases, achievement regexes) plus shared text-scanning helpers (`collectExperienceText`, `countWholeWordMatches`, ...) that the other files reuse |
| `ats-breakdown.ts` | `computeTechnologyCoverage`, `computeKeywordDensity`, `detectFormattingIssues` |
| `ats-score.ts` | The 10 section scorers + `computeSectionScores` |
| `ats-feedback.ts` | `detectBuzzwords`, `detectAchievements`, `buildFeedback`, `buildInsights` |
| `ats-engine.ts` | `EnterpriseAtsEngine.score()` — orchestrates everything, owns the `[ats-engine]` log lines |
| `index.ts` | Barrel |

Dependency order is a strict DAG (no cycles): `ats-types` → `ats-rules` →
`ats-breakdown` → {`ats-score`, `ats-feedback`} → `ats-engine`.
`ats-schema.ts` has no logic dependencies (just Zod + `ats-types.ts`'s
tuples). This `ats/` barrel is **not** re-exported from the parent
`resume-enterprise/index.ts` in this milestone — consumers import
`resume-enterprise/ats` directly. Wiring into UI/API is a future milestone.

## Scoring formula

Ten sections, weighted to sum to exactly 100 points (per the spec):

| Section | Points |
|---|---|
| Contact Information | 10 |
| Professional Summary | 10 |
| Experience | 20 |
| Education | 10 |
| Projects | 10 |
| Skills | 15 |
| Formatting | 10 |
| Achievements | 5 |
| Certifications | 5 |
| Keyword Density | 5 |

Each section scorer (`ats-score.ts`) computes a 0–100% independently, then
`computeSectionScores` converts it to points
(`Math.round(pct/100 * maxScore)`) and assigns a status via
`SECTION_STATUS_THRESHOLDS` (≥90 Excellent, ≥75 Good, ≥55 Average, ≥35
Poor, else Critical — applied to the underlying percentage, not the
rounded point value, so two sections with the same point count can show
different status labels if their percentages differ; this is intentional,
not a rounding bug).

`overallScore` is the clamped sum of all section points (0–100).
`weightedScore` is `overallScore / 100` — since each section's point value
*is* its weight already, "weighted" and "overall" are the same
computation; `weightedScore` exists as the 0–1 fraction form for consumers
that want a normalized value (progress bars, threshold checks) instead of
a percentage.

### Per-section logic (summarized — see `ats-score.ts` for exact numbers)

- **Contact Information** — completeness across 8 checks: first/last
  name, valid email (`EMAIL_REGEX`), valid phone (`PHONE_REGEX`),
  LinkedIn, GitHub, portfolio, location.
- **Professional Summary** — length tiers on `careerObjective`/`headline`
  (≥150 chars strong, ≥60 partial, present-but-short weak) plus bonus for
  `currentDesignation`/`yearsOfExperience` being populated.
- **Experience** — presence, multi-role career progression, bullet
  coverage across roles, quantified-achievement presence
  (`ACHIEVEMENT_PATTERNS`), and absence of weak phrases
  (`WEAK_PHRASES`).
- **Education** — average per-entry completeness (institute, degree,
  specialization, at least one date, grade).
- **Projects** — presence, technology-tag coverage, measurable-impact
  presence.
- **Skills** — breadth (skill count, capped), category diversity, plus
  explicit bonuses for Cloud and AI presence.
- **Formatting** — `100 − 15 × (number of formatting issues detected)`,
  floored at 0 (see Formatting Rules below).
- **Achievements** — top-level `achievements[]` presence + distinct
  achievement-pattern types found across experience/project text.
- **Certifications** — count-based tiers (0/1/2/3+ → 0/50/75/100), same
  shape as the existing `resume/resume-score.ts`'s `scoreCertification`.
- **Keyword Density** — see the dedicated note below; **not** a
  straight average of `computeKeywordDensity`'s per-category percentages.

### Why Keyword Density scores differently from the reported breakdown

`computeKeywordDensity` (in `ats-breakdown.ts`) reports match density
*per category*, for the `keywordDensity` field in `AtsReport` — this is
informational, matching the spec's "Calculate: Programming Languages,
Frameworks, Cloud, ..." requirement.

But the **Keyword Density section's point score** is deliberately *not*
an average of those 11 category percentages. Real testing during this
milestone surfaced why: a resume mentioning 28+ real, recognized
technologies (the "Excellent" fixture) still averaged only ~40% across 11
categories, because categories like Frontend or Security score 0% for any
resume that doesn't happen to need those specific technologies — that's
not a resume weakness, it's a domain mismatch between the dictionary's
breadth and one candidate's focus. Averaging punished specialization.

The fix: `scoreKeywordDensity` counts **total distinct technologies
matched** (across all 11 categories combined) against a fixed target of
18 (`KEYWORD_DENSITY_SCORE_TARGET` in `ats-rules.ts`) — a broad,
well-rounded resume typically names 15–20 recognizable technologies. This
reaches "Excellent" for genuinely strong, broad resumes without requiring
coverage of every unrelated category.

## Rule engine (`ats-rules.ts`'s `FEEDBACK_RULES`)

Feedback is a declarative table: each rule is `{ id, section, priority,
impact, quickFix, message, appliesTo(resume) => boolean }`, evaluated
against the resume directly (no dependency on the breakdown/score
modules, keeping `ats-rules.ts` a leaf module). All 17 messages from the
spec are covered:

| Rule | Priority | Impact | Quick fix |
|---|---|---|---|
| Missing LinkedIn Profile | Medium | +2 | Yes |
| No GitHub | Low | +2 | Yes |
| No Portfolio | Low | +2 | Yes |
| Missing location | Low | +2 | Yes |
| Email invalid | Medium | +5 | Yes |
| Phone format invalid | Medium | +5 | Yes |
| Summary too short | High | +5 | No |
| No quantified achievements | High | +8 | No |
| Experience descriptions are weak | High | +8 | No |
| No action verbs | Medium | +5 | No |
| Bullet points too long | Low | +2 | No |
| Education incomplete | Low | +2 | No |
| Projects lack measurable impact | Medium | +5 | No |
| Too few technical skills | High | +8 | No |
| Missing cloud technologies | Medium | +5 | No |
| No AI skills | Low | +2 | No |
| Missing certifications | Medium | +5 | Yes |

`priority`/`impact` are fixed per rule (impact is one of the spec's
+2/+5/+8/+10 values). `quickFix` distinguishes corrections a candidate can
make in minutes (add a LinkedIn URL) from substantive rewrites (weak
experience descriptions) — used to build the "Immediate Fixes" insight
separately from the priority-based "Critical Improvements" insight.

**Insights** (`buildInsights` in `ats-feedback.ts`):
- `topStrengths`/`topWeaknesses` — top 3 sections by status
  (Excellent/Good vs. Poor/Critical), sorted by percentage.
- `criticalImprovements` — every `priority: "High"` feedback message.
- `immediateFixes` — every `quickFix: true` feedback message, sorted by
  impact descending, capped at 5.

## Technology detection

`TECHNOLOGY_DICTIONARY` (`ats-rules.ts`) is a curated, bounded list of
~80 named technologies across the spec's 11 categories (Programming
Languages, Frameworks, Cloud, Databases, DevOps, AI, Security,
Architecture, Testing, Frontend, Backend), each with optional aliases
(e.g. "Node.js" also matches "nodejs"/"node").

`computeTechnologyCoverage` scans skill tokens, project technology tags,
and all free-text prose (summary, responsibilities, achievements,
descriptions) for case-insensitive whole-term matches, then maps mention
count → status via `TECH_MENTION_THRESHOLDS` (0 Missing, 1 Poor, 2
Average, 3 Good, ≥4 Excellent).

**Why not JS `\b` regex boundaries**: several technology names end or
start with symbols (`C++`, `C#`, `CI/CD`) that `\b` doesn't reliably
bound — `\bC\+\+\b` fails to match "C++" at end-of-string or before
whitespace, because `\b` requires a word/non-word transition and both
sides of a trailing symbol are non-word. `countWholeWordMatches`
implements manual alphanumeric-boundary checking instead, only requiring
a non-alphanumeric neighbor where the term itself starts/ends
alphanumeric (so "Java" doesn't false-match inside "JavaScript", but
"C++" matches correctly regardless of what follows it).

Note: `EnterpriseResume.skills[].category` (Milestone 1's 10-value
`SKILL_CATEGORIES`) and the ATS engine's own 11-value
`AtsTechnologyCategory` taxonomy are intentionally independent — the ATS
engine scans raw skill *tokens* and free text, not the parser's category
grouping, so a technology is detected correctly regardless of which
bucket the parser or the candidate happened to file it under.

## Formatting rules

`detectFormattingIssues` (`ats-breakdown.ts`) checks, all deterministic:
- **Duplicate companies/projects** — case-insensitive name dedup.
- **Duplicate technologies** — case-insensitive dedup across all listed
  skill tokens.
- **Large paragraphs** — any single responsibility/achievement/project
  description longer than 400 characters.
- **No bullet points** — any `companyHistory` entry with an empty
  `responsibilities` array.
- **Very short / very long resume** — total word count across all
  free-text fields, thresholds 150 / 1200 words.

**Known proxy**: "very long resume" doubles as the spec's "too many
pages" check — the engine only receives structured `EnterpriseResume`
data, not the original file's page layout, so word count is used as a
deterministic stand-in rather than a literal page count. Documented here
rather than silently approximated.

The Formatting *section score* is `100 − 15 × issueCount`, floored at 0 —
each detected issue type costs 15 percentage points, converted to the
section's 10-point weight the same way every other section is.

## Verification

Ran against 7 synthetic `EnterpriseResume` fixtures (Junior, Senior,
Manager, Architect, Developer, Poor, Excellent) via a temporary,
since-deleted API route (not part of this milestone's deliverable),
calling `enterpriseAtsEngine.score()` twice per fixture and diffing the
JSON output (excluding `processingTimeMs`) to confirm byte-identical
results:

| Persona | Overall | Deterministic |
|---|---|---|
| Poor | 28 | ✓ |
| Junior | 63 | ✓ |
| Developer | 73 | ✓ |
| Senior | 82 | ✓ |
| Manager | 86 | ✓ |
| Architect | 99 | ✓ |
| Excellent | 99 | ✓ |

Scores differentiate sensibly across the quality spectrum. One real
calibration bug was found and fixed during this pass — the original
Keyword Density formula (a flat average across all 11 categories) capped
even the strongest fixtures around 40%; see "Why Keyword Density scores
differently" above for the fix. All resumes scored deterministically
identical on repeat calls.

`npx eslint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Known limitations

- Achievement-pattern matching (`ACHIEVEMENT_PATTERNS`) is
  presence-based, not proximity-aware — a bullet containing both an
  unrelated "%" and the word "automation" counts as two separate
  achievement-type hits even if only one is a real, connected claim.
- "No action verbs" and category-presence checks
  (`skillsContainCategory`) are heuristic string/whole-term matches, not
  semantic understanding — a resume phrasing a strong result unusually
  (no leading verb, an uncommon technology synonym not in the alias
  list) can be under-credited.
- "Very long resume" / "too many pages" is a word-count proxy, not an
  actual page count (see Formatting Rules above).
- The technology dictionary (~80 entries) is curated, not exhaustive —
  a real technology missing from `TECHNOLOGY_DICTIONARY` simply won't be
  detected. Extending it is low-risk (pure data addition).
- Formatting/feedback thresholds (400-char paragraph limit, 150/1200-word
  resume-length bounds, the 18-technology Keyword Density target, the
  15-point-per-issue Formatting deduction) are reasoned defaults, not
  calibrated against a labeled dataset of real ATS outcomes.

## Future extensions (explicitly out of scope here)

- JD matching (Milestone 4) — score/feedback relative to a target job
  description instead of general best practices.
- Resume bullet rewriting / cover letter generation / interview question
  generation / skill-gap analysis.
- Wiring `enterpriseAtsEngine` into any UI page or API route (still just
  a library package, same as Milestones 1–2 at this stage).
- Re-exporting `ats/` from the parent `resume-enterprise/index.ts` barrel
  once a consumer needs it.
