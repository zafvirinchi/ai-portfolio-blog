# Phase 13 Milestone 2 — AI Resume Optimizer

## Goal

Generate an ATS-optimized *version* of the candidate's resume against a
matched job description — never overwriting the uploaded original —
richer than Phase 12 Milestone 4's existing optimizer: categorized
skills, a separate achievements section, explicit inserted-keyword
tracking, ATS formatting suggestions, and a deterministic improvement
score, shown as a side-by-side diff with Green/Yellow/Red highlighting.

**Which "current system" this builds on**: the spec's own "already
have" checklist (parse resume, parse JD, ATS score, missing skills,
skill gap, match %) describes Phase 12 Milestone 4's JD Intelligence
Engine (`src/lib/ai/job-description/`), not Phase 13 Milestone 1's
standalone `job/` package (which deliberately has no ATS/comparison
capability). This milestone is built on `job-description/`'s existing
`JobDescription`/`JdMatchComputation` — read-only reuse only.

## Architecture

```
JdMatchRecord (already stored by jd-service.ts, Milestone 4)
        │
        ▼
POST /api/ai/resume/jd-match/[jdMatchId]/optimize   (new route)
        │
        ├─► jdMatchService.get(jdMatchId)      read-only lookup
        ├─► resumeService.get(resumeId)        read-only lookup
        ├─► computeJdMatch(resume, jd)         deterministic recompute —
        │                                      cheap, pure function, avoids
        │                                      needing to modify jd-service.ts
        │                                      just to retain its intermediate
        │                                      JdMatchComputation object
        ▼
ResumeOptimizer.optimize(resume, jd, computation)
        │
        ├─► openai.chat.completions.create()   gpt-4o-mini, temperature 0.4
        │     response_format: json_schema       RESUME_OPTIMIZER_JSON_SCHEMA
        ▼
   raw JSON from OpenAI
        │
        ▼
resumeOptimizerLlmOutputSchema.safeParse()      throws on validation failure
        │
        ▼
Deterministic post-processing (no LLM):
  - filterToActuallyUsedKeywords()   drops any "inserted keyword" claim
                                      not literally present in the
                                      rewritten text
  - findRemoved() x3                 experience/project/achievement
                                      bullets present in the original
                                      resume but absent from the LLM's
                                      rewritten output
  - computeOverallImprovementScore() weighted formula, see below
        │
        ▼
ResumeOptimizerResult  ->  stored in-memory (2h TTL) keyed by jdMatchId
        │
        ▼
GET /api/ai/resume/jd-match/[jdMatchId]/optimize/export?format=...
        │
        ▼
Markdown / PDF (pdfkit) / DOCX (docx package)
```

`ResumeOptimizerPanel.tsx` renders the result in the "Resume Optimizer"
tab of `/resume-analyzer` (renamed from Milestone 4's "Resume
Optimization" tab, same tab slot — the only change to
`resume-analyzer/page.tsx`). Generation is **lazy**: the LLM call only
runs when the user clicks "Generate Optimized Resume," not automatically
during JD-match analysis, so checking a match score doesn't force a 3rd
LLM call on every "Analyze Match" click.

## Files added (all new — see "Not touched" below)

- `src/lib/ai/job-description/resume-optimizer-schema.ts` — `SKILL_CATEGORIES`
  (the spec's exact 9: Programming/Backend/Frontend/Cloud/DevOps/AI/
  Database/Testing/Tools), LLM-output schema + `RESUME_OPTIMIZER_JSON_SCHEMA`,
  and the final `resumeOptimizerResultSchema` (LLM output plus the
  deterministic `changeType`/`removedItems`/`overallImprovementScore`
  fields — never itself sent through `response_format`).
- `src/lib/ai/job-description/resume-optimizer.ts` — `ResumeOptimizer`
  class (the module the spec explicitly names), the prompt, and the
  deterministic post-processing functions. In-memory `Map<jdMatchId,
  ResumeOptimizerResult>`, 2-hour TTL, same pattern every store in this
  session uses.
- `src/app/api/ai/resume/jd-match/[jdMatchId]/optimize/route.ts` — `POST`,
  `maxDuration = 60`, caches on `resumeOptimizer.get()` before re-running.
