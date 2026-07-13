# Phase 5 — LLM-Powered Planner

## Goal

Replace the temporary `KeywordPlanner` with an LLM-backed planner that
decides routing (`intent`, `tool`, `confidence`, `reason`) using GPT-4o-mini
and OpenAI Structured Outputs, validated with Zod. The planner never
generates the user-facing answer — that responsibility stays entirely with
`generation-node.ts` / `PortfolioChain`.

## Planner architecture

New package: `src/lib/ai/planner/`.

```
planner-schema.ts     Zod schema + hand-written OpenAI json_schema + confidence threshold
planner-prompt.ts     Builds the OpenAI chat messages (system instructions + history + question)
planner-response.ts   Types: PlannerLLMOutput (zod-inferred), re-exports AgentPlan/AgentIntent
planner-service.ts    PlannerService.plan(question, history) — the LLM call, validation, fallback
planner.ts            Public entry point / barrel for the package
```

### `planner-schema.ts`

Two schema representations are kept side by side, deliberately not derived
from one another:

- `plannerOutputSchema` — a Zod object used to **validate** the parsed LLM
  response at runtime (`intent` enum, `tool` enum, `confidence` a number
  clamped `0..1`, `reason` a non-empty string).
- `PLANNER_JSON_SCHEMA` — a hand-written JSON Schema object passed to
  OpenAI as `response_format.json_schema.schema`. It mirrors the Zod schema
  but omits `minimum`/`maximum` on `confidence`, since OpenAI's *strict*
  Structured Outputs mode only supports a constrained subset of JSON
  Schema keywords. Keeping the two definitions separate avoids relying on
  automatic Zod→JSON-Schema conversion succeeding under strict mode, and
  makes the constraint surface each one enforces explicit and auditable.

`PLANNER_CONFIDENCE_THRESHOLD = 0.6` also lives here, as the single source
of truth for the fallback rule.

### `planner-prompt.ts`

`buildPlannerMessages(question, history)` builds a plain
`ChatCompletionMessageParam[]` (raw OpenAI SDK message format, not
LangChain) consisting of:

1. A system message that lists every `intent -> tool` pair with a
   one-line description, and explicit rules: pick exactly one intent/tool
   pair, `confidence` is `0..1`, ambiguous/greeting questions should map to
   `rag` with lower confidence, and — critically — **the model must never
   answer the question, only classify it**.
2. The prior conversation turns from `history`, passed through as
   `user`/`assistant` messages so the planner has the same conversational
   context the final answer will be generated with (e.g. a follow-up like
   "what about the second one?" can be classified correctly).
3. A final `user` message wrapping the current question.

### `planner-service.ts`

`PlannerService.plan(question, history)`:

1. Calls `openai.chat.completions.create` (the existing raw SDK client
   from `lib/ai/openai.ts` — not LangChain's `ChatOpenAI`, and not
   `PortfolioChain`) with `model: "gpt-4o-mini"`, `temperature: 0`, and
   `response_format: { type: "json_schema", json_schema: PLANNER_JSON_SCHEMA }`.
   This is OpenAI's native Structured Outputs feature: the API guarantees
   the returned content is valid JSON conforming to the schema, so **no
   plain-text parsing or regex extraction is used anywhere**.
2. `JSON.parse`s the guaranteed-JSON content, then re-validates it against
   `plannerOutputSchema.safeParse()` before trusting it — defense in depth
   against a malformed/empty response, and the explicitly required Zod
   validation layer.
3. Applies the confidence fallback rule (below).
4. On **any** failure — network error, empty content, JSON parse failure,
   or Zod validation failure — falls back to the existing keyword-based
   `KeywordPlanner` (`agent/planner.ts`, untouched) rather than throwing and
   breaking the chat request. The keyword result is still run through the
   same confidence fallback rule.

This gives the planner two independent layers of resilience: schema
validation catches a malformed LLM response, and the keyword planner
catches a completely failed LLM call (timeout, API error, etc.). This is
also why `agent/planner.ts`'s `KeywordPlanner` was intentionally **not**
deleted — it is no longer the primary planner, but it is now the documented
degradation path.

### `planner.ts`

The package's public surface — re-exports `plannerService`, the
`PlannerLLMOutput`/`AgentPlan`/`AgentIntent` types, and the schema/threshold
constants. `graph/planner-node.ts` imports from here.

## JSON schema

Example structured output, exactly as required:

```json
{
  "intent": "project",
  "tool": "project-tool",
  "confidence": 0.97,
  "reason": "The user is asking specifically about projects."
}
```

