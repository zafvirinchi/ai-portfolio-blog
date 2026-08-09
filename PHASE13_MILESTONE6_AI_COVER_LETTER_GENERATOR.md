# Phase 13 Milestone 6 — AI Cover Letter & Job Application Generator

## Goal

Generate the actual submission artifacts — a cover letter, an
application email, and LinkedIn outreach messages — for a specific job,
using the resume, the parsed job description, the JD-match ATS
analysis, and (if available) the Resume Optimizer output. This closes
out the "apply for this job" workflow the Phase 13 arc has been
building toward: JD Intelligence → Resume Optimizer → Interview Prep →
Mock Interview → Resume Rewriter → Cover Letter.

## Architecture

```
JdMatchRecord (jobDescription + JdMatchResult, from job-description/jd-service.ts)
        +
ResumeOptimizerResult (optional, from job-description/resume-optimizer.ts)
        │
        ▼
POST /api/ai/cover-letter        CoverLetterService.start()
  {jdMatchId, companyName?,        │
   hiringManager?, role?,          ├─► company-research.ts — deterministic,
   style, length}                  │     JD-only "talking points" (no
        │                          │     invented company facts)
        │                          ├─► cover-generator.ts — the one real
        │                          │     LLM call: 3 letter variants
        │                          │     (A/B/C), 11-part structure each
        │                          ▼
        │                    validator.ts — checks every variant's
        │                    fullText; reject → 1 retry with named
        │                    violations → drop any still-invalid variant
        │                          │
        │                          ▼
        │              computeKeywordCoverage() / computeReasoning()
        │              — deterministic, re-derived from JdMatchResult's
        │              own matchedSkills/missingSkills, never LLM output
        ▼
   CoverLetterRecord (letterVariants, keywordCoverage, reasoning)
        │
        ├─► POST .../letter (regenerate, same validator flow)
        ├─► POST .../letter/accept {version} → acceptedLetter + history
        ├─► POST .../email {audience} → email-generator.ts (1 call/audience)
        ├─► POST .../linkedin → application-generator.ts (1 call, 4 types)
        └─► GET .../export?format=... → export-service.ts (5 formats)
```

## Prompt design

Every generator (`cover-generator.ts`, `email-generator.ts`,
`application-generator.ts`) shares `validator.ts`'s exported
`SAFETY_RULES_PROMPT` and `tone-selector.ts`'s `STYLE_DESCRIPTIONS`/
`LENGTH_GUIDES` — one source of truth for tone/length/safety across all
three artifact types, `temperature: 0.3` throughout per spec.
`company-research.ts` hands the cover-letter prompt a short, explicit
list of JD-derived "talking points" and the prompt states these are the
*only* facts the model may use about the target company — there is no
web-search tool in this milestone's scope, and inventing real-world
facts about an actual company (funding, news, headcount) would be a
severe fabrication risk this arc has never allowed anywhere else.

## Generation flow

- **Cover letter** — one call returns 3 variants together (11 sections
  + assembled `fullText` each). Regenerating (a new style/length, or
  "Generate Again") replaces `letterVariants` wholesale; accepting one
  pushes the previously-accepted letter into `letterHistory` first, so
  the Variants tab always has a real trail.
- **Application email** — one call *per requested audience*
  (Recruiter/Referral/LinkedIn), not all three up front — the user picks
  which they need.
- **LinkedIn messages** — one call returns all 4 message types
  (Connection Request/Follow-up/Recruiter Outreach/Hiring Manager)
  together, since each is short enough that bundling doesn't risk the
  array-truncation failure mode Milestone 5 found (see below).
- **Keyword coverage / "Why This Letter"** — fully deterministic, computed
  once from the accepted (or first) variant's `fullText` against
  `JdMatchResult`'s own already-computed `matchedSkills`/`missingSkills`
  — no extra LLM call, and never trusts a self-reported list (same
  "re-derive from the real text" discipline as Milestone 2's
  `filterToActuallyUsedKeywords`).

## Validation rules

`validator.ts`'s `validateCoverContent()` checks generated text against
**both** the resume (candidate facts) and the JD (company/role facts) —
a real cover letter legitimately draws on either, unlike Milestone 5's
resume-only rewriter:

1. Well-known companies (Google, Amazon, Meta, Apple, Netflix,
   Microsoft) mentioned that aren't a real employer — a specific risk
   for the "FAANG" style (the target company itself is excluded from
   this check, since the letter is legitimately addressed to it).