- `src/app/api/ai/resume/jd-match/[jdMatchId]/optimize/export/{route.ts,
  build-optimizer-sections.ts, pdf-renderer.ts, docx-renderer.ts}` — a
  new sibling export path (not modifying Milestone 4's existing
  `.../[jdMatchId]/export/*`), reusing the same `pdfkit`/`docx`
  dependencies already installed, with a formatter tailored to this
  result's richer section shape (categorized skills, a distinct
  achievements section).
- `src/components/resume/jd/ResumeOptimizerPanel.tsx` — the tab's new
  content: improvement score, legend, categorized skills, per-section
  diff cards (experience/projects/achievements), formatting suggestions,
  AI suggestion notes, 3 download links.

## Files modified

- `src/app/(site)/resume-analyzer/page.tsx` — one tab's `label` (now
  "Resume Optimizer") and `content` (now `<ResumeOptimizerPanel
  jdMatchId={...} />` instead of `<JdResumeOptimization ... />`). No
  other tab, the upload flow, or chat integration changed.

Everything else — `jd-parser.ts`, `ats-engine.ts`, `jd-matcher.ts`,
`keyword-engine.ts`, `experience-engine.ts`, `jd-service.ts`,
Milestone 4's original `optimizer.ts`, `JdResumeOptimization.tsx`, and
its export route — **untouched**, per the spec's "Do NOT modify existing
parser. Do NOT modify ATS engine. Add new optimizer module only." The
old optimizer/component/route still exist and still work (verified — see
Validation below); they're simply no longer linked from this tab, so
this change is fully reversible without deleting anything.

## Prompt design

System prompt structure: critical safety rules first (see Safety Rules),
then a "what you may do" allow-list, then per-field instructions for
each of the 8 output fields. User message: the candidate's resume
(`summarizeResumeForPrompt`, reused read-only from `resume/
resume-analyzer.ts`), the full parsed `JobDescription` as JSON, and a
condensed summary of the current match data (overall match %, ATS score,
experience-match verdict, missing skills) so the model has the same
context a human reviewing the match tab would have.

## Optimization strategy

- **Skills**: pure recategorization into the 9 fixed buckets — explicitly
  told this is not an opportunity to add anything, even a
  well-supported missing keyword (that belongs in bullet-text keyword
  injection only, never in the skills list — see Safety Rules).
- **Bullets** (experience/projects/achievements): rewrite-in-place,
  `{original, optimized}` pairs so the original can be matched back to
  the source resume. The model may consolidate genuinely redundant
  bullets by simply not returning an entry for the redundant one —
  `findRemoved()` then detects and surfaces this as a red "Removed" card
  by diffing the source resume's bullets against every `.original` value
  actually returned.
- **Keyword injection**: constrained to same-technology canonicalization
  only (Spring → Spring Boot), explicitly forbidding substituting a
  different-but-similar named technology (MySQL does not justify
  claiming PostgreSQL) — see Safety Rules for why this needed a
  deterministic backstop, not just a prompt instruction.
- **Formatting suggestions** and **improvement notes**: free-text
  `{area, suggestion}` pairs and `{category, note}` pairs respectively,
  matching Sections 7 and 8 of the spec structurally without forcing
  every JD's real issues into a rigid enum for `area` (only
  `improvementNotes.category` is a fixed 5-value enum, per the spec's
  exact list).

## Safety rules — what real testing found and fixed

Two real fabrication issues were found and fixed during this milestone's
own verification (not left as theoretical concerns):

1. **Technology substitution**: the first real test run listed
   "PostgreSQL" under `optimizedSkills.Database`, even though the source
   resume only ever mentions MySQL — the model treated MySQL experience
   as implicitly transferable to a different, similarly-purposed
   database. Fixed with an explicit prompt rule naming this exact
   failure mode (MySQL ≠ PostgreSQL, Java ≠ Kotlin, AWS ≠ Azure) and
   reiterating that `optimizedSkills` is recategorization-only, never an
   injection point. Re-verified clean across two subsequent runs.
