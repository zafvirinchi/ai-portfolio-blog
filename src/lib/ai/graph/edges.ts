import { GraphState, NodeName } from "./state";

export const GRAPH_START = "__start__" as const;
export const GRAPH_END = "__end__" as const;

export type GraphNodeId = NodeName | typeof GRAPH_START | typeof GRAPH_END;

export interface GraphEdge {
  from: GraphNodeId;
  to: GraphNodeId;
}

// The static (unconditional) backbone of the graph, wired onto the compiled
// StateGraph via StateGraph#addEdge in graph.ts. The only conditional
// branch is the one routeAfterPlanner() below decides.
export const GRAPH_EDGES: GraphEdge[] = [
  { from: GRAPH_START, to: "planner" },
  { from: "tool", to: "promptBuilder" },
  { from: "promptBuilder", to: "generation" },
  { from: "generation", to: GRAPH_END },
];

export type PlannerRoute = Extract<NodeName, "tool" | "promptBuilder">;

// Intents that don't need a tool call are routed straight to promptBuilder
// (which safely merges empty context) so there is still exactly one LLM
// generation step, just without a tool in front of it. PlannerService
// (untouched by this phase) does not currently emit "greeting" — it maps
// greetings to a low-confidence "rag" intent instead — but the branch is
// wired here per the conditional-routing spec so adding a real "greeting"
// intent later needs no graph changes. See PHASE8 docs for details.
const NO_TOOL_INTENTS: ReadonlySet<string> = new Set(["greeting"]);

export function routeAfterPlanner(state: GraphState): PlannerRoute {
  if (state.intent && NO_TOOL_INTENTS.has(state.intent)) {
    return "promptBuilder";
  }

  return "tool";
}
