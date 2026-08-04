# Phase 12 Milestone 2 — Enterprise Resume Parser (LLM Structured Extraction)

## Goal

Implement real parsing for the schema Milestone 1 defined: transform an
uploaded PDF/DOCX/TXT resume into a validated `EnterpriseResume` object.
Still no UI, no API route, no database, no ATS/JD-match/skill-gap/cover-
letter/interview-question generation (all explicitly future milestones) —
and still nothing in `src/lib/ai/resume/`, `GraphState`,
`ConversationService`, `Agent`, `PortfolioChain`, `PlannerService`, the
Tool Registry, `resume.tool.ts`, or `src/components/resume/*` is touched.

## Architecture

```
EnterpriseResumeUploadInput
        │
        ▼
extractEnterpriseResumeText()          Phase 6 reuse — no parsing logic
  loadDocument()                       duplicated:
  parseDocument()                      ingestion/document-loader.ts +
  normalizeText()                      ingestion/document-parser.ts,
        │                              same as resume/resume-parser.ts's
        ▼                              extractResumeText()
   raw resume text
        │
        ▼
EnterpriseResumeParser.parseResumeText()
        │
        ├─► openai.chat.completions.create()      lib/ai/openai.ts's
        │     model: gpt-4o-mini, temperature: 0    existing shared client
        │     response_format: json_schema           — no second client
        │     ENTERPRISE_RESUME_JSON_SCHEMA           created
        │     (Milestone 1, unmodified)
        │
        ▼
   raw JSON from OpenAI
        │
        ▼
enterpriseResumeSchema.safeParse()      throws ResumeParserError on failure
        │
        ▼
normalizeEnterpriseResume()             deterministic cleanup (see below)
        │
        ▼
computeConfidence()                     deterministic, per-section (see below)
        │
        ▼
EnterpriseResumeParseResult { resume, confidence, processingTimeMs }
```

`EnterpriseResumeParser` (a class, per spec) exposes `parseResume(input)`
(file → result) and `parseResumeText(text)` (already-extracted text →
result) — `parseResume` is a thin wrapper that calls
`extractEnterpriseResumeText` then `parseResumeText`. Both are also
exported as standalone functions for anything that only needs one stage.

## Extraction flow in detail

1. **Load + extract + normalize text** — `extractEnterpriseResumeText()`
   rejects unsupported formats (same PDF/DOCX/TXT restriction as
   `resume/resume-parser.ts`; Markdown rejected even though the shared
   loader detects it) and throws `ResumeParserError` if extraction yields
   no text at all.
2. **Structured extraction** — one `gpt-4o-mini` call at `temperature: 0`
   with `response_format: { type: "json_schema", json_schema:
   ENTERPRISE_RESUME_JSON_SCHEMA }`, exactly the pattern
   `planner/planner-schema.ts` and `resume/resume-parser.ts` already
   established. `ENTERPRISE_RESUME_JSON_SCHEMA` is used **unmodified** from
   Milestone 1 — strict mode's `additionalProperties: false` means the raw
   response literally cannot contain anything outside the resume shape
   (see "Confidence scoring" for why that matters).
3. **Validation** — `enterpriseResumeSchema.safeParse()` on the parsed
   JSON. Any failure (malformed JSON, schema mismatch) throws
   `ResumeParserError` with the Zod error message attached as `cause`.
4. **Normalization** — deterministic cleanup, see below.
5. **Confidence scoring** — deterministic, see below.

## Prompt design

The system prompt (`buildExtractionMessages` in `resume-parser.ts`)
instructs, in order: never invent/hallucinate and use real JSON `null`
(not the string `"null"`) for absent fields; copy proper nouns character-
for-character; the specific normalization rules below; and explicit
guidance for mapping varied section headings/regional resume conventions
(Indian/Middle Eastern/European/US) onto the fixed schema sections (e.g.
"Employment History"/"Work History"/"Career History" → `companyHistory`;
"Client Projects" → `projects`).

