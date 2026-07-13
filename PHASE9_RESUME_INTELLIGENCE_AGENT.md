# Phase 9 — Enterprise Resume Intelligence Agent

## Goal

Let a recruiter or visitor upload a resume (PDF/DOCX/TXT) and get an
instant AI analysis — ATS score, skill gap, career level, suitable roles,
improvement suggestions — then ask follow-up questions in chat, grounded
in that specific resume. The uploaded resume is temporary, in-memory only,
and never touches the Knowledge Base (`rag_documents`/`rag_document_chunks`).

This phase adds a new capability on top of the existing pipeline. It does
**not** change `ConversationService`, `Agent.run()`'s signature, `GraphState`,
the LangGraph topology, `PlannerService`'s mechanics, the Tool Registry's
interface, `PortfolioChain`'s class, the Retriever, or the Knowledge
Pipeline/Manager.

## Architecture

The existing pipeline (Phase 3–8) is unchanged in shape:

```
ConversationService → Agent → LangGraph → Planner → Tool Registry → PortfolioChain → Retriever
```

Resume intelligence plugs into this at exactly one point — as a new
registered tool — plus one new, independent upload/analysis endpoint that
never touches the graph at all:

```
                                   ┌─────────────────────────────┐
                                   │  POST /api/ai/resume         │
  Upload (PDF/DOCX/TXT)  ────────► │  ResumeService.analyzeUpload  │──► in-memory store
                                   │  (parse → analyze → score →   │    (resumeId, TTL 2h)
                                   │   skill-gap)                  │
                                   └─────────────────────────────┘
                                                  │
                                                  │ resumeId
                                                  ▼
  Browser chat  ──► POST /api/ai/chat {message, history, resumeId?}
                              │
                              ▼
                    resumeRequestContext.run({resumeId}, …)
                              │
                              ▼
                    ConversationService.ask()   ← UNCHANGED
                              │
                              ▼
                    Agent.run()                 ← UNCHANGED
                              │
                              ▼
                    LangGraph (existing StateGraph, Phase 8) ← UNCHANGED topology
                    planner → tool → promptBuilder → generation
                              │
                     planner picks "resume-tool"
                     (PLANNER_INTENTS/"resume" already existed — see below)
                              │
                              ▼
                    resume-tool  (new, registered in AI_TOOLS)
                    reads resumeId from resumeRequestContext,
                    looks up the in-memory record, returns it as
                    a RagToolResult-shaped {context, chunks: []}
                              │
                              ▼
                    PortfolioChain.invoke()      ← UNCHANGED, same one
                                                     LLM answer-generation step
```

