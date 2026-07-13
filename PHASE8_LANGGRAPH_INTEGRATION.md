# Phase 8 — LangGraph Integration

## Goal

Replace the hand-rolled graph executor (`runGraph()`'s custom edge-walking
loop) with a real `@langchain/langgraph` `StateGraph`, while keeping the
existing architecture, `GraphState` shape, and every public API
(`Agent.run()`, `ConversationService.ask()`, `/api/ai/chat`) byte-for-byte
unchanged. This is an execution-engine swap, not a redesign.

## Files added

- None. `@langchain/langgraph` was added to `package.json` (a dependency,
  not a source file). No new files were created under `src/`.

## Files modified

| File | Change |
|---|---|
| `src/lib/ai/graph/graph.ts` | Full rewrite: `runGraph()` now builds, compiles, and invokes a LangGraph `StateGraph` instead of walking a hand-rolled `GRAPH_EDGES` array in a `while` loop. Same exported function name/signature. |
| `src/lib/ai/graph/edges.ts` | Added `routeAfterPlanner()`, the conditional-edge router function, and trimmed `GRAPH_EDGES` down to just the static (unconditional) backbone edges (the `planner -> tool` edge is now conditional, so it moved out of the static list). `GRAPH_START`/`GRAPH_END`/`GraphNodeId`/`GraphEdge` are untouched. |
| `package.json` / `package-lock.json` | Added `@langchain/langgraph` (`^1.4.7`), matching the already-installed `@langchain/core@^1.2.1` / `@langchain/openai@^1.5.3` major version line. No other dependency changed. |

**Untouched, exactly as required:**
- `src/lib/ai/graph/state.ts` — `GraphState`, `NodeName`, `GraphNode`,
  `createInitialGraphState()` — not one field added, renamed, or removed.
- `src/lib/ai/graph/planner-node.ts`, `tool-node.ts`, `generation-node.ts`,
  `nodes.ts` (`promptBuilderNode` + `GRAPH_NODES`) — same node logic,
  same imports, same behavior. LangGraph calls `node.run(state)` on the
  exact same `GraphNode` objects these files already exported.
- `src/lib/ai/agent/agent.ts` (`Agent.run()`) — zero-diff.
- `src/lib/ai/services/conversation.service.ts` (`ConversationService.ask()`)
  — zero-diff *from this phase* (it already delegated to `agent.run()` from
  earlier work; nothing in Phase 8 touched it).
- `src/app/api/ai/chat/route.ts` — zero-diff.
- `src/lib/ai/tools/*` (Tool Registry, Tool Executor, Tool Selector),
  `src/lib/ai/knowledge/*` (Knowledge Layer), `src/lib/ai/planner/*`
  (Planner Service), `src/lib/ai/chains/portfolio.chain.ts`
  (`PortfolioChain`), `src/lib/ai/retrieval.ts` (Retriever),
  `src/lib/ai/ingestion/*` (Knowledge Pipeline),
  `src/app/api/admin/knowledge/*` + `src/components/admin/knowledge/*`
  (Knowledge Manager) — none of these were opened for editing; verified via
  `git status`/`git diff` after implementation that none show a diff.

## Architecture — before

```
ConversationService.ask()
        |
        v
Agent.run()
        |
        v
runGraph()  <-- hand-rolled: reads GRAPH_EDGES, walks a while-loop from
        |       "__start__" to "__end__", calling node.run(state) and
        |       reassigning `state` each step. No branching capability.
        v
plannerNode -> toolNode -> promptBuilderNode -> generationNode
        |
        v
PortfolioChain.invoke()  (single LLM call)
        |
        v
Retriever (searchRagContext)
```

The old `graph.ts` was always linear — every question, regardless of
intent, walked the exact same 4 nodes in the exact same order. The file's
own comment called it a "Stand-in for `StateGraph.compile().invoke(...)`",
anticipating this phase.

## Architecture — after

```
ConversationService.ask()          <- unchanged
        |
        v
Agent.run()                        <- unchanged
        |
        v
runGraph()                         <- same name/signature, new body:
        |                             builds a StateGraph once at module
        |                             load, compiles it, and calls
        |                             compiledGraph.invoke(initialState)
        v
compiledGraph (LangGraph StateGraph)
        |
        v
planner --(routeAfterPlanner)--> tool | promptBuilder --> generation
        |
        v
PortfolioChain.invoke()  (still the single, only LLM answer-generation step)
        |
        v
Retriever (searchRagContext)       <- unchanged
```