2. Certification claims not matching a real `resume.certifications[].name`.
3. Named technologies grounded in neither the resume nor the JD.
4. **A first-person possession claim** ("my technical expertise
   includes...", "I have...") naming a technology that's grounded in the
   JD but *not* the resume — stricter than check 3, since the general
   check allows JD-only grounding for legitimately discussing the role's
   requirements, but a claim about what the *candidate* possesses may
   only ever be grounded in the resume.
5. Numbers/metrics and dates not grounded in either source.

On any violation: one automatic regeneration with the specific
violations named in a corrective prompt; anything still invalid after
the retry is dropped (variants) or raises a clear error (single-output
artifacts like an email, which have no "keep the original" fallback
since there's no original to fall back to).

## What real testing found (and fixed)

Three real issues surfaced via live end-to-end testing (resume upload →
JD match → resume-optimizer → cover letter → accept → regenerate at
FAANG/Short → all 3 emails → LinkedIn → all 5 exports → chat):

1. **Real over-claiming bug, caught by testing, not by the validator.**
   The very first generated letter wrote "My technical expertise
   includes Java, Spring Boot, Spring Security, AWS, and Docker" — but
   the resume only lists plain "Spring," never "Spring Boot" or "Spring
   Security" specifically (those are the JD's required skills). The
   original validator's technology check allowed JD-only grounding
   (needed for legitimately discussing role requirements) and so missed
   this. **Fixed** two ways: (a) an explicit WRONG/RIGHT worked example
   added to `SAFETY_RULES_PROMPT` ("a broader/parent technology on the
   resume does NOT justify claiming a more specific one from the JD"),
   and (b) a new, narrower deterministic backstop in `validator.ts` that
   flags a JD-only-grounded technology specifically when it appears
   after a first-person possession phrase.
2. **That new backstop then produced its own false positives**, found
   immediately by re-testing: honest, correctly-hedged phrasing like "I
   am motivated to expand my skills in PostgreSQL to meet your needs"
   was flagged, because "my skills" sits right next to the JD-only tech
   in the same sentence even though "motivated to expand" makes the
   intent clearly aspirational, not a possession claim. A first attempt
   (comparing the text-distance between the nearest claim marker and the
   nearest aspirational marker) still failed on "expand my skills in X"
   specifically, since "expand" is the word directly governing "my
   skills," not a separate, more-distant marker. **Fixed** by replacing
   the distance comparison with a negative lookbehind — "my
   skills/expertise/experience/background" only counts as a possession
   claim when it is *not* immediately preceded by an aspirational verb
   (deepen/expand/grow/develop/build/strengthen/broaden/learn/improve/
   advance). Verified with a standalone unit test (4 cases: the real
   fabrication instance, and 3 genuinely honest aspirational phrasings)
   before re-running the full LLM pipeline — all 4 passed correctly
   after the fix, confirmed again in a full end-to-end regeneration at
   FAANG/Short (the exact style/length combination that had triggered
   the bug) with zero mentions of the ungrounded technologies.
3. **Chat routing can fail before it ever reaches the tool**, a sharper
   version of Milestones 4/5's already-documented multi-agent reply-
   degradation finding. A bare command like "Generate startup version"
   — copied near-verbatim from the spec's own chat examples — carries no
   resume/cover-letter signal word, so the protected Planner routed it
   to an unrelated tool (`project-tool`) entirely; the mutation never
   happened (the record's style stayed unchanged). A more naturally
   phrased request ("Generate a startup style version of my cover letter
   for this resume application") routed correctly to `resume-tool` and
   the mutation succeeded (style changed FAANG → Startup) — though the
   spoken reply was still degraded by the same protected multi-agent
   layer Milestone 4 root-caused. **Not fixed** — routing lives in the
   protected Planner. Documented as a real, sharper edge of an existing,
   already-accepted limitation: the spec's own terse example phrases
   work best when the surrounding chat context (or the phrasing itself)
   carries an explicit resume/cover-letter signal.

No fabrication observed anywhere else across testing: the model
correctly and repeatedly declined to claim PostgreSQL as a possessed
skill (writing honest gap-acknowledgment instead — "I have not yet
worked with PostgreSQL, I am eager to expand my knowledge"), LinkedIn
messages used `[Name]`/`[Recruiter's Name]` placeholders rather than
inventing a real person, and every real metric (the resume's "30% API
response time improvement") was carried through correctly without
duplication or invention.

## Export pipeline

Per this milestone's own package file list (unlike Milestones 3-5,
where export rendering lived under the API route's own `export/`
folder), all 5 formats live in one `export-service.ts`: a shared
`buildCoverExportSections()` (accepted letter, or the first pending
variant if none accepted yet; whichever emails/LinkedIn messages exist)
feeds `renderCoverMarkdown`/`renderCoverPlainText`/`renderCoverHtml`
(string builders) and `renderCoverPdf`/`renderCoverDocx` (via `pdfkit`/
`docx`, the same libraries every export in this arc already uses). The
API route is a thin format-switch caller.

## Known limitations

- The `KNOWN_TECHNOLOGIES` and `WELL_KNOWN_COMPANIES` lists in
  `validator.ts` are deliberately short and curated (same as Milestone
  5's) — real, high-value fabrication patterns, not exhaustive coverage.
- The possession-claim backstop's aspirational-verb lookbehind is a
  precise fix for the exact pattern real testing found, not a general
  natural-language possession detector — an unusual phrasing could still
  slip past it in either direction.
- Chat-driven generation requires a phrasing with enough resume/cover-
  letter signal for the protected Planner to route correctly; the
  spec's own terse example commands don't always carry enough on their
  own (see finding 3 above).
- `regenerateLetter()` doesn't currently support switching the target
  `companyName`/`hiringManager`/`role` mid-session — those are fixed at
  `start()`; a full company/role change starts a new session.

## Future extensions

- **JD-match-aware keyword injection feedback loop**: surface
  `keywordCoverage.missingKeywords` as one-click "add this" suggestions
  that trigger a targeted regeneration emphasizing a specific missing
  skill, rather than only reporting coverage after the fact.
- **Referral-name support**: `email-generator.ts`'s Referral audience
  already avoids inventing a referrer's name — a future pass could
  accept an actual referrer name/relationship as an explicit input and
  weave it in by name rather than staying generic.
- **Cross-artifact consistency**: currently the letter, email, and
  LinkedIn messages are generated independently and can drift in tone
  or which achievement they lead with; a future pass could pass the
  accepted letter's key talking points into the email/LinkedIn prompts
  so all three read as one coherent application package.
- **Multi-language support**: the style/length/validator architecture is
  language-agnostic in principle; a `language` input alongside `style`
  would be a natural, additive extension.