**No new LangGraph node was added.** The existing `tool` node
(`graph/tool-node.ts`, untouched) already dispatches generically to
whichever tool `AI_TOOLS.find(t => t.name === state.selectedTool)` resolves
to — that's precisely the extension point Phase 8 built. Registering
`resume-tool` in `AI_TOOLS` was sufficient; adding a parallel `resumeNode`
would have meant new edges/conditional routing, which the phase brief
explicitly says not to do ("Do NOT redesign the graph. Reuse existing
GraphState").

## Why the planner "just worked"

`PLANNER_INTENTS`/`PLANNER_TOOLS` (`planner/planner-schema.ts`) already
included `"resume"` / `"resume-tool"` since Phase 5 — anticipating this
work — but `resume-tool` was never registered in `AI_TOOLS`, so it always
fell through to the keyword-based `ToolExecutor` fallback. This phase:

1. Implements `resume-tool` for real (`tools/resume.tool.ts`) and registers
   it in `AI_TOOLS` (`tools/registry.ts`) — the planner can now actually
   route to it.
2. Widens `planner-prompt.ts`'s one-line description of the `"resume"`
   intent (previously "Zafrul's resume, CV, or work history" only) to also
   cover "questions about an uploaded resume — ATS score, skill gaps,
   career level, etc.", so questions like *"What is my ATS score?"*
   classify correctly. This is a **wording change to one string**, not a
   schema, model, or fallback-logic change — `PlannerService` itself was
   not touched.

## Threading "which resume" through an unchanged `GraphState`

`resume-tool.execute(question: string)` — like every `AITool` — only
receives the question string, no session/request identifier. Rather than
adding a `resumeId` field to `GraphState` (and threading it through
`Agent.run()`, `ConversationService.ask()`, and every node signature),
this phase uses Node's `AsyncLocalStorage` as request-scoped context:

- `resume-service.ts` exports `resumeRequestContext = new AsyncLocalStorage<{resumeId: string}>()`.
- `/api/ai/chat/route.ts` wraps the existing `conversationService.ask()`
  call in `resumeRequestContext.run({resumeId}, …)` **only when** the
  request body includes a `resumeId` — existing callers that never send
  one get the exact same code path as before (`askQuestion()` called
  directly), so this is fully backward compatible.
- `resume-tool.ts` reads `resumeRequestContext.getStore()?.resumeId` to
  find the active resume, with no changes to `GraphState`, `Agent.run()`,
  or `ConversationService.ask()`'s public signatures.

This was verified empirically (not just designed on paper) with a
temporary diagnostic that confirmed the module instance and lookup are
correctly shared within one request's async chain (see "What went wrong
during testing" below for the one real bug this surfaced).

## Sequence diagram — upload & analyze

```
Browser              /api/ai/resume         ResumeService        OpenAI
  │  POST file             │                      │                 │
  │────────────────────────►                      │                 │
  │                         │  analyzeUpload(file) │                 │
  │                         │──────────────────────►                 │
  │                         │                      │ extractResumeText()
  │                         │                      │ (reuses ingestion/
  │                         │                      │  document-loader +
  │                         │                      │  document-parser)
  │                         │                      │──► "Resume uploaded" log
  │                         │                      │                 │
  │                         │                      │  parseResumeText()
  │                         │                      │─────────────────► (structured extraction,
  │                         │                      │                    gpt-4o-mini, strict JSON schema)
  │                         │                      │◄─────────────────  Resume
  │                         │                      │──► "Resume parsed" log
  │                         │                      │                 │
  │                         │                      │  resumeAnalyzer.analyze(resume)
  │                         │                      │─────────────────► (gpt-4o-mini, strict JSON schema)
  │                         │                      │◄─────────────────  ResumeAnalysis
  │                         │                      │──► "Analysis completed" log
  │                         │                      │                 │
  │                         │                      │  resumeScorer.score(resume)      (deterministic, no LLM call)
  │                         │                      │──► "ATS generated" log
  │                         │                      │                 │
  │                         │                      │  resumeSuggestionsEngine.analyzeSkillGap(resume)  (deterministic)
  │                         │                      │                 │
  │                         │                      │  store in Map, keyed by resumeId (TTL 2h)
  │                         │◄──────────────────────                 │
  │◄────────────────────────  JSON: {resumeId, resume, analysis, atsScore, skillGap, processingTimeMs}
```

## Sequence diagram — resume-aware chat

```
Browser            /api/ai/chat        ConversationService/Agent/Graph        resume-tool          PortfolioChain
  │ POST {message,      │                        │                                │                     │
  │  history, resumeId} │                        │                                │                     │
  │──────────────────────►                       │                                │                     │
  │                      │ resumeRequestContext.run({resumeId}, askQuestion)       │                     │
  │                      │───────────────────────►│                                │                     │
  │                      │                        │ runGraph() (unchanged StateGraph, Phase 8)            │
  │                      │                        │  planner → intent "resume", tool "resume-tool"       │
  │                      │                        │  tool node → AI_TOOLS.find("resume-tool").execute()  │
  │                      │                        │───────────────────────────────►│                     │
  │                      │                        │                                │ getStore().resumeId │
  │                      │                        │                                │ resumeService.get()  │
  │                      │                        │                                │ builds {context,     │
  │                      │                        │                                │  chunks: []}          │
  │                      │                        │◄───────────────────────────────│                     │
  │                      │                        │  promptBuilder → mergedContext = that context        │
  │                      │                        │  generation ────────────────────────────────────────►│
  │                      │                        │                                │        ONE LLM call  │
  │                      │                        │◄────────────────────────────────────────────────────│
  │                      │◄───────────────────────│  {answer, tool, intent, sources}                      │
  │◄──────────────────────                        │                                │                     │
```

## New package: `src/lib/ai/resume/`

| File | Responsibility |
|---|---|
| `resume-schema.ts` | Zod schemas (`resumeSchema`, `resumeAnalysisSchema`, `atsScoreSchema`, `skillGapSchema`) + hand-mirrored strict JSON schemas for OpenAI Structured Outputs (same pattern as `planner/planner-schema.ts`). |
| `resume-types.ts` | Non-Zod service-layer contracts: `ResumeUploadInput`, `ResumeAnalysisResult`, `ResumeRecord`. |
| `resume-parser.ts` | `extractResumeText()` reuses `ingestion/document-loader.ts` + `ingestion/document-parser.ts` (`loadDocument`, `parseDocument`, `normalizeText`) — **no parsing logic duplicated**. `parseResumeText()` does LLM structured extraction into `Resume`. PDF/DOCX/TXT only (Markdown, which the shared loader also detects, is explicitly rejected here). |
| `resume-analyzer.ts` | `ResumeAnalyzer.analyze()` — the one qualitative LLM call (gpt-4o-mini): strengths, weaknesses, missing skills, career level, suitable roles, tech stack, improvement suggestions. |
| `resume-score.ts` | `ResumeScorer.score()` — **deterministic**, not an LLM call (see below). |
| `resume-suggestions.ts` | `ResumeSuggestionsEngine.analyzeSkillGap()` — **deterministic** taxonomy matching for Java/Spring/Cloud/DevOps/AI/Database gaps + course/certification/project recommendations. |
| `resume-service.ts` | `ResumeService` — orchestrates the pipeline, in-memory `Map` store (2h TTL, purged on access), and `resumeRequestContext` (`AsyncLocalStorage`). |
| `index.ts` | Barrel re-exporting all of the above. |

### Why scoring and skill-gap are deterministic, not LLM calls

Real ATS software scores resumes via rule-based parsing and keyword
matching, not judgment — a heuristic scorer is *more* representative of
what it simulates, not less. It's also faster, free, and reproducible.
Only two things in this phase's pipeline genuinely need a model's
judgment (extraction of unstructured text into fields, and holistic
qualitative analysis) — those are the only two LLM calls per upload.

## Tool: `resume-tool`

`tools/resume.tool.ts`, registered in `tools/registry.ts`'s `AI_TOOLS`
array alongside `projectTool`/`blogTool`/`ragTool`. Its `execute()`:

1. Reads the active `resumeId` from `resumeRequestContext`.
2. If found, renders the stored analysis (ATS score, skill gap, strengths,
   suitable roles, etc.) into a text block and returns it as
   `{context, chunks: []}` — a shape that `tool-node.ts`'s existing
   `isRagToolResult()` duck-type check already recognizes, so it flows
   through the unchanged `retrievedContext`/`sources` wiring with zero
   graph changes.
2. If no resume is active for this request, **falls back to
   `ragKnowledge.search(question)`** — preserving the pre-existing
   behavior for "resume" intent questions about *Zafrul's own* resume/CV
   (a `rag_documents` entry with `document_type: "resume"`), which
   previously reached that same RAG path via the keyword fallback before
   `resume-tool` existed. No regression for that case.

## API

### `POST /api/ai/resume`

Accepts `multipart/form-data` with a `file` field. Calls
`resumeService.analyzeUpload()` and returns the full
`ResumeAnalysisResult` as JSON: `resumeId`, `filename`, `uploadedAt`,
`resume`, `analysis`, `atsScore`, `skillGap`, `processingTimeMs`. Returns
`422` (not `500`) for a valid-but-failed analysis (unsupported format, no
extractable text), matching the convention used by `/api/admin/knowledge`
(Phase 7).

### `POST /api/ai/chat` (extended, backward compatible)

Now also reads an optional `resumeId` from the body. When present, wraps
the existing `conversationService.ask()` call in
`resumeRequestContext.run({resumeId}, …)`. When absent, behaves exactly as
before — same function call, same code path.

## UI: `/resume-analyzer`

`src/app/(site)/resume-analyzer/page.tsx` (route group `(site)` so it
inherits the existing `Navbar`/`Footer`, resulting URL is `/resume-analyzer`),
plus `src/components/resume/`:

| Component | Purpose |
|---|---|
| `ResumeUpload.tsx` | Drag-and-drop + click-to-browse zone; real upload progress via `XMLHttpRequest` (same pattern as `KnowledgeUpload.tsx`, Phase 7). |
| `ResumeOverview.tsx` | Career level badge, professional summary, suitable roles, strengths/weaknesses, improvement suggestions. |
| `ResumeAtsScore.tsx` | Overall score as a meter (single-hue fill, direct-labeled) + 6 sub-score bars + explanation text. |
| `ResumeTechRadar.tsx` | "Technology Radar" — see design note below. |
| `ResumeSkillGap.tsx` | Missing skills grouped by category + recommended courses/certifications/projects. |
| Chat panel | Reuses the existing `ChatBox` component (extended with optional `resumeId`/copy props, fully backward compatible — `<ChatBox />` with no props renders identically to before this phase) rather than building a second chat UI. |

A "Download Analysis" button generates a Markdown report client-side from
the already-fetched result (no extra request) and triggers a browser
download.

### Design note: "Technology Radar" isn't a spider chart

Per the project's dataviz skill guidance (consulted before writing any
chart code): a resume's tech stack has no real per-skill magnitude to
plot — there's no proficiency score in the source data. Plotting a
fabricated radar/spider chart would mean inventing values. The guidance's
own form-selection table calls this out directly: "more than ~7 classes
that all carry meaning → a table (or table + chart)," not a chart with
invented axes. `ResumeTechRadar` instead renders the detected technologies
as **categorized chips** (Languages / Frameworks / Cloud & Infra /
Databases / DevOps & Tools / AI & Data), all in one accent color — per the
guidance, that's one series ("detected technology"), so uniform color is
correct; a different hue per skill would be the "cycling hues" anti-pattern
the guidance explicitly warns against.