Everything below `runGraph()` — the node implementations, the tool layer,
the knowledge layer, the planner service, `PortfolioChain`, the retriever —
is identical. Only the thing that *drives* those nodes changed.

## StateGraph diagram

```
                    ┌─────────┐
                    │  START  │
                    └────┬────┘
                         │
                         v
                   ┌───────────┐
                   │  planner  │  plannerService.plan(question, history)
                   └─────┬─────┘
                         │
                 routeAfterPlanner(state)
                         │
            ┌────────────┴────────────┐
            │ (tool-needing intents)   │ (no-tool intents — see below)
            v                          │
      ┌──────────┐                     │
      │   tool   │  AI_TOOLS / Tool    │
      │          │  Executor / RAG     │
      └────┬─────┘  Knowledge Layer    │
           │                           │
           └─────────────┬─────────────┘
                          v
                 ┌────────────────┐
                 │  promptBuilder  │  ContextManager.merge()
                 └────────┬────────┘
                          │
                          v
                  ┌──────────────┐
                  │  generation  │  PortfolioChain.invoke() — ONE LLM call
                  └──────┬───────┘
                         │
                         v
                    ┌─────────┐
                    │   END   │
                    └─────────┘
```

State is defined via `Annotation.Root({...})` in `graph.ts`, mirroring
`GraphState` field-for-field (see "State channels" below) — it is a
wrapper around the existing interface, not a new state shape.

## Conditional routing diagram

```
state.intent  after planner runs
     │
     ├── "greeting"  ──────────────────────► promptBuilder  (tool skipped)
     │
     ├── "rag"            ─┐
     ├── "project"          │
     ├── "blog"             ├─────────────► tool ─► promptBuilder
     ├── "interview"        │
     ├── "resume"           │
     └── "certification"  ─┘
```

`routeAfterPlanner()` (in `edges.ts`) is the router function:

```ts
export function routeAfterPlanner(state: GraphState): PlannerRoute {
  if (state.intent && NO_TOOL_INTENTS.has(state.intent)) {
    return "promptBuilder";
  }
  return "tool";
}
```

**Important honesty note:** `PlannerService` (untouched — see
`PHASE5_LLM_PLANNER.md`) only ever emits one of `rag | project | blog |
interview | resume | certification` (`PLANNER_INTENTS` in
`planner-schema.ts`). It maps greetings and other ambiguous input to a
low-confidence `"rag"` intent, not a distinct `"greeting"` intent. So in
today's system, every real request currently takes the `tool` branch —
the "skip tool" branch is wired and reachable (`routeAfterPlanner` checks
generically against a `NO_TOOL_INTENTS` set, not hardcoded per-call), but
has no live producer yet. This was a deliberate choice: the task's spec
explicitly calls for a "Greeting → skip tool" conditional example, and
implementing the branch now means adding a real `"greeting"` intent later
(see "Future" below) requires **zero graph changes** — only a
`PlannerService` change, which this phase was explicitly told not to make.

Whichever branch runs, both paths reconverge at `promptBuilder`, so there
is still exactly **one** `generation` node and one `PortfolioChain.invoke()`
call per request — the "no-tool" path doesn't skip generation, it only
skips the tool call in front of it. `ContextManager.merge()` (unchanged)
already handles an empty `retrievedContext`/`toolOutput` safely (it just
produces an empty context string), so this required no changes there
either.

## Node descriptions

| Node | Implementation (unchanged) | What it does |
|---|---|---|
| `planner` | `plannerNode` (`planner-node.ts`) | Calls `plannerService.plan(question, history)`. Sets `state.intent` / `state.selectedTool`. |
| `tool` | `toolNode` (`tool-node.ts`) | Looks up `state.selectedTool` in `AI_TOOLS`, falling back to `ToolExecutor`/`ToolSelector` (keyword matching) if not registered — exactly as before. Sets `retrievedContext`, `toolOutput`, `sources`. |
| `promptBuilder` | `promptBuilderNode` (`nodes.ts`) | Calls `contextManager.merge()` to combine `retrievedContext`/`toolOutput`/history into `state.mergedContext`. |
| `generation` | `generationNode` (`generation-node.ts`) | Calls `portfolioChain.invoke(question, history, mergedContext)` — the single LLM call — and sets `state.finalAnswer`. |