## Normalization

Two layers, not one:

- **Prompt-instructed** (during extraction): dates → consistent "Mon YYYY"
  style or "Present"; company names trimmed but not altered; standard
  degree names; full certification names; skill deduplication and
  category placement (with explicit boundary guidance — see "What testing
  found" below).
- **Deterministic post-processing** (`resume-normalizer.ts`, after
  validation):
  - `cleanNullableString()` — converts filler strings the model
    occasionally emits instead of real JSON `null` ("null", "N/A", "none",
    "unknown", "-") into actual `null`, applied to every nullable string
    field across the whole resume. This exists because of a real bug found
    in testing (see below) — the prompt alone wasn't reliable enough.
  - `normalizeTechToken()` — an exact-match lookup table for the specific
    variants called out in the spec (`Java17`/`JAVA17` → `Java 17`;
    `SpringBoot` → `Spring Boot`; `NodeJS` → `Node.js`; `Javascript` →
    `JavaScript`; `Typescript` → `TypeScript`; `Amazon Web Services` →
    `AWS`; `Microsoft Azure` → `Azure`; `Google Cloud Platform` → `GCP`;
    plus a few more common ones), applied only to `skills[].skills[]` and
    `projects[].technologies[]` — short tokens, safe for exact-match
    normalization.
  - `normalizeDateField()` — collapses "Current"/"Ongoing"/"Till
    Date"/"Till Now"/etc. to "Present".

  Deliberately **not** applied to free-text prose (`responsibilities`,
  `achievements`, `description`, `careerObjective`) — a lookup table is
  safe for a short token, not for rewriting a sentence.

## Validation and error handling

`ResumeParserError extends Error` (with an optional `cause`) is thrown for:
unsupported file format, no extractable text, no LLM content returned,
invalid JSON from the LLM, or Zod validation failure. Nothing else in the
pipeline throws a different error type — callers can catch one class.

## Confidence scoring

Deterministic, computed from the validated (and normalized) resume — not a
second LLM self-assessment call. Same reasoning `resume/resume-score.ts`
already documents for ATS scoring: an LLM asked to grade its own output is
poorly calibrated, and it's a second round-trip for a number that can be
computed directly from what was actually extracted.

- Each section's score is **field completeness**: for `personalInfo`/
  `professionalSummary` (single objects), the fraction of fields that are
  non-null/non-empty; for list sections, the average per-entry
  completeness (0 for an empty list — "nothing extracted" is scored as
  "nothing to be confident about", which is *not* the same claim as "the
  resume is incomplete": a resume with no patents section should score 0
  on `patents` confidence without that meaning anything is wrong).
- `overall` is a weighted average: core sections likely on every resume
  (`personalInfo`, `professionalSummary`, `education`, `companyHistory`,
  `skills`) are weighted higher than sections many resumes genuinely don't
  have (`patents`, `publications`, `volunteerExperience`, ...), so a
  perfectly good resume without patents isn't scored as "low confidence."

This is intentionally simple and inspectable — every number traces
directly back to which fields the schema validator saw as present, not to
an opaque model judgment.

## What real testing found (and fixed)

Tested against: the same real resume in all three supported formats (PDF/
DOCX/TXT), plus a second, different person's resume PDF. Three real issues
surfaced and were fixed during this milestone, not left as
theoretical concerns:

1. **Literal `"null"` strings instead of JSON `null`.** First PDF test run
   returned `education[0].startYear: "null"` (the four-character string) —
   passes Zod validation (any string satisfies `.nullable()`), but is a
   real bug: a non-empty string is truthy in JS, so
   `if (education.startYear)` would wrongly be `true`. Fixed with the
   `cleanNullableString()` normalizer pass plus an explicit prompt
   clarification, applied to every nullable string field in the resume.
2. **Skill miscategorization, then omission.** The first run put Kafka/
   ActiveMQ (messaging tools) under the `"AI"` category. Tightening the
   prompt's category boundaries fixed the miscategorization on the next
   run — but caused a worse regression: Kafka/ActiveMQ **disappeared
   entirely** instead of moving to a better category. Fixed with an
   explicit instruction that every mentioned skill must appear somewhere
   in the output, defaulting to `"Tools"` over omission when a category is
   ambiguous. Re-verified: both technologies now correctly appear under
   `"Tools"`.
3. **A single-character name error.** One TXT-format test run returned
   `"Zafril Islam"` for a resume whose source text clearly reads "ZAFRUL
   ISLAM" — confirmed against the raw extracted text, not a source typo.
   Added an explicit "copy proper nouns character-for-character" rule.
   Re-verified correct across two subsequent runs, but see "Known
   limitations" — this class of error is not proven to be eliminated,
   only reduced.

## Known limitations

- **Scanned/image-only PDFs return an empty (not erroring) result.**
  Confirmed directly: a second test PDF's embedded text layer contained
  only page-boundary markers (`"-- 1 of 2 --"`) — no OCR exists in this
  pipeline (`pdf-parse` extracts embedded text only), so the LLM correctly
  received near-nothing and correctly returned an all-null/empty
  structure rather than inventing content. This is the *correct* behavior
  per the "never hallucinate" rule, but a fully-empty successful result
  looks identical to "this resume genuinely has almost no content" from
  the caller's side. A future milestone could add a heuristic (e.g. throw
  `ResumeParserError` if extracted text is implausibly short) so a caller
  can distinguish "empty resume" from "unreadable PDF" — not implemented
  now since that's a behavior-shape decision, not a schema/parsing one.
