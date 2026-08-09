# Phase 13 Milestone 5 — Enterprise Resume Rewrite Engine

## Goal

Upgrade past "optimize against one JD" into recruiter-grade rewriting:
any section (or the whole resume), in any of 9 professional styles,
with A/B/C variants to choose from, an explicit accept/reject/restore
workflow, full version history, and a hard anti-fabrication validator
that can reject and retry a rewrite — never inventing a company,
technology, certification, metric, or date beyond what the resume
already states.

## Architecture

```
Resume (already parsed, read-only)
        │
        ▼
POST /api/ai/resume-rewriter          RewriteService.start()
        │                             → empty RewriteRecord, sections
        │                               lazily seeded from the real resume
        ▼
POST .../section                      RewriteService.rewriteSection()
  {section, style, targetContext?,      │
   itemIndex?}                          ├─► summary/careerObjective →
        │                               │     summary-rewriter.ts (3 variants)
        │                               ├─► experience/achievements/
        │                               │     certifications → bulk
        │                               │     "items" rewriters (1 variant
        │                               │     per item — completeness
        │                               │     over variety, see below)
        │                               ├─► projects → project-rewriter.ts
        │                               │     (Problem/Solution/Tech/
        │                               │     BusinessValue/Impact)
        │                               ├─► skills → skills-rewriter.ts
        │                               │     (11-category recategorization)
        │                               └─► itemIndex set → bullet-rewriter.ts
        │                                     (single item, always 3 variants;
        │                                     merges into an existing bulk
        │                                     pending rather than replacing it)
        │
        ▼
rewrite-validator.ts                  every generated text is checked;
  reject → 1 retry with a               a variant that still fails after
  correction prompt → fallback          retry falls back to the ORIGINAL
  to original text                      text, never a hallucinated one
        │
        ▼
   pending variants returned  ──►  user picks A/B/C per item
        │
        ▼
POST .../section/[section]/action     accept (flattens the chosen
  {action, variantVersion?,             variant(s) into current + pushes
   itemSelections?, versionIndex?}      a version) / reject (discards
        │                               pending) / restore (reverts to
        │                               an earlier version)
        ▼
GET .../export?format=...             4 formats, from the same shared
                                        "record -> sections" object
```

`POST .../whole-resume` is a separate, single-call path: summary +
experience + projects + skills + achievements rewritten together in one
pass (no variants — see the cost-shape decision below), which also syncs
every individual section's own state so a later per-section action picks
up from the whole-resume result. `POST .../whole-resume/reset` reverts
every section back to `versions[0]` — the untouched original.

## Rewrite pipeline: cost shape

Following this arc's established "one real LLM call, not N" discipline:
a per-section rewrite is **one** structured-output call that returns
every requested variant together, never separate round-trips per
variant. "Rewrite Entire Resume" is its own **one-call** action covering
every section at once, with a single result rather than three full
resume variants (generating 3 complete resumes per click would be slow
and expensive for marginal benefit — variant choice is far more useful
at the section/bullet level, where the spec's own "Version A/B/C" framing
naturally applies).

**Real testing found and fixed a genuine completeness gap** — see
"What real testing found," below — that changed this shape mid-build:
bulk section rewrites (experience/projects/achievements/certifications)
now ask for exactly **one** variant per item rather than three, since
asking for 4 items × 3 variants × a 5-field explanation each in one
response was large enough that the model would silently truncate the
array. Full A/B/C choice is still available — it's just deferred to
`bullet-rewriter.ts`'s single-item "Generate Again," a much smaller ask
that reliably returns all 3.

## Validation rules

`rewrite-validator.ts` is deterministic and re-derives every answer from
the resume's own real data — it never trusts the LLM's self-report:

- **Well-known companies** (Google, Amazon, Meta, Apple, Netflix,
  Microsoft, ...) mentioned in a rewrite that aren't among the
  candidate's real employers — a specific risk for the "FAANG" style.
- **Certification claims** ("... Certified ...") that don't match any of
  `resume.certifications[].name`.
- **Named technologies** (a maintained list — Java, Spring Boot, AWS,
  PostgreSQL, Kafka, ...) that appear in the rewrite but nowhere in the
  candidate's real resume — the same bug class Milestone 2 found once
  (MySQL claimed as PostgreSQL), caught here deterministically rather
  than relying on the prompt alone.
- **New numbers/metrics** not present in the specific original text
  being rewritten.
- **New dates/years** not present anywhere in the resume.

On a violation: **one** automatic regeneration with the specific
violations named in a corrective follow-up prompt. If the retry still
fails, the **original text is kept unchanged** for that item and a
`rejectedItems` entry records why — the UI surfaces this ("N item(s)
couldn't be safely rewritten and were kept as-is") rather than silently
serving a hallucinated result or hard-erroring.

## Prompt design

Every rewriter module shares one `SAFETY_RULES_PROMPT` block
(`rewrite-validator.ts`) covering the spec's full "never invent..."
list, plus the spec's own worked before/after examples embedded verbatim
as few-shot guidance (the Angular/REST API/bug-fix bullet examples, the
AI Portfolio project structure example, the "Responsible for migration"
achievement example). `temperature: 0.2` throughout, per spec.
`STYLE_DESCRIPTIONS` (`rewrite-schema.ts`) gives every one of the 9
styles a one-sentence tone anchor shared by all rewriters, so "FAANG"
reads consistently terse and metrics-forward whether it's rewriting a
summary or a single bullet.

## Rewrite styles

Professional, Executive, Recruiter, Technical, Leadership, Consulting,
FAANG, Startup, Enterprise — selected once in the UI's style picker (or
detected from a chat phrase like "FAANG style" / "more technical"),
applied to whichever section is rewritten next.

