# Phase 4 — Graph Foundation (Pre-LangGraph)

## Goal

Restructure the Agent's execution flow into an explicit node/edge/state
graph shape — the same shape LangGraph's `StateGraph` uses — without adding
the LangGraph dependency or wiring it in yet. This is scaffolding: it makes
the eventual LangGraph migration a mechanical swap of `graph.ts`'s runner
body, not a redesign.

Nothing existing was removed or rewritten beyond `Agent` itself, which was
refactored (not replaced) to run the new graph instead of orchestrating
steps inline.

## New graph architecture

All new files live in `src/lib/ai/graph/`.

### `state.ts`

Defines the shared vocabulary every node reads and writes.

```ts
interface GraphState {
  userQuestion: string;
  conversationHistory: ChatMessage[];
  selectedTool?: string;
  intent?: AgentIntent;
  retrievedContext?: string;
  toolOutput?: unknown;
  mergedContext?: string;
  finalAnswer?: string;
  sources: AgentSource[];
}
```

The seven fields required by this phase (`userQuestion`,
`conversationHistory`, `selectedTool`, `retrievedContext`, `toolOutput`,
`finalAnswer`, `sources`) are all present. Two fields were added on top of
the minimum, both load-bearing rather than decorative:

- `intent` — the planner already classifies each question into an
  `AgentIntent` (`rag | project | blog | interview | resume |
  certification`), distinct from the tool name. Keeping it in state is what
  lets a future LangGraph conditional edge branch on *intent* rather than
  string-matching a tool name.
- `mergedContext` — keeps "raw retrieved context" (written by the Tool node)
  and "final prompt-ready context" (written by the Prompt Builder node) as
  two distinct values instead of overwriting the same field mid-pipeline.
  Each node's input/output stays unambiguous, which matters once nodes are
  reordered or run conditionally under real LangGraph.

`state.ts` also defines the `GraphNode` contract (`{ name, run(state) }`)
and `NodeName` union, and a `createInitialGraphState()` factory. These live
here (not in `nodes.ts`) specifically to avoid a circular import between
`nodes.ts` and the individual `*-node.ts` files.

### `planner-node.ts`

Wraps the existing `Planner` (`agent/planner.ts`, still the temporary
keyword-based `KeywordPlanner`) as a `GraphNode`. Writes `selectedTool` and
`intent` onto state. Does not touch `agent/planner.ts` itself — the
temporary implementation is reused as-is, exactly as before Phase 4.

### `tool-node.ts`

Wraps the existing tool-execution logic (previously inline in `Agent.run`):
looks the planner's chosen tool up in `AI_TOOLS` (`tools/registry.ts`) and
calls it directly; if the plan names a tool that isn't registered yet
(`interview-tool` / `resume-tool` / `certification-tool`), it falls back to
the existing `executor.execute()` / `ToolSelector` keyword-scoring path —
identical fallback behavior to Phase 3. Writes `selectedTool` (corrected to
whichever tool actually ran), `retrievedContext`, `toolOutput`, and
`sources` onto state, reusing `isRagToolResult` and `sourceBuilder` unchanged.

### `generation-node.ts`

Calls `portfolioChain.invoke(userQuestion, conversationHistory,
mergedContext)` — the only LLM call in the graph — and writes
`finalAnswer`. `PortfolioChain` itself is untouched; its responsibility
stays exactly "retrieval-or-passthrough + prompt execution."

### `nodes.ts`

Two jobs:

1. Defines `promptBuilderNode`, the fourth stage in the required flow
   (`Planner → Tool → Prompt Builder → Generation`). It wasn't given its own
   file in the requirements, so it lives here rather than being folded into
   `generation-node.ts` — this keeps "Prompt Builder" a distinct, testable,
   independently reusable node exactly as the flow diagram specifies, and
   keeps `generation-node.ts` a pure "take a ready prompt, call the LLM"
   node. It wraps the existing `ContextManager.merge()`
   (`agent/context-manager.ts`, untouched) to combine `retrievedContext` +
   `toolOutput` + `conversationHistory` into `mergedContext`.
2. Assembles `GRAPH_NODES: GraphNode[]` in execution order
   (`planner → tool → promptBuilder → generation`) and re-exports the
   individual node objects.

### `edges.ts`

Declares the graph topology as data — `GRAPH_EDGES: { from, to }[]` —
independent of any execution engine:

```
START → planner → tool → promptBuilder → generation → END
```

This list is written in exactly the shape LangGraph's
`graph.addEdge(from, to)` calls take, so migrating means replacing this
array with the equivalent `addEdge` calls, not inventing new topology.

### `graph.ts`

`runGraph(userQuestion, conversationHistory)` is a small hand-rolled
executor that walks `GRAPH_EDGES` from `START` to `END`, looks up each
node by name in `GRAPH_NODES`, and threads `GraphState` through
`node.run(state)` calls sequentially. It is a deliberate stand-in for
`new StateGraph(...).compile().invoke(initialState)` — same inputs, same
outputs, same node objects — so that swapping the implementation later
does not require touching any node or edge file.

## Execution flow

```
START
  ↓
planner-node   (Planner.plan → selectedTool, intent)
  ↓
tool-node      (registry lookup → executor fallback → retrievedContext, toolOutput, sources)
  ↓
promptBuilder  (ContextManager.merge → mergedContext)
  ↓
generation-node (PortfolioChain.invoke → finalAnswer)
  ↓
END
```

