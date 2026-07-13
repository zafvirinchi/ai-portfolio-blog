import { GraphNode, GraphState } from "./state";
import { contextManager } from "../agent/context-manager";
import { plannerNode } from "./planner-node";
import { toolNode } from "./tool-node";
import { generationNode } from "./generation-node";

export const promptBuilderNode: GraphNode = {
  name: "promptBuilder",

  async run(state: GraphState): Promise<GraphState> {

    const merged = contextManager.merge({
      history: state.conversationHistory,
      retrievedContext: state.retrievedContext ?? "",
      toolOutput: state.toolOutput,
    });

    return {
      ...state,
      mergedContext: merged.contextText,
    };

  },
};

export const GRAPH_NODES: GraphNode[] = [
  plannerNode,
  toolNode,
  promptBuilderNode,
  generationNode,
];

export { plannerNode, toolNode, generationNode };