2. **Phantom keyword claims**: a run listed "AWS Certified Solutions
   Architect" in `insertedKeywords` — a certification the candidate
   doesn't hold (their real one is "AWS Certified Developer -
   Associate") — while never actually using that phrase anywhere in the
   rewritten text. Fixed two ways: (a) an explicit prompt rule requiring
   exact certification names and requiring every `insertedKeywords`
   entry to actually appear in the rewritten text, and (b) a
   **deterministic filter**, `filterToActuallyUsedKeywords()`, that
   strips any claimed keyword not literally present in
   `optimizedSummary` or a rewritten bullet before the result is ever
   returned — this doesn't rely on prompt compliance at all, so it holds
   even if the model doesn't follow the instruction perfectly.

Same "never invent experience/companies/certifications/projects/
education" rule as the spec, plus the "never invent a metric" and
"never add an unstated scope/outcome qualifier" rules already learned and
fixed once in Milestone 4's original `optimizer.ts` — reused here from
the start instead of rediscovering them. One residual, known limitation:
a test run still produced "high-traffic e-commerce platform" (an
unstated scope qualifier) despite the explicit prohibition — LLM
instruction-following isn't 100% guaranteed even with a clear rule
stated twice now; flagged honestly rather than claimed fully solved (see
Milestone 4's doc for the same caveat on its own optimizer).

## `overallImprovementScore` formula

Deterministic, computed from the already-validated LLM output plus the
already-computed match data — not a second LLM self-assessment call
(same reasoning every other score in this codebase uses):

```
score = 50% × (missing-keywords the resume now genuinely covers, per the
               *verified* insertedKeywords list, ÷ total missing keywords)
      + 30% × (bullets meaningfully changed ÷ total original bullets
               across experience+projects+achievements)
      + 20% × min(1, formattingSuggestions.length ÷ 5)
```

Rounded and clamped to 0–100. Verified deterministic: recomputing from
the same LLM output twice produces the identical score every time (the
only non-deterministic step is the LLM call itself, same caveat every
other optimizer/parser in this codebase already documents).

## Export flow

`GET .../optimize/export?format=markdown|pdf|docx` builds one shared
`OptimizerExportSections` object (candidate name, target role, summary,
non-empty skill groups, three bullet lists, formatting suggestions) and
renders all three formats from it, so they can never drift from each
other — same pattern Milestone 4's export route established. Returns 404
if no optimizer result has been generated yet for that `jdMatchId`
(distinct message pointing back at the tab).

## Validation results

- Real end-to-end run via the production routes (resume upload → JD
  match → optimize → all 3 exports), on a fresh dev server (a Turbopack
  dev-mode module-duplication artifact caused two spurious "not found"
  responses mid-session on a server that had just been hot-reloaded
  multiple times in a row — resolved completely by a clean restart;
  confirmed not a code issue by reproducing it against the **unmodified**
  Milestone 4 export route too, then confirming a fresh server fixes
  both — not expected to occur in a deployed build, which doesn't do
  incremental dev recompilation).
- Both fabrication bugs above: found, fixed, and re-verified clean.
- All 3 export formats verified with correct `Content-Type` and valid
  file signatures (`%PDF-1.3`, `PK\x03\x04`).
- Confirmed Milestone 4's original optimizer/export route still works
  unmodified, on the same `jdMatchId` — backward compatibility check.
- `npm run lint` — 0 errors (1 pre-existing, unrelated warning).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean; both new routes registered
  (`/api/ai/resume/jd-match/[jdMatchId]/optimize` and its `/export`),
  every pre-existing route unchanged.
- No browser tooling available this session — the API layer is fully
  HTTP-verified; the tab UI itself (diff cards, highlighting, legend)
  wasn't visually confirmed in a browser.

## Future improvements

- A real word-level diff instead of whole-bullet "Modified" — currently
  the whole rewritten bullet is shown, with only `insertedKeywords`
  highlighted inline; a token-level diff would show exactly which words
  changed.
- Auto-recompute `overallImprovementScore` against the *live* ATS engine
  (re-running `scoreAts` on a hypothetical resume with the optimized text
  substituted in) instead of the current proxy formula, once there's a
  clear need to show "your ATS score would go from X to Y."
- A paste-back option to let the candidate accept individual bullets into
  a downloadable "final" resume rather than all-or-nothing per format.