`Agent.run()` (`agent/agent.ts`) was refactored to this:

```ts
export class Agent {
  async run(question: string, history: ChatMessage[] = []) {
    const state = await runGraph(question, history);
    return {
      answer: state.finalAnswer ?? "No answer.",
      tool: state.selectedTool ?? "rag-tool",
      intent: state.intent ?? "rag",
      sources: state.sources,
    };
  }
}
```

`Agent` no longer contains any orchestration logic itself — it delegates
entirely to `runGraph` and adapts `GraphState` back into the existing
`AgentResponse` shape. `ConversationService.ask()` is unchanged; it still
just calls `agent.run(question, history)`. The HTTP response shape
(`answer`, `tool`, `intent`, `sources`) returned by `/api/ai/chat` is
identical to Phase 3 — fully backward compatible.

## Migration path to LangGraph

When ready to adopt LangGraph for real:

1. `npm install @langchain/langgraph` (already have `@langchain/core`).
2. Replace `graph.ts`'s body with:
   ```ts
   const graph = new StateGraph<GraphState>({ channels: ... })
     .addNode("planner", plannerNode.run)
     .addNode("tool", toolNode.run)
     .addNode("promptBuilder", promptBuilderNode.run)
     .addNode("generation", generationNode.run)
     .addEdge(START, "planner")
     .addEdge("planner", "tool")
     .addEdge("tool", "promptBuilder")
     .addEdge("promptBuilder", "generation")
     .addEdge("generation", END)
     .compile();

   export const runGraph = (userQuestion, conversationHistory) =>
     graph.invoke(createInitialGraphState(userQuestion, conversationHistory));
   ```
   `GRAPH_EDGES` in `edges.ts` becomes the literal source of truth for the
   `.addEdge(...)` calls above — no topology decisions need to be re-made.
3. Every node file (`planner-node.ts`, `tool-node.ts`, `nodes.ts`'s
   `promptBuilderNode`, `generation-node.ts`) is already an async
   `(state) => Promise<state>` function — LangGraph's exact node signature.
   No node code changes.
4. Replace `KeywordPlanner` (`agent/planner.ts`) with a LangGraph-native
   planner (LLM-based routing, or a sub-graph) that still implements the
   `Planner` interface, or have `planner-node.ts` call a LangGraph node
   directly instead of `planner.plan()`. Either way, only
   `planner-node.ts` and/or `agent/planner.ts` change.
5. Once conditional routing is needed (e.g. skip the Tool node entirely for
   pure greetings), replace the relevant entries in `GRAPH_EDGES` with
   `addConditionalEdges` using `state.intent`, which is already populated.

No other application code needs to change for any of the above —
`ConversationService`, `Agent`'s public method signature, and the API route
all stay the same.

## Future extensibility

- **Conditional routing**: `state.intent` is already available at the edge
  between `planner` and `tool`, ready for `addConditionalEdges` once
  `interview-tool` / `resume-tool` / `certification-tool` exist and
  different questions should skip stages (e.g., a greeting could route
  straight to `generation`, bypassing `tool` and `promptBuilder`).
- **Parallel/multi-tool nodes**: `tool-node.ts` currently calls one tool.
  Because `GraphState.toolOutput` is `unknown` and `sources`/
  `retrievedContext` are simple scalars, extending `tool-node.ts` (or
  adding a second tool node with a fan-out/fan-in edge pair) to call
  multiple tools and merge their outputs before `promptBuilder` requires no
  state shape changes.
- **New tools**: once `interview-tool`, `resume-tool`, and
  `certification-tool` are implemented and added to `AI_TOOLS`
  (`tools/registry.ts`), `tool-node.ts` needs no changes — it already looks
  tools up by name from that registry.
- **Retries / error edges**: `graph.ts`'s `resolveExecutionOrder()` throws
  on a missing edge today; a LangGraph version can add explicit error
  edges or a `retry` node between `tool` and `promptBuilder` without
  touching `planner-node.ts` or `generation-node.ts`.
- **Streaming**: `generation-node.ts` is the single seam for switching
  `portfolioChain.invoke()` to a streaming call later, since it is the only
  node that talks to the LLM.

## Files added

- `src/lib/ai/graph/state.ts`
- `src/lib/ai/graph/planner-node.ts`
- `src/lib/ai/graph/tool-node.ts`
- `src/lib/ai/graph/generation-node.ts`
- `src/lib/ai/graph/nodes.ts`
- `src/lib/ai/graph/edges.ts`
- `src/lib/ai/graph/graph.ts`

## Files modified

- `src/lib/ai/agent/agent.ts` — refactored to delegate to `runGraph()` instead of orchestrating planner/tool/context/generation steps inline. Public API (`Agent.run(question, history) => Promise<AgentResponse>`) is unchanged.

No other files were touched. `ConversationService`, `PortfolioChain`, the
Knowledge Layer, the Tool Layer, `agent/planner.ts`, `agent/context-manager.ts`,
`agent/agent-response.ts`, all UI components, all API routes, and the
database are untouched.

## Verification

- `npm run lint` — 0 errors (1 pre-existing, unrelated `<img>` warning in `blog/[slug]/page.tsx`).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds (exit code 0); all routes, including `/api/ai/chat`, compiled successfully.