- **Single-character transcription errors on proper nouns are reduced, not
  provably eliminated.** The fix above measurably helped in re-testing, but
  this is a known LLM failure mode in general; nothing here can guarantee
  100% character-fidelity on every run. Human review remains advisable for
  high-stakes use.
- **Date normalization relies on the model's contextual judgment, not
  deterministic parsing.** Deliberately not implemented as regex/date-math
  — date formats are genuinely ambiguous across resume conventions (e.g.
  `03/04/2022` means different days in US vs. European convention), and a
  blind deterministic parser risks *confidently* producing a wrong date,
  which is worse than the model's contextual (if imperfect) judgment.
- **`companyHistory[].duration` / `projects[].duration` are usually left
  null** even when `startDate`/`endDate` are both present — the model
  rarely states a separately-computed duration verbatim, and nothing here
  derives it. A reasonable Milestone 3+ addition: compute `duration`
  deterministically from `startDate`/`endDate` in the normalizer.
- **Confidence scores measure extraction completeness, not extraction
  correctness.** A section can score high confidence while still
  containing an error like the name typo above — completeness and
  accuracy are different questions, and only the former is checked here.
- **The 10-category skill taxonomy has genuine edge cases.** Kafka/
  ActiveMQ under "Tools" is a reasonable default, not necessarily what
  every reader would call correct — messaging/streaming technologies don't
  have a dedicated category in this schema.
- Only tested against resumes available on this machine (one person's
  resume in three formats, plus one second resume that turned out to be
  unreadable). Not yet verified against a deliberately broad set of
  fresher/manager/senior-architect-style resumes as the spec requested —
  flagging honestly rather than claiming untested coverage.

## Future milestones

- Decide the empty-vs-error behavior for near-unreadable input (see above).
- Derive `duration` fields deterministically where start/end dates exist.
- Everything explicitly excluded from this milestone: ATS score, JD match,
  skill gap, resume-bullet optimization, cover letter generation,
  interview question generation, any UI/API/database wiring.

## Verification

`npx eslint`, `npx tsc --noEmit`, and `npm run build` all pass. Manually
tested via a temporary, since-deleted API route (not part of this
milestone's deliverable) against real PDF/DOCX/TXT files, including the
issue-finding and re-verification described above.
