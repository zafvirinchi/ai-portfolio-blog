# Phase 13 Milestone 1 — Job Description Intelligence Engine

## Goal

Make the uploaded Job Description a first-class AI object, the same way
Phase 9 made Resume one — parsed, structured, stored, and displayable —
without comparing it against a resume yet. That comparison is explicitly
Milestone 2. This milestone is additive only: a new package, a new API
route, a new page, and nothing else touched.

## Architecture

```
JobUploadInput (file) or raw pasted text
        │
        ▼
JobParser.parseFile() / .parseText()
        │
        ├─► extractJobText()              ingestion/document-loader.ts +
        │     (file path only)            ingestion/document-parser.ts —
        │                                 same shared, untouched loader
        │                                 resume/resume-parser.ts and
        │                                 resume-enterprise/resume-parser.ts
        │                                 both already use
        │
        ├─► openai.chat.completions.create()   gpt-4o-mini, temperature 0
        │     response_format: json_schema       response_format: jobJsonSchema
        │
        ▼
   raw JSON from OpenAI
        │
        ▼
jobSchema.safeParse()              throws on validation failure
        │
        ▼
normalizeJobDescription()          deterministic case-insensitive dedup
        │                          safety net behind the prompt's own
        │                          normalization instructions
        ▼
   JobDescription
        │
        ▼
JobService.parseFile() / .parseText() / .parse()
        │
        ├─► stores { jobId, filename, uploadedAt, jobDescription,
        │            processingTimeMs } in an in-memory Map, 2-hour TTL
        │            (same lazy-purge pattern resume/resume-service.ts uses)
        │
        ▼
POST /api/ai/job  ->  { jobId, filename, processingTime, ...jobDescription }
        │
        ▼
/ai/job-analyzer  ->  JobUpload -> JobSummary/JobOverview/JobSkills/
                       JobTechnologyStack/JobResponsibilities/
                       JobRequirements/JobBenefits
```

`jobRequestContext` (`job-context.ts`) is the same `AsyncLocalStorage`
pattern as `resumeRequestContext`, defined and exported but **not wired
into anything yet** — no tool, no chat route, no LangGraph node touches
it in this milestone. It exists now so a later milestone (chat/tool
integration, or the resume-vs-JD comparison) can reuse it without a
schema/shape change, the same way `resumeRequestContext` was reused as-is
across three earlier phases.

## Flow

1. User uploads a PDF/DOCX/TXT/MD job description (or, via
   `JobService.parseText()`, pastes raw text — not wired to the UI in
   this milestone, but implemented and ready).
2. `extractJobText()` loads and extracts plain text via the shared
   ingestion pipeline; any other format (images, Excel, Zip, ...) is
   rejected by `loadDocument()`'s existing format allow-list before
   anything else runs.
3. One `gpt-4o-mini` structured-output call extracts all ~38 fields in a
   single pass — company/title/category/employment type/location/work
   mode/experience range, four skill buckets (required/preferred/
   mandatory/nice-to-have) plus six categorized-skill buckets
   (programming languages/frameworks/cloud/databases/DevOps/AI),
   responsibilities/qualifications/education/certifications/benefits/
   salary/keywords/technologies/tools, and the logistics fields (hiring
   manager, recruitment agency, visa sponsorship, relocation, travel,
   security clearance, team size, domain, business area, role level,
   seniority).
4. `normalizeJobDescription()` re-dedupes every string-array field
   case-insensitively as a deterministic backstop — verified against a
   real extraction where the source text literally repeated
   "java, JAVA, and Java 17"; the output contained exactly one "Java".
5. `JobService` assigns a `jobId`, stores the record for 2 hours, and
   returns it. `POST /api/ai/job` flattens `jobId`/`filename`/
   `processingTime` alongside every `JobDescription` field at the top
   level (matching the response shape the spec asked for).
6. `/ai/job-analyzer` renders the result across 7 presentational cards
   (`JobSummary` is a deterministic templated sentence — not another LLM
   call — built from the already-extracted fields).

## Files added

- `src/lib/ai/job/job-schema.ts` — `jobSchema` (Zod) + `jobJsonSchema`
  (hand-written strict-mode mirror), exactly the `planner-schema.ts`/
  `resume-schema.ts` pattern. Names are `jobSchema`/`jobJsonSchema`
  exactly as specified — a deliberate one-off deviation from this
  codebase's usual `ALL_CAPS` convention for the JSON-schema constant.
- `src/lib/ai/job/job-types.ts` — `JobUploadInput`, `JobParseResult`
  (aliased as `JobRecord`).
- `src/lib/ai/job/job-parser.ts` — `extractJobText()`, `JobParser` class
  (`parseText`/`parseFile`), the extraction prompt, and the
  case-insensitive normalization pass.
- `src/lib/ai/job/job-context.ts` — `jobRequestContext`
  (`AsyncLocalStorage`), unwired, ready for reuse.
- `src/lib/ai/job/job-service.ts` — `JobService`
  (`parse`/`parseText`/`parseFile`/`get`), in-memory TTL store, all four
  required `[job-agent]` log lines (Job uploaded/parsed/normalized/
  completed).
