# Phase 3 — Enterprise AI Agent Foundation

## Goal

Introduce an `Agent` orchestration layer above the existing tool/knowledge
architecture without removing, rewriting, or reworking anything that already
worked: `ConversationService`, `PortfolioChain`, the Knowledge Layer, and the
Tool Layer are all still in place, doing the same jobs they did before.

## Files added

All new files live in `src/lib/ai/agent/`.

### `src/lib/ai/agent/agent.ts`

`Agent.run(question, history)` is the single orchestration entry point:

1. Asks `planner.plan(question)` for an `AgentPlan` (an intent + a target tool name).
2. Looks the planned tool up directly in the existing `AI_TOOLS` registry
   (`../tools/registry`) and calls it. If the plan names a tool that isn't
   registered yet (`interview-tool`, `resume-tool`, `certification-tool` —
   see "Known gaps" below), it falls back to the existing `executor.execute()`
   / `toolSelector` keyword-scoring path, so behavior for unimplemented tools
   is identical to what it was before this change.
3. Extracts retrieved RAG context and source citations from the tool result
   using the existing `isRagToolResult` guard and `sourceBuilder`
   (both untouched).
4. Hands conversation history, retrieved context, and raw tool output to
   `contextManager.merge()` to produce one `MergedContext`.
5. Calls `portfolioChain.invoke(question, history, contextText)` — this is
   the only place an LLM call happens. `PortfolioChain` itself was not
   rewritten; it already accepted an optional pre-built `context` argument
   from the previous phase, which the Agent now uses.
6. Formats the final `AgentResponse` (`answer`, `tool`, `intent`, `sources`).

### `src/lib/ai/agent/planner.ts`

Decides which capability a question needs: `rag`, `project`, `blog`,
`interview`, `resume`, or `certification`.

- Exposes a narrow `Planner` interface (`plan(question): Promise<AgentPlan> | AgentPlan`).
- `KeywordPlanner` is the current implementation: metadata/keyword scoring
  per intent, reusing the existing `containsKeyword` helper from
  `knowledge/utils.ts`. Mirrors the priority values already used by
  `project.tool.ts` / `blog.tool.ts` / `rag.tool.ts` so routing behavior for
  those three categories is unchanged.
- Defaults to `rag` with `confidence: 0` when nothing matches, exactly like
  the existing `ToolSelector` fallback.
- **Extension point:** because callers only depend on the `Planner`
  interface and `planner.plan()`, a LangGraph-based planner (multi-step,
  tool-calling, or LLM-driven routing) can be dropped in later by swapping
  the `planner` export — no changes needed in `agent.ts` or anywhere else.

### `src/lib/ai/agent/agent-response.ts`

Strongly typed contracts for the agent layer:

- `AgentIntent` — union of the six supported intents.
- `AgentPlan` — what the planner returns (`intent`, `tool`, `confidence`, `reason`).
- `AgentSource` — citation shape returned to the client (`id`, `documentId`, `similarity`).
- `AgentResponse` — the shape `Agent.run()` resolves to (`answer`, `tool`, `intent`, `sources`).

### `src/lib/ai/agent/context-manager.ts`

`ContextManager.merge({ history, retrievedContext, toolOutput })` is the
single place that decides what the LLM sees.

- `retrievedContext` (RAG chunk text) and `toolOutput` (structured tool data,
  e.g. project rows) are combined into one `contextText` string. Previously
  `ConversationService` picked *either* RAG context *or* stringified tool
  output — the context manager keeps that same effective behavior (only one
  is ever populated per turn today) but the merge point now exists so a
  future tool that returns both retrieved passages *and* structured data can
  be combined without touching `Agent` or `PortfolioChain`.
- `history` is passed through unchanged rather than flattened into the
  context string, because `PortfolioChain`'s prompt (`prompt.ts`) already
  renders history as proper turn-by-turn LangChain messages via
  `MessagesPlaceholder("history")`. Duplicating it as flat text inside
  `contextText` would waste tokens and risk confusing the model with two
  representations of the same conversation. `MergedContext` is still the
  single object that carries everything the chain needs — it just keeps
  history and context in the shape each downstream consumer expects.