## Safety rules (the anti-fabrication discipline, concretely)

Every rewriter's system prompt states the full list explicitly: never
invent companies, experience, projects, certifications, awards, metrics,
technologies, education, dates, or achievements; only ever reference a
certification by its exact resume name; never add an unstated
descriptive qualifier ("enterprise-grade," "mission-critical," ...) or
claimed outcome unless the original already implies it. `skills-rewriter.ts`
additionally runs `filterToActuallyPossessedSkills()` — a hard
deterministic filter (same shape as Milestone 2's
`filterToActuallyUsedKeywords`) that drops any skill the LLM lists that
isn't a case-insensitive match to something in the resume's real
`skills`/`technicalSkills`, regardless of how well the prompt is
followed.

## What real testing found (and fixed)

Two real issues surfaced via live end-to-end testing on the production
routes (upload → start → rewrite every section → accept/reject/restore
→ single-item regenerate → whole-resume → reset → all 4 exports → chat):

1. **Bulk section rewrites silently dropped items.** The very first real
   test — rewriting a 4-bullet Experience section in FAANG style —
   returned only 1 of 4 items, despite an explicit "Rewrite every bullet
   given — do not skip any" instruction. Root cause, confirmed by
   inspecting the raw LLM response before any of this milestone's own
   filtering ran: the per-call output was simply too large (4 items × up
   to 3 variants × a 5-field explanation object each). An explicit
   "there are EXACTLY N bullets, your array MUST contain EXACTLY N
   entries" instruction alone did **not** fix it — the array was still
   truncated to 1 item on retest. **Fixed** by reducing the ask: bulk
   calls now request exactly 1 variant per item ("completeness matters
   more than variety here"), with full A/B/C choice deferred to a
   single-item "Generate Again." Re-verified on a fresh session: all 4
   experience bullets, all 5 skill categories, and the single
   certification all came back correctly and completely.
2. **A single-item "Generate Again" was silently discarding the rest of
   a pending bulk rewrite.** Found while testing the fix above: after a
   bulk experience rewrite produced 4 pending items, regenerating just
   item 1 replaced the *entire* section's pending state with a
   single-item result — items 0, 2, and 3's not-yet-accepted variants
   vanished. **Fixed** by detecting an in-progress bulk pending
   (`sectionState.pending?.items`) inside `rewriteSection()`'s
   single-item branch and splicing the regenerated item back into the
   existing array instead of replacing it. Re-verified: after the fix,
   regenerating item 1 correctly left items 0/2/3 untouched (still their
   original 1-variant results) while item 1 gained its fresh 3 variants.

No fabrication observed across any real call in this milestone's
testing: FAANG-style rewrites never implied a real FAANG employer, the
certification's exact name ("AWS Certified Developer - Associate") was
preserved unchanged rather than upgraded to a fancier-sounding one (the
exact substitution bug Milestone 2 hit once), the "30%" metric already
present in the original was correctly carried through rewrites and never
duplicated or invented elsewhere, and skills recategorization never
added a technology the resume didn't list.

**Chat integration inherits Milestone 4's documented limitation, not a
new one.** A chat message ("Rewrite my achievements in Startup style")
correctly triggered the underlying rewrite server-side (confirmed via
`[resume-rewriter]` logs and a follow-up state fetch showing a genuine
pending rewrite) but the spoken reply was mangled into a generic "not
available in the knowledge base" response by the protected multi-agent
Reviewer/Summarizer layer — the same root cause Milestone 4 root-caused
precisely (that layer's `intent === "resume"` bypass doesn't cover this
kind of dynamic, self-contained tool context) and the same fix boundary
applies: `ConversationService`/multi-agent code is protected here too,
so this isn't re-litigated. The dedicated `/resume-rewriter` page is the
reliable, fully-verified interface.

## Known limitations

- The `KNOWN_TECHNOLOGIES` list in `rewrite-validator.ts` is
  deliberately non-exhaustive (a few dozen common names) — it catches
  the highest-value fabrication pattern (a named tech swap) but won't
  flag every conceivable invented technology.
- The well-known-company check is similarly a short, deliberately
  curated list (the household-name FAANG-adjacent companies), not a
  general employer-name detector.
- Whole-resume rewrite is single-pass, single-version — it doesn't get
  the same reject-one-item-and-keep-the-rest granularity a per-section
  bulk rewrite does; a validation failure anywhere in the response
  triggers one full retry of the entire call, not a per-piece one.
- `skills-rewriter.ts`'s 11-category scheme is this package's own,
  deliberately separate from the existing JD-optimizer's 9-category
  scheme — the two are not meant to be reconciled or shared.

## Future extensions

- **Cover-letter generation** from the same accepted, fabrication-free
  section state — the validator and style system would carry over
  directly.
- **JD-aware rewriting as an optional overlay**: currently this engine
  is deliberately JD-optional (resume-grounded only); a future pass
  could accept an existing `jdMatchId` alongside `targetContext` to bias
  keyword choice toward a specific job's missing keywords, reusing
  `job-description/jd-service.ts` read-only without merging the two
  optimizer packages.
- **Per-item accept in the whole-resume path** — splitting the
  single whole-resume call's validation/retry down to individual pieces
  (mirroring the per-section bulk rewriters) rather than an all-or-
  nothing retry.
- **Word-diff-aware "Modified" ATS-keyword highlighting** — layering
  Milestone 2's keyword-highlight technique on top of this milestone's
  `wordDiff()` output, so a keyword newly present in a rewrite gets its
  own distinct highlight tier beyond the generic Green/Yellow/Grey.
