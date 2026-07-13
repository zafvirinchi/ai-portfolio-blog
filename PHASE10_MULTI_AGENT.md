# Phase 10 — Enterprise Multi-Agent Workflow

## Goal

Introduce specialized AI agents that collaborate *only when necessary*,
without redesigning the existing architecture. Every public entry point —
`ConversationService.ask()`, `Agent.run()`, `GraphState`, the LangGraph
topology, the Planner contract, the Tool Registry, the Knowledge Pipeline,
the Resume Analyzer — is used exactly as it was before this phase.

## Architecture — before

```
ConversationService → Agent → LangGraph → Planner → Tool → PromptBuilder → Generation → PortfolioChain
```

`generation-node.ts` called `portfolioChain.invoke()` directly with
whatever `promptBuilderNode` had already merged.

## Architecture — after

```
ConversationService → Agent → LangGraph → Planner → Tool → PromptBuilder → Generation → PortfolioChain
                                                                                │
                                                                                │ (inside the same node)
                                                                                ▼
                                                                     MultiAgentCoordinator.run()
                                                                                │
                                                            ┌───────────────────┴───────────────────┐
                                                            ▼                                        ▼
                                                     Research Agent                          Reviewer Agent
                                                     (parallel, each optional)                (parallel, each optional)
                                                            └───────────────────┬───────────────────┘
                                                                                ▼
                                                                       Summarizer Agent (optional)
                                                                                │
                                                                                ▼
                                                                          mergedContext
                                                                                │
                                                                                ▼
                                                                    PortfolioChain.invoke()  ← still the ONLY
                                                                                                answer-generation step
```

**The LangGraph topology is byte-for-byte unchanged**:
`planner → tool → promptBuilder → generation`, same conditional edge, same
four node names. `graph.ts`, `edges.ts`, `nodes.ts`, `tool-node.ts`,
`planner-node.ts`, and `state.ts` were not opened for editing in this
phase (verified — see "Files modified" below). The only line that changed
inside the graph is *what `generation-node.ts` does before it calls
`portfolioChain.invoke()`*.

## Why the coordinator lives inside `generation-node.ts`, not as a new LangGraph node

The brief was explicit about this, and it's worth stating the reasoning
plainly:

1. **A new node changes topology; a function call doesn't.** Adding
   `researchNode`/`reviewerNode`/`summarizerNode` would mean new
   `addNode()`/`addEdge()`/`addConditionalEdges()` calls in `graph.ts` —
   exactly the "additional graph topology" the brief says not to create.
   Calling `multiAgentCoordinator.run()` from inside the existing
   `generation` node's function body is topology-invisible to LangGraph:
   the compiled graph still has exactly four nodes and one conditional
   edge, identical to Phase 8.
2. **`GraphState` doesn't need new channels.** Every input the coordinator
   needs — `userQuestion`, `conversationHistory`, `retrievedContext`,
   `toolOutput`, `intent` — already exists on `GraphState`. Making the
   coordinator a LangGraph node would require new channels to carry its
   output (`agentsUsed`, `metadata`) between nodes; keeping it as a plain
   function call inside `generation-node.ts` means that output never needs
   to cross a channel boundary at all — it's consumed and discarded (after
   logging) in the same function scope. This is *why* `state.ts` needed
   zero changes this phase, confirmed by file timestamps showing only
   `generation-node.ts` was modified.
3. **Multi-agent orchestration is an internal implementation detail of
   "how do we build good context," not a new decision point in the
   conversation flow.** The planner already decided intent/tool; the tool
   already retrieved context. What the coordinator adds is *quality
   control on that context* before the one real answer-generation call —
   conceptually a refinement step inside generation, not a new stage of
   the pipeline a reader of the graph diagram needs to know about.