## Files modified

### `src/lib/ai/services/conversation.service.ts`

`ConversationService.ask()` no longer contains any business logic. It is a
one-line delegation to `agent.run(question, history)`. The public method
signature (`ask(question, history?)`) and response shape are unchanged and
backward compatible — `answer`, `tool`, and `sources` are still present;
`intent` is a new, additive field.

No other files were changed. `PortfolioChain`, the Knowledge Layer
(`lib/ai/knowledge/**`), the Tool Layer (`lib/ai/tools/**`), `langchain.ts`,
`prompt.ts`, `retrieval.ts`, `context.ts`, and every UI component, API route,
and database call are untouched.

## Architecture

```
ChatBox (UI, unchanged)
  -> POST /api/ai/chat (unchanged)
    -> ConversationService.ask(question, history)   [no business logic]
      -> Agent.run(question, history)
        -> Planner.plan(question)                    -> AgentPlan (intent, tool)
        -> AI_TOOLS registry lookup (existing)        -> falls back to
           OR existing ToolExecutor/ToolSelector         existing executor
        -> isRagToolResult / sourceBuilder (existing) -> sources, retrieved context
        -> ContextManager.merge(...)                  -> MergedContext
        -> PortfolioChain.invoke(question, history, contextText)
           [retrieval-or-passthrough + prompt execution only]
          -> llm (ChatOpenAI via langchain.ts) + prompt.ts (single source of truth)
        -> AgentResponse (answer, tool, intent, sources)
```

`PortfolioChain`'s responsibility is unchanged and now cleanly scoped to
exactly two things, as required: retrieval (when no context is supplied) and
prompt execution against the LLM.

## Known gaps (intentionally not addressed in this phase)

- `interview.tool.ts`, `resume.tool.ts`, and `certification.tool.ts` do not
  exist as registered tools yet (only `project-tool`, `blog-tool`, and
  `rag-tool` are in `AI_TOOLS`). The planner can already classify a question
  into `interview` / `resume` / `certification` intent, but `Agent` falls
  back to the existing RAG-default execution path for those intents until
  the corresponding tools are implemented and registered. This preserves
  current behavior exactly (these questions already fell back to
  `rag-tool` before this phase) while giving the planner a stable seam for
  when those tools land.
- `memory.service.ts`, `document-loader.ts`, `chunker.ts`, and
  `tool-result-builder.ts` remain untouched stubs, per instructions.

## Future extension points

1. **Swap the planner for LangGraph.** Replace the `planner` export in
   `planner.ts` with a LangGraph graph that implements the same `Planner`
   interface (`plan(question): Promise<AgentPlan>`). Nothing in `agent.ts`
   needs to change.
2. **Register new tools.** Once `interview-tool` / `resume-tool` /
   `certification-tool` are implemented (mirroring `project.tool.ts`), add
   them to `AI_TOOLS` in `tools/registry.ts`. `Agent` will automatically stop
   falling back to the executor for those intents since it looks tools up by
   name from that same registry.
3. **Multi-tool plans.** `AgentPlan` currently names a single tool. It can be
   extended to a list of steps (`AgentPlan.steps: PlannedStep[]`) for
   multi-hop tool use once the planner is LangGraph-backed; `Agent.run()`
   would loop over steps and accumulate `toolOutput` for the same
   `ContextManager.merge()` call.
4. **Context ranking/compression.** `ContextManager` is the single seam for
   adding token-budget-aware truncation or re-ranking of merged context
   before it reaches `PortfolioChain`, without touching the chain or the
   tools.
5. **Agent telemetry.** `AgentPlan.confidence` and `reason` are already
   returned from the planner but not yet logged/persisted anywhere — a
   natural next step for observability once a logging layer exists.

## Verification

- `npm run lint` — 0 errors (1 pre-existing, unrelated `<img>` warning in `blog/[slug]/page.tsx`).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds (exit code 0); all routes, including `/api/ai/chat`, compiled successfully.