- `src/lib/ai/job/index.ts` — barrel.
- `src/app/api/ai/job/route.ts` — `POST`, multipart `file` field,
  `maxDuration = 60`, 422 on any failure (unsupported format, no
  extractable text, schema validation failure — all client-input
  problems, not server errors).
- `src/components/job/JobUpload.tsx`, `JobOverview.tsx`, `JobSkills.tsx`,
  `JobResponsibilities.tsx`, `JobRequirements.tsx`,
  `JobTechnologyStack.tsx`, `JobBenefits.tsx`, `JobSummary.tsx` — one
  presentational card per component, matching
  `src/components/resume/*`'s existing Tailwind conventions exactly
  (same card/chip/label classes reused, not a new style system).
- `src/app/(site)/ai/job-analyzer/page.tsx` — new page, same visual
  shell as `/resume-analyzer` and `/ai` (centered `max-w-5xl`,
  `bg-slate-50`, eyebrow/h1/subtitle header, upload-then-result flow).

## Files modified

None. This milestone touches zero existing files — `resume/*`,
`resume-enterprise/*`, `job-description/*` (Phase 12's JD-matching
package), `job-match/*`, `ConversationService`, LangGraph, `Planner`,
`PortfolioChain`, Knowledge Pipeline/Manager, Interview Pipeline, Tool
Registry, and the database are all untouched. The only cross-package
reference is a **read-only** import of `TECHNOLOGY_DICTIONARY` from
`resume-enterprise/ats` inside `JobTechnologyStack.tsx` (client-side
categorization for the Testing/Architecture/Security groups) — the same
reuse precedent Phase 12 Milestone 4's `ats-engine.ts` and
Milestone 5's normalizers already established.

## Technology Stack grouping

`JobTechnologyStack.tsx` renders 10 categories. Six come directly from
`job-schema.ts`'s own categorized fields (Languages, Frameworks,
Databases, Cloud, DevOps, AI). The schema doesn't have dedicated
Testing/Architecture/Messaging/Security fields, so those four are derived
client-side from `job.technologies`/`job.tools`/`job.keywords`: Testing,
Architecture, and Security are matched against
`resume-enterprise/ats`'s `TECHNOLOGY_DICTIONARY` (read-only); Messaging
isn't a category there (Kafka/RabbitMQ are filed under "Backend"), so it
uses a small local list instead.

## Known limitations

- `JobService.parseText()` is implemented and tested at the unit level
  (called internally by `.parse()`) but has no UI entry point yet — the
  page only wires up file upload. Pasting raw JD text is a natural
  follow-up, not built here since the spec's UI section only asked for
  `JobUpload`.
- "Required Skills" vs. "Mandatory Skills" and "Preferred Skills" vs.
  "Nice to Have Skills" are semantically close pairs; the prompt treats
  `mandatorySkills` as a stricter-emphasis subset of `requiredSkills` and
  populates `preferredSkills`/`niceToHaveSkills` identically unless the
  source text draws its own distinction — this is a judgment call, not a
  guaranteed 4-way semantic split every JD's wording will support.
  Verified working correctly on a real JD that used "(must have)"/
  "(required)" phrasing — mandatorySkills correctly picked out that
  subset.
- Salary parsing converts regional shorthand (e.g. "25-35 LPA") into an
  absolute numeric range — verified correct on one real example, but this
  is LLM judgment, not a deterministic currency parser, so unusual
  formats aren't guaranteed.
- `jobRequestContext` is intentionally inert in this milestone — nothing
  reads from it yet.

## Validation results

- Real end-to-end run against a synthetic JD deliberately containing
  "java, JAVA, and Java 17" and "(must have)"/"(required)" emphasis
  phrasing: all three Java variants correctly collapsed to a single
  "Java"; `mandatorySkills` correctly captured `["AWS", "Docker"]`;
  location/salary/hiring manager/visa sponsorship/relocation all
  extracted correctly; `roleLevel`/`seniority` correctly inferred
  "Senior" from the job title after a prompt refinement (the first pass
  left them `null` — overly conservative about title-implied level — an
  explicit instruction fixed it, verified with a second run).
- 422 rejection verified against both a `.zip` and a `.png` upload —
  both correctly rejected via the shared ingestion loader's existing
  format allow-list, no new validation code needed.
- `npm run lint` — 0 errors (1 pre-existing, unrelated warning in
  `blog/[slug]/page.tsx`).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean; `/ai/job-analyzer` and `/api/ai/job` both
  registered correctly; every pre-existing route unchanged.

## Future extension points (explicitly out of scope here)

- Milestone 2: compare a parsed `JobDescription` against a parsed
  `Resume`/`EnterpriseResume` — match scoring, gap analysis, etc.
- Wiring `jobRequestContext` into a chat tool, the same way
  `resumeRequestContext` feeds `resume.tool.ts`.
- A paste-text entry point in the UI, using the already-implemented
  `JobService.parseText()`.
- Persisting parsed job descriptions beyond the 2-hour in-memory TTL, if
  a future milestone needs them to outlive a single session.