4. **It keeps the "exactly one LLM answer" guarantee mechanically true.**
   Every specialist agent explicitly returns structured *analysis*, never
   a user-facing answer (enforced by giving each one its own prompt that
   never resembles `PortfolioChain`'s). Because they're plain async
   function calls awaited inside one node rather than graph nodes with
   their own edges to `END`, there's no code path by which a specialist's
   output could accidentally become the response.

## Coordinator decision logic — "collaborate only when necessary"

`multi-agent/coordinator.ts`'s `decidePlan()` runs first and produces a
`CoordinatorPlan` before any specialist agent is invoked, so unnecessary
LLM calls are never made:

| Condition | Effect | Why |
|---|---|---|
| Question ≤ 30 chars **and** no retrieved context **and** no tool output | Skip all three specialists | Reads as a greeting/small-talk turn — nothing to research, review, or merge. |
| `intent === "resume"` | Skip all three specialists | `resume-tool`'s context (Phase 9) is already complete, self-contained candidate data — not retrieved knowledge-base content prone to hallucination. Bypassing entirely also guarantees the tuned "answer about this candidate" directive (see PHASE9 docs — a hard-won fix) reaches `PortfolioChain` completely unmodified, rather than risking dilution by a merge pass. |
| Context < 200 chars | Skip Research | Too little retrieved content for a research pass to find anything meaningful to flag. |
| Context ≥ 1200 chars | Skip Reviewer | Long, detailed context already reads as low hallucination-risk — this is the "if review confidence high, skip reviewer" rule, implemented as a cheap pre-check that predicts the reviewer's own likely verdict rather than spending a call to confirm it. |
| Neither Research nor Reviewer ran | Skip Summarizer | Nothing to merge — pass the raw context straight through unchanged. |
| Research and/or Reviewer ran | Run Summarizer | Its whole job is merging their findings with the retrieved context into one clean block. |

Research and Reviewer, when both run, execute **in parallel**
(`Promise.all`) — matching the architecture diagram's two simultaneous
branches feeding into one Summarizer.

Every specialist call is wrapped in try/catch (`safeRunResearch`,
`safeRunReview`, `safeRunSummary`): a failed specialist degrades to "skip
it, use the raw context" rather than breaking the chat, matching the same
graceful-degradation philosophy already used by `PlannerService` (Phase 5)
and `runGraph()`'s own error handling (Phase 8).

## Agent responsibilities

### Research Agent (`research-agent.ts`)

Reads the question + retrieved context. Returns (never answers):
- `missingInformation` — facts the question needs that the context lacks.
- `inconsistencies` — internal contradictions in the context.
- `unsupportedClaims` — statements without specifics backing them.
- `suggestedEvidence` — what would strengthen the context.

### Reviewer Agent (`reviewer-agent.ts`)

Reviews the draft context. Returns a review only, never rewrites:
- `hallucinationRisk` — `"low" | "medium" | "high"`.
- `contradictions`, `missingReferences`.
- `confidence` — 0–1.
- `qualityNotes`.

### Summarizer Agent (`summarizer-agent.ts`)

Merges research output + review output + retrieved context + the
question into one clean `mergedContext` string for `PortfolioChain`. Never
answers directly. Its prompt explicitly instructs it to preserve every
fact from the original context and, notably, to **preserve any special
answering directive found in the context verbatim** — a defense-in-depth
safeguard for the resume-analysis case (which primarily bypasses the
summarizer entirely per the table above, but this rule protects the same
invariant in any other case where a tool's context carries a directive).

Each agent has its own independent system prompt in `agent-prompts.ts` —
none of them import or reuse `lib/ai/prompt.ts` (`PortfolioChain`'s
prompt), per the brief.

## Coordinator interface

```ts
multiAgentCoordinator.run(
  question: string,
  history: ChatMessage[],
  retrievedContext: string,
  toolOutput: unknown,
  intent?: AgentIntent
): Promise<{
  mergedContext: string;
  metadata: { plan: CoordinatorPlan; totalMs: number };
  agentsUsed: ("research" | "reviewer" | "summarizer")[];
}>
```

`generation-node.ts` calls this with the same `retrievedContext`/
`toolOutput` fields `promptBuilderNode` already merges via
`ContextManager` — the coordinator now owns that merging step itself
(building an equivalent raw merge internally, then optionally enriching
it), so `state.mergedContext` is no longer read in `generation-node.ts`.
`promptBuilderNode` still runs unchanged as part of the fixed topology;
its output is simply superseded by the coordinator's own merge for this
one node's purposes.

## Sequence diagram

```
Agent.run()                Graph (unchanged)              generation-node.ts        MultiAgentCoordinator      Research/Reviewer/Summarizer   PortfolioChain
    │                            │                                │                          │                          │                        │
    │  runGraph(q, history)      │                                │                          │                          │                        │
    │───────────────────────────►│                                │                          │                          │                        │
    │                            │ planner → tool → promptBuilder  │                          │                          │                        │
    │                            │──────────────────────────────► generation node runs        │                          │                        │
    │                            │                                │  coordinator.run(q, history,                        │                          │                        │
    │                            │                                │    retrievedContext, toolOutput, intent)             │                          │                        │
    │                            │                                │─────────────────────────►│                          │                          │
    │                            │                                │                          │ decidePlan()             │                          │
    │                            │                                │                          │──► "[multi-agent] Coordinator started"                │
    │                            │                                │                          │                          │                          │
    │                            │                                │                          │  (if plan says so)       │                          │
    │                            │                                │                          │  Promise.all([research, review])                     │
    │                            │                                │                          │─────────────────────────►│                          │
    │                            │                                │                          │◄─────────────────────────│ "Research complete" /     │
    │                            │                                │                          │                          │  "Review complete"        │
    │                            │                                │                          │  (if either ran) summarizer.run()                    │
    │                            │                                │                          │─────────────────────────►│                          │
    │                            │                                │                          │◄─────────────────────────│ "Summarization complete"  │
    │                            │                                │                          │──► "[multi-agent] Coordinator finished"               │
    │                            │                                │◄─────────────────────────│                          │                          │
    │                            │                                │  { mergedContext }        │                          │                          │
    │                            │                                │────────────────────────────────────────────────────────────────────────────────►│
    │                            │                                │                          │                          │      portfolioChain.invoke()
    │                            │                                │◄────────────────────────────────────────────────────────────────────────────────│
    │                            │                                │  { answer }  ← the ONE user-facing generation call   │                          │
    │                            │◄───────────────────────────────│ "[ai-graph] Generation completed"                    │                          │
    │◄───────────────────────────│ "[ai-graph] Graph finished"    │                          │                          │                          │
    │  AgentResponse (unchanged shape: answer, tool, intent, sources)                         │                          │                          │
```

## New package: `src/lib/ai/multi-agent/`

| File | Contents |
|---|---|
| `agent-types.ts` | `CoordinatorInput`, `CoordinatorPlan`, `CoordinatorMetadata`, `CoordinatorResult`, `SpecialistAgentName`. |
| `agent-response.ts` | Zod schemas + hand-mirrored strict JSON schemas for each specialist's structured output (same split pattern as `planner/planner-schema.ts` and `resume/resume-schema.ts`, for the same reason — OpenAI strict mode only supports a JSON Schema subset). |
| `agent-prompts.ts` | Independent system + user message builders for Research/Reviewer/Summarizer — never touches `lib/ai/prompt.ts`. |
| `research-agent.ts` | `ResearchAgent` — gpt-4o-mini, temperature 0, structured output. |
| `reviewer-agent.ts` | `ReviewerAgent` — gpt-4o-mini, temperature 0, structured output. |
| `summarizer-agent.ts` | `SummarizerAgent` — gpt-4o-mini, temperature 0, structured output. |
| `coordinator.ts` | `MultiAgentCoordinator` — decision logic, parallel execution, graceful degradation, logging. |
| `index.ts` | Barrel re-exporting all of the above. |

All three specialist agents reuse the existing shared `openai` client
(`lib/ai/openai.ts`) — no new OpenAI client instantiated.

## Logging

`[multi-agent]` lines (in `coordinator.ts`, exactly the five requested,
no verbose per-field dumps):

- `Coordinator started` — `{ intent }`
- `Research complete`
- `Review complete`
- `Summarization complete`
- `Coordinator finished` — `{ agentsUsed, ... }`

The existing `[ai-graph]` lines (Phase 8: Graph started, Planner selected,
Tool executed, Generation completed, Graph finished) are unchanged and
still bracket the whole request as before.

## Files modified

**Exactly the files the brief allowed, nothing else:**

| File | Change |
|---|---|
| `graph/generation-node.ts` | Calls `multiAgentCoordinator.run()` before `portfolioChain.invoke()`, passing its `mergedContext` result through. |
| `graph/state.ts` | **Not modified.** Every input the coordinator needs already existed on `GraphState`; no additive metadata field was needed (see reasoning above). |
| `multi-agent/index.ts` | New barrel export (this is itself one of the "only" files listed). |

Verified via file-modification timestamps that `graph/state.ts`,
`graph/edges.ts`, `graph/graph.ts`, `graph/nodes.ts`,
`graph/planner-node.ts`, `graph/tool-node.ts` all predate this phase.

**Confirmed untouched:** `ConversationService.ask()`, `Agent.run()`
(signature and body), `PlannerService` and `planner-prompt.ts`,
`tools/registry.ts` and every `*.tool.ts`, `PortfolioChain`
(`chains/portfolio.chain.ts`), `lib/ai/prompt.ts`, `retrieval.ts`, the
Knowledge Pipeline (`ingestion/*`), the Knowledge Manager
(`api/admin/knowledge/*`, `components/admin/knowledge/*`), the Resume
Analyzer (`resume/*`, `tools/resume.tool.ts`, `api/ai/resume/*`,
`components/resume/*`, `app/(site)/resume-analyzer/*`), and every UI
component. No database schema, migration, or table was touched.

## Validation

- Manual smoke testing (temporary scripts, deleted after use, not
  committed) against live OpenAI, covering:
  - A greeting → confirmed `agentsUsed: []`.
  - A moderate-length synthetic context (200–1199 chars) → confirmed
    `agentsUsed: ["research", "reviewer", "summarizer"]`, ran in the
    expected order, and the merged context preserved every original fact
    while adding research findings.
  - A long synthetic context (≥1200 chars) → confirmed reviewer was
    skipped while research + summarizer still ran.
  - `AgentResponse`'s shape (`{answer, tool, intent, sources}`) diffed
    key-for-key against its pre-Phase-10 shape — unchanged.
  - `ConversationService.ask()` called with its original two-argument
    signature — unchanged behavior.
  - **Phase 9 regression check**: uploaded a resume, asked
    "What is my ATS score and what skills am I missing?" through the full
    graph with the resume context active — confirmed `agentsUsed: []`
    (full bypass, as designed) and confirmed the answer still correctly
    cites the real ATS score from the uploaded resume, with an explicit
    assertion that the old "not available in the knowledge base" failure
    mode (the bug fixed in Phase 9) has not resurfaced.
- `npm run lint` — 0 errors (1 pre-existing, unrelated `<img>` warning).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds; every route compiles, including
  `/api/ai/chat`, `/api/ai/resume`, and `/resume-analyzer`.

## Future extension

- **Confidence-driven retry.** If the Reviewer runs and reports
  `hallucinationRisk: "high"` or low `confidence`, the coordinator could
  loop back into Research once more before summarizing, instead of the
  current single-pass design — `CoordinatorPlan` already has room for a
  `retryCount`-style field without changing its external interface.
- **More specialist agents.** The same pattern (own prompt, own
  structured output, coordinator decides whether to invoke it) extends
  cleanly to e.g. a "tone agent" (matches the site's voice) or a
  "compliance agent" (flags anything that shouldn't be said about a
  candidate) without touching the graph topology, exactly as this phase
  added three.
- **Per-intent specialist tuning.** Today's skip thresholds
  (`SHORT_CONTEXT_CHARS`, `HIGH_CONFIDENCE_CONTEXT_CHARS`) are global. A
  future pass could tune them per `intent` (e.g. `project`/`blog`
  questions might warrant a lower research threshold than generic `rag`
  questions) using the same `intent` parameter the coordinator already
  receives.
- **Metadata surfaced to the UI.** `CoordinatorResult.metadata`/
  `agentsUsed` are currently logged and discarded. A future, deliberately
  *opt-in* API/UI change could surface "this answer was reviewed for
  hallucination risk" as a trust signal — but that would be a genuine
  public-API change, out of scope for this phase's "everything backward
  compatible" constraint.