## What went wrong during testing (and the real fix)

Browser-driven end-to-end testing (Playwright, not just the backend
smoke test) surfaced a genuine bug that a script-only test missed: the
resume chat question consistently got *"The requested information is not
available in the knowledge base."* even though `resume-tool` correctly
found the record and injected the right context (verified with a
temporary diagnostic log at the generation node — the full resume context
was present, correctly formatted, non-empty).

The root cause: `prompt.ts`'s system prompt opens with *"Your job is to
answer questions about Zafrul Islam using ONLY the provided knowledge
base"* and includes *"If context is empty, say the information is not
available."* At `temperature: 0.35`, the model was generalizing that
refusal to "this context isn't about Zafrul" even though it wasn't empty.
Two small, additive fixes (not a chain rewrite):

1. **`prompt.ts`** — added one new rule (11) telling the assistant that
   when the context describes an uploaded resume, answer about *that*
   candidate instead of Zafrul, and not to claim the information is
   unavailable when it's present. This alone wasn't fully reliable at
   `temperature: 0.35`.
2. **`resume.tool.ts`** — prepended an explicit "SPECIAL MODE" directive
   to the *context itself* (not just the system prompt), since
   context-embedded instructions next to the relevant data carry more
   weight than a general system-prompt rule competing with a
   strongly-worded persona opening. This made the behavior reliable across
   repeated runs.

