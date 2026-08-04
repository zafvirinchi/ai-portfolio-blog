# Phase 12 Milestone 1 — Enterprise Resume Parser Foundation

## Goal

The existing Resume Analyzer (Phase 9, `src/lib/ai/resume/`) extracts a
useful but narrow slice of a resume — contact info, a flat skills list,
work experience, education, certifications, projects, achievements. Real
resumes carry a lot more structured information than that: full company
history with responsibilities *and* achievements kept separate, categorized
skills (languages vs. frameworks vs. cloud vs. tools, etc.), publications,
patents, awards, spoken languages, volunteer work.

This milestone lays the **schema foundation** for an Enterprise Resume
Parser that will eventually extract all of that. It is deliberately scoped
to schema and types only:

- No parsing logic, no OpenAI calls, no UI, no API route, no database, no
  LangGraph changes.
- Nothing in `src/lib/ai/resume/` is modified or deleted — this is a new,
  parallel package.
- Nothing in `GraphState`, `ConversationService`, `Agent`, `PortfolioChain`,
  `PlannerService`, the Tool Registry, the Knowledge Base, `resume.tool.ts`,
  or `src/components/resume/*` is touched. The live Resume Analyzer is
  completely unaffected by this milestone.

## Architecture

```
src/lib/ai/resume/              (Phase 9 — unchanged, still the only
  resume-schema.ts               feature actually wired into the app)
  resume-parser.ts
  resume-analyzer.ts
  resume-score.ts
  resume-suggestions.ts
  resume-service.ts
  resume-types.ts
  index.ts

src/lib/ai/resume-enterprise/   (Phase 12 Milestone 1 — new, parallel,
  resume-schema.ts               additive, not imported by anything yet)
  resume-json-schema.ts
  resume-types.ts
  resume-parser.ts              (stub — throws, see below)
  resume-normalizer.ts          (stub — throws, see below)
  index.ts
```

The two packages are siblings, not a replacement — `resume-enterprise/`
doesn't import from `resume/` and nothing yet imports from
`resume-enterprise/`. It is inert code until Milestone 2+ wires it up.

## Schema

`resume-schema.ts` defines the full shape via Zod, `EnterpriseResume` at
the top:

| Field | Shape |
|---|---|
| `personalInfo` | firstName, lastName, email, phone, linkedin, github, portfolio, location |
| `professionalSummary` | headline, currentDesignation, careerObjective, yearsOfExperience |
| `education[]` | institute, degree, specialization, startYear, endYear, grade |
| `companyHistory[]` | companyName, designation, employmentType, startDate, endDate, duration, location, responsibilities[], achievements[] |
| `projects[]` | projectName, client, role, description, responsibilities[], technologies[], duration, achievements[] |
| `skills[]` | `ResumeSkillGroup { category, skills[] }` — see below |
| `certifications[]` | name, issuer, date, expiryDate, credentialId |
| `awards[]` | title, issuer, date, description |
| `publications[]` | title, publisher, date, url, description |
| `patents[]` | title, patentNumber, date, description |
| `languagesKnown[]` | language, proficiency |
| `volunteerExperience[]` | organization, role, startDate, endDate, description |
| `interests[]` | string[] |
| `achievements[]` | string[] |

Every scalar field is `.nullable()` (never `.optional()`), and every array
defaults to `[]`. This isn't just a style choice carried over from
`resume/resume-schema.ts` — it's required for OpenAI's strict-mode
Structured Outputs, which this schema is built to eventually feed
(`resume-json-schema.ts`): every property must be listed in `required`, so
"this resume has no GitHub link" has to be modeled as `github: null`, not
as an absent key.

### Why `skills` is `ResumeSkillGroup[]`, not one fixed-field object

The requested categories (Programming Languages, Frameworks, Libraries,
Cloud, DevOps, Databases, AI, Soft Skills, Tools, Methodologies) could have
been ten separate fixed fields on one object, mirroring how
`resume/resume-schema.ts` does `skills`/`technicalSkills`/`softSkills` as
three flat arrays. Instead, `skills` is an array of:

```ts
{ category: "Cloud" | "DevOps" | ..., skills: string[] }
```

This keeps the shape extensible — a future category doesn't require a
schema/JSON-schema shape change, just a new enum value — and matches the
singular `ResumeSkillGroup` type name.

## The two hand-written schemas, and why they're separate files

`resume-json-schema.ts` is a hand-written mirror of `resume-schema.ts`'s
Zod schema, in the exact `{ name, strict: true, schema }` shape already
established by `planner/planner-schema.ts`'s `PLANNER_JSON_SCHEMA` and
`resume/resume-schema.ts`'s `RESUME_EXTRACTION_JSON_SCHEMA`. It's
hand-written rather than derived from the Zod schema for the same reason
both of those are: OpenAI's strict-mode `json_schema` only supports a
constrained subset of JSON Schema (no Zod-specific features, no inferred
`required` arrays), so keeping the two in sync by hand — verified by the
type checker on the Zod side and by eye on the JSON Schema side — is more
reliable than a generic Zod-to-JSON-Schema converter that would need to
special-case strict mode's constraints anyway.

Unlike `resume/resume-schema.ts` (which keeps its Zod schema and JSON
schema in the same file), this package splits them into `resume-schema.ts`
and `resume-json-schema.ts` — the requested file layout for this milestone.

## Why `resume-parser.ts` and `resume-normalizer.ts` exist but throw

Both files are real, typed, exported functions — not empty placeholders —
but every function body is `throw new Error("... not implemented yet ...")`.
This gives Milestone 2 a fixed contract to implement against instead of
inventing function names/signatures at that point:

- `extractEnterpriseResumeText(input)` / `parseEnterpriseResumeText(text)`
  in `resume-parser.ts` mirror `resume/resume-parser.ts`'s
  `extractResumeText()` / `parseResumeText()` two-step shape — reusing
  `ingestion/document-loader.ts` + `ingestion/document-parser.ts` for
  extraction, then an OpenAI Structured Outputs call against
  `ENTERPRISE_RESUME_JSON_SCHEMA` for parsing.
- `normalizeEnterpriseResume(resume)` in `resume-normalizer.ts` is where
  post-processing will live: deduplicating skills within/across
  `ResumeSkillGroup` entries, normalizing inconsistent date formats across
  `education`/`companyHistory`/`projects`, and deriving
  `professionalSummary.yearsOfExperience` from `companyHistory` date ranges
  when a resume doesn't state it directly.

## Future milestones

- **Milestone 2**: implement `resume-parser.ts` for real (text extraction +
  OpenAI structured extraction) and `resume-normalizer.ts`'s post-processing.
- **Milestone 3+**: decide how `resume-enterprise/` surfaces to users — a
  new opt-in "enterprise" upload mode, richer fields feeding the existing
  Resume Analyzer UI, or something else. Explicitly out of scope for now;
  no UI/API/DB decisions have been made yet.

## Verification

`npx eslint`, `npx tsc --noEmit`, and `npm run build` all pass with this
milestone's changes — see the implementation notes for exact commands run.