`intent` and `tool` are both closed enums (`PLANNER_INTENTS` /
`PLANNER_TOOLS` in `planner-schema.ts`), so the model cannot invent a tool
name that doesn't exist in the system. `confidence` is a plain `number` at
the OpenAI schema level (strict mode does not support numeric
`minimum`/`maximum`), but is clamped to `0..1` by `plannerOutputSchema` at
validation time — a value outside that range fails Zod validation and
triggers the keyword-planner fallback path.

## Confidence scoring

The LLM is instructed (via the system prompt) to return a `confidence`
between 0 and 1 reflecting how certain it is that the chosen intent/tool
pair is correct, and to prefer `rag` with a lower confidence when a
question is ambiguous, general, or a greeting. This mirrors how the old
`KeywordPlanner` scored (priority-weighted keyword matches vs. a 0-score
default), but is now a semantic judgment made by the model instead of a
literal keyword lookup.

## Fallback strategy

Two independent fallbacks, both funneling through the same
`applyConfidenceFallback()` function in `planner-service.ts`:

1. **LLM failure fallback** — any exception during the OpenAI call, JSON
   parse, or Zod validation causes `PlannerService` to call the existing
   `KeywordPlanner.plan(question)` instead. The chat request never fails
   because the planner failed.
2. **Low-confidence fallback** — whichever plan is produced (LLM or
   keyword), if `confidence < 0.60` the plan is overridden to
   `{ intent: "rag", tool: "rag-tool" }`. The original `confidence` value
   and reasoning are preserved in the `reason` field (prefixed with an
   explanation of the override) for observability, rather than being
   discarded.

Both fallbacks land on `rag-tool`, which is always registered in
`AI_TOOLS` and is the same safety net `ToolSelector`/`ToolExecutor` already
used before this phase — no new failure mode was introduced.

## What changed vs. what didn't

**Added:** `src/lib/ai/planner/{planner.ts, planner-prompt.ts, planner-schema.ts, planner-service.ts, planner-response.ts}`.

**Modified:** `src/lib/ai/graph/planner-node.ts` — now calls
`plannerService.plan(state.userQuestion, state.conversationHistory)`
instead of `planner.plan(question)`. This is the only change to the graph;
`tool-node.ts`, `nodes.ts` (including `promptBuilderNode`),
`generation-node.ts`, `edges.ts`, `graph.ts`, and `state.ts` are untouched
— `GraphState` already had `conversationHistory` available, so no state
shape changes were needed to give the planner history access.

**Untouched (as required):** `PortfolioChain`, `ConversationService`, the
Knowledge Layer, the Tool Layer, `agent/planner.ts` (kept as the fallback
implementation), `agent/context-manager.ts`, `agent/agent-response.ts`, all
UI components, all API routes, and the database.

## Future LangGraph compatibility

- `plannerService.plan(question, history)` is already an async function
  taking exactly the inputs a LangGraph node receives via `GraphState`
  (`userQuestion`, `conversationHistory`) and returning a plain object —
  `planner-node.ts`'s `run()` body doesn't change shape when the executor
  underneath `graph.ts` changes from the hand-rolled `runGraph()` to a real
  `StateGraph`.
- The planner is intentionally decoupled from the graph/edge topology: it
  has no awareness of `GRAPH_EDGES` or `GraphNode`. This means a future
  LangGraph-native planner (e.g. a sub-graph with its own retry/self-critique
  loop, or a tool-calling model that picks the tool directly) can replace
  everything inside `planner-service.ts` without touching `planner-node.ts`
  beyond the single `plannerService.plan(...)` call site it already has.
- `AgentPlan.intent` is already carried on `GraphState` (added in Phase 4)
  specifically so that once LangGraph conditional edges
  (`addConditionalEdges`) are introduced, they can branch on `state.intent`
  — for example, routing a `rag` intent with very high confidence straight
  to `generation`, skipping `tool` entirely for pure greetings — without
  any change to the planner itself.
- The Structured Outputs schema (`PLANNER_JSON_SCHEMA`) is also exactly the
  shape LangGraph's `.withStructuredOutput()` / tool-calling APIs expect,
  so if the planner is later reimplemented on top of `@langchain/openai`'s
  `ChatOpenAI` instead of the raw OpenAI SDK, the same Zod schema
  (`plannerOutputSchema`) can be passed directly to
  `llm.withStructuredOutput(plannerOutputSchema)` with no schema rewrite.

## Verification

- `npm run lint` — 0 errors (1 pre-existing, unrelated `<img>` warning in `blog/[slug]/page.tsx`).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds (exit code 0); all routes, including `/api/ai/chat`, compiled successfully.