Both changes are prompt/context wording only — `PortfolioChain` the class,
its `.invoke()` signature, and the rest of its logic are untouched. A
regression check (re-asking a normal "about Zafrul" question on the
existing `/ai` page, with no `resumeId` involved at all) was run
afterward and confirmed unaffected.

This is also why the phase brief's "run it in a browser" step earned its
keep here — a logic-level smoke test (calling `agent.run()` directly)
had already passed with the *original* unmodified prompt, because it
exercised the same code path OpenAI's non-determinism happened to answer
correctly for on that run. Only repeated, real HTTP-path testing surfaced
the flakiness and its cause.

## Logging

Four lines in `resume-service.ts`, all prefixed `[resume-agent]`, one per
pipeline stage: `Resume uploaded`, `Resume parsed`, `Analysis completed`,
`ATS generated`. No per-field dumps, no verbose tracing. (The existing
`[ai-graph]` logs from Phase 8 — Planner selected, Tool executed, etc. —
already cover the chat/graph side and needed no changes.)

## Database

**Confirmed zero changes**, verified via `git diff`:

- `rag_documents` / `rag_document_chunks` schema — untouched.
- Knowledge Pipeline (`src/lib/ai/ingestion/*`, Phase 6) — untouched; only
  *reused* (`document-loader.ts`, `document-parser.ts`).
- Knowledge Manager (`src/app/api/admin/knowledge/*`,
  `src/components/admin/knowledge/*`, Phase 7) — untouched.
- Uploaded resumes are **never** written to `rag_documents` — they live
  only in `ResumeService`'s in-memory `Map`, expiring after 2 hours.

## Files added

```
src/lib/ai/resume/{resume-schema,resume-types,resume-parser,resume-analyzer,
                    resume-score,resume-suggestions,resume-service,index}.ts
src/lib/ai/tools/resume.tool.ts                 (filled in — was an empty placeholder)
src/app/api/ai/resume/route.ts
src/app/(site)/resume-analyzer/page.tsx
src/components/resume/{ResumeUpload,ResumeOverview,ResumeAtsScore,
                        ResumeTechRadar,ResumeSkillGap}.tsx
```

## Files modified