`graph.ts` wraps three of the four nodes (`planner`, `tool`, `generation`)
in a thin logging shim before registering them with `.addNode()`; the
wrapped function still just calls `node.run(state)` and returns its result
unmodified — no node logic changed.

### State channels

`GraphStateAnnotation` in `graph.ts` declares one `Annotation<T>()` channel
per `GraphState` field, with no custom reducers. Every node in this graph
always returns a *complete* state object (each existing node does
`return { ...state, someField: value }`), so a plain "last write wins"
channel (LangGraph's default `LastValue`) is the correct and sufficient
reducer for all nine fields — nothing in this graph ever needs to merge
concurrent partial writes to the same key.

One deliberate implementation detail: bare `Annotation<T>()` (not the
`{ reducer, default }` object form) was used for every field, including
`toolOutput`. `toolNode` legitimately writes `toolOutput: undefined` on
the RAG path (`isRag ? undefined : payload`) to represent "no non-RAG tool
output this turn" — LangGraph's `LastValue` channel tolerates an explicit
`undefined` write/read correctly (it tracks *whether* a value was written,
not *whether the written value is undefined*), whereas the reducer-based
channel type does not (an `undefined` write there permanently blanks the
channel and the next read throws). Using bare channels uniformly avoided
this trap without needing to touch `tool-node.ts` or `context-manager.ts`
to change their `undefined`-based "no value" convention.

## Error handling

`runGraph()` wraps `compiledGraph.invoke(...)` in try/catch. If any node
throws (verified with a forced-failure test — see "Tests" below, which
made `generationNode`'s `PortfolioChain.invoke()` call fail with an invalid
API key), the error is logged and `runGraph()` returns a `GraphState` with
a graceful `finalAnswer` ("Sorry, something went wrong while processing
your question...") instead of letting the exception propagate. `Agent.run()`
was already written to defensively read `state.finalAnswer ?? "No answer."`
etc., so it required no changes to handle this gracefully too — the chat
never crashes, it degrades to an apologetic answer with empty sources.

This is a separate, deeper safety net from `PlannerService`'s own internal
LLM-failure fallback (Phase 5, unchanged) — a planner LLM failure never
even reaches this catch block, since `PlannerService.plan()` already falls
back to the keyword planner internally and never throws.

## Logging

Five lightweight `console.log`/`console.error` lines, all prefixed
`[ai-graph]`, added only in `graph.ts`:

1. `Graph started` — question preview, logged at the top of `runGraph()`.
2. `Planner selected` — `{ intent, tool }`, logged right after the planner
   node runs.
3. `Tool executed` — `{ tool }`, logged right after the tool node runs
   (only appears when the tool branch is taken).
4. `Generation completed` — logged right after the generation node runs.
5. `Graph finished` — `{ intent, tool }`, logged after `.invoke()` resolves.

Plus one `Graph node failed` error log in the catch block. No per-node
internals, no state dumps, no verbose tracing.

## Tests performed

All run manually against the live Supabase/OpenAI project (temporary
scripts, deleted after use — not committed):

| Case | Result |
|---|---|
| Greeting ("Hi there, how are you?") | `intent: rag`, `tool: rag-tool`, non-empty answer, all 5 log lines present in order. |
| Project question | `intent: project`, `tool: project-tool`, routed through `tool` node. |
| Certification question | `intent: certification` correctly selected by the planner; falls back to `project-tool` at execution the same way it did before this phase (`certification-tool` isn't registered in `AI_TOOLS` — pre-existing, unrelated to this phase; see "Pre-existing observations" below). |
| Blog question | `intent: blog`, `tool: blog-tool`. |
| Unknown/gibberish question | Planner fell back to `intent: rag`, `tool: rag-tool`; answered gracefully instead of erroring. |
| Multi-turn conversation | Passed 2 prior turns as `history`; planner correctly used them for intent classification. |
| Forced node failure | Set an invalid `OPENAI_API_KEY` for one run; `generationNode`'s `PortfolioChain.invoke()` threw; `runGraph()` caught it and returned the graceful fallback answer — chat did not crash. |
| Knowledge upload | `POST /api/admin/knowledge` (Phase 7, untouched) — uploaded a test document, got back `success: true` with chunk/embedding counts. |
| Knowledge search | `GET /api/admin/knowledge?search=...` (Phase 7, untouched) — found the just-uploaded document by a unique marker string. |
| Chat (`ConversationService.ask()`) | Full round trip, same code path `/api/ai/chat` uses. |

### Pre-existing observations (not caused by, or fixed in, this phase)

- `searchRagContext()` (`retrieval.ts`, untouched) currently logs `Could not
  choose the best candidate function between: public.match_rag_chunks(...)`
  — the live Supabase project has multiple overloads of the
  `match_rag_chunks` RPC function, and PostgREST can't disambiguate the
  call `retrieval.ts` makes. This is caught by `retrieval.ts`'s own
  existing try/catch (returns `[]`), so it degrades gracefully today
  exactly as it did before this phase — the old hand-rolled `runGraph()`
  hits the exact same code path and would show the same log line. Flagging
  it here for visibility since it surfaced during testing, not fixing it,
  since "Do not modify... Retriever" was an explicit instruction for this
  phase.
- `certification-tool`/`interview-tool`/`resume-tool` are valid
  `PLANNER_TOOLS` the planner can select, but `AI_TOOLS`
  (`tools/registry.ts`, untouched) only registers `project-tool`,
  `blog-tool`, `rag-tool`. `toolNode`'s existing fallback
  (`ToolExecutor`/`ToolSelector`, untouched) picks the best keyword match
  among the *registered* tools when the planner's chosen tool isn't found —
  this is pre-existing behavior, unrelated to the graph engine, and out of
  this phase's scope ("Do not modify... Tool Registry").

## Validation

- `npm install` — no changes beyond the intentional `@langchain/langgraph`
  addition.
- `npm run lint` — 0 errors (1 pre-existing, unrelated `<img>` warning,
  unchanged since Phase 5).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds (exit code 0); every route, including
  `/api/ai/chat` and `/admin/knowledge`, compiled successfully.

## Future: multi-agent expansion

The current graph is single-agent (one planner, one tool call, one
generation call). A future multi-agent version could add a `subAgent`
node type — e.g. a dedicated "resume specialist" or "interview coach"
sub-graph — and have `routeAfterPlanner` (or a new router after `tool`)
dispatch to one of several specialized generation nodes instead of the
single shared `generationNode`, using LangGraph's native subgraph support
(`StateGraph` nodes can themselves be compiled graphs). `GraphState`
already carries `intent`, which is exactly the signal such a router would
need — no state redesign required to get there.

## Future: parallel execution

Some intents could plausibly benefit from calling more than one tool
concurrently (e.g. a broad "tell me about yourself" question pulling from
`project-tool`, `blog-tool`, and `rag-tool` at once, then merging results).
LangGraph supports fan-out/fan-in natively via multiple nodes sharing a
common downstream edge target with an array-accumulating reducer (unlike
the current fields, this **would** need a real reducer, e.g. concatenating
`sources` arrays from multiple tool nodes instead of overwriting). This is
a natural extension of `toolNode` into `toolNodeA`/`toolNodeB` running in
parallel branches that both feed into `promptBuilder`.

## Future: retry nodes

`StateGraph.addNode()` and `setNodeDefaults()` in the installed LangGraph
version already expose a `retryPolicy` option (max attempts, backoff) and a
per-node or graph-wide `errorHandler` — right now `runGraph()`'s top-level
try/catch is the only resilience layer (deliberately kept simple per this
phase's "keep routing simple" instruction). A future phase could attach a
`retryPolicy` to the `generation` node specifically (the one node with no
internal fallback today, unlike the planner) so a transient OpenAI timeout
gets retried a couple of times before falling through to the graceful
error path, rather than degrading to the apology message on the first
failure.

## Future: human-approval nodes

LangGraph's `interrupt()` primitive (exported from the installed package,
see `index.d.ts`) supports pausing a compiled graph mid-run for
human-in-the-loop review — e.g. a future admin-review step before an AI
answer citing sensitive resume/certification data is returned, or an
approval gate before a knowledge-ingestion pipeline result gets surfaced.
This would slot in as an additional node between `generation` and `END`
(or between `tool` and `promptBuilder`), using a checkpointer
(`BaseCheckpointSaver`, also already exported by the installed package) to
persist state across the pause. Nothing in the current graph needs to
change to make room for this later; it's purely additive.