| File | Change |
|---|---|
| `tools/registry.ts` | Registered `resumeTool` in `AI_TOOLS`. |
| `planner/planner-prompt.ts` | Widened the `"resume"` intent's one-line description to also cover uploaded-resume questions. |
| `lib/ai/prompt.ts` | Added one rule so the shared system prompt correctly answers using resume-analysis context instead of defaulting to "not available." |
| `app/api/ai/chat/route.ts` | Added optional `resumeId` passthrough via `resumeRequestContext.run()` — no-op for existing callers. |
| `components/ai/ChatBox.tsx` | Added optional `resumeId`/copy props (all defaulted to the original hardcoded values) so it could be reused on `/resume-analyzer` instead of duplicating a chat UI. |
| `components/layout/Navbar.tsx` | +1 nav link ("Resume Analyzer") for discoverability, matching the pattern used in every prior phase. |

**Untouched, verified via `git diff`:** `graph/state.ts`, `graph/graph.ts`,
`graph/edges.ts`, `graph/tool-node.ts`, `graph/planner-node.ts`,
`graph/generation-node.ts`, `graph/nodes.ts`, `agent/agent.ts`,
`services/conversation.service.ts` (no diff *from this phase* — its
existing diff predates Phase 9), `planner/planner-schema.ts`,
`planner/planner-service.ts`, `chains/portfolio.chain.ts`,
`retrieval.ts`, `tools/executor.ts`, `tools/tool-selector.ts`,
`tools/project.tool.ts`, `tools/blog.tool.ts`, `tools/rag.tool.ts`,
`knowledge/*`, `ingestion/*` (only imported, never edited),
`app/api/admin/knowledge/*`, `components/admin/knowledge/*`.

## Validation

- Manual end-to-end testing: a backend-only smoke test (direct
  `resumeService`/`agent.run()` calls) and a full **browser-driven**
  Playwright test (upload via real drag-and-drop input, screenshots at
  each stage, a real chat question, the download button, and a regression
  check on the main `/ai` page) — both against live OpenAI. The browser
  test is what actually caught the prompt bug described above; scripts and
  temporary dependencies were removed after use, nothing committed.
- `npm install` — no unexpected changes.
- `npm run lint` — 0 errors (1 pre-existing, unrelated `<img>` warning).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds; `/resume-analyzer` (static) and
  `/api/ai/resume` (dynamic) both compile and are listed alongside every
  other route.

## Future: persistent storage

Uploaded resumes currently live only in a process-memory `Map` (2h TTL) —
by design, per this phase's spec ("do not persist uploaded resumes"). A
future phase could add a **new**, separate table (e.g.
`uploaded_resumes` — resumeId, filename, resume JSON, analysis JSON,
uploaded_at, expires_at) without touching `rag_documents`/
`rag_document_chunks`, giving resumes a real TTL-backed lifetime across
server restarts/deploys instead of an in-memory one. `ResumeService`'s
public methods (`analyzeUpload`, `get`) are already the seam where a
database-backed implementation would swap in — callers (the API route,
`resume-tool`) wouldn't need to change.

## Future: recruiter comparison

A recruiter comparing multiple candidates could benefit from a
`compareResumes(resumeIds: string[])` method on `ResumeService` that
runs a single LLM call ranking/comparing the already-computed
`ResumeAnalysisResult`s (career level, ATS score, skill overlap) side by
side, surfaced as a new `/resume-analyzer/compare` view. This only needs
persistent storage (above) to be useful beyond a single browser session,
since comparison implies resumes uploaded independently, possibly hours
apart.

## Future: JD (job description) matching

Today's ATS/skill-gap scoring is generic (against a fixed reference skill
list per category). A natural extension: accept a pasted job description
alongside the resume upload, and have `ResumeAnalyzer` (or a new
`resume-jd-match.ts` in the same package) score fit specifically against
*that* JD's required skills/experience instead of the generic taxonomy —
reusing the same extraction/analysis machinery, with the JD as additional
LLM input.

## Future: multi-agent collaboration

The phase brief was explicit: no multi-agent workflow yet, and this
implementation has exactly one generation step, as required. A future
phase could introduce a small sub-graph (LangGraph natively supports
compiled graphs as nodes) where, after `resume-tool` runs, a
"recruiter-agent" and a "coaching-agent" both analyze the same resume
context in parallel and a final node merges their outputs — e.g. one
optimizing for "would a recruiter shortlist this" phrasing, the other for
"how does this candidate improve." `GraphState.intent` already
distinguishes "resume" from every other intent, which is exactly the
signal such a router would need — no state redesign required to get
there, consistent with how Phase 8 documented this same extension point.
