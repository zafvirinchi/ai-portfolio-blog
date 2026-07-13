import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { ChatMessage } from "@/types/ai";
import { AgentIntent, AgentSource } from "../agent/agent-response";
import { GraphState, createInitialGraphState } from "./state";
import { routeAfterPlanner } from "./edges";
import { plannerNode, toolNode, promptBuilderNode, generationNode } from "./nodes";

// Mirrors GraphState field-for-field (see state.ts — not redesigned, just
// wrapped in the channel shape StateGraph needs). Every field is a plain
// "last write wins" channel: nothing in this graph ever needs to merge
// concurrent writes, so no custom reducers are required.
const GraphStateAnnotation = Annotation.Root({
  userQuestion: Annotation<string>(),
  conversationHistory: Annotation<ChatMessage[]>(),
  selectedTool: Annotation<string | undefined>(),
  intent: Annotation<AgentIntent | undefined>(),
  retrievedContext: Annotation<string | undefined>(),
  toolOutput: Annotation<unknown>(),
  mergedContext: Annotation<string | undefined>(),
  finalAnswer: Annotation<string | undefined>(),
  sources: Annotation<AgentSource[]>(),
});

const GRAPH_LOG_PREFIX = "[ai-graph]";

async function runPlannerNode(state: GraphState): Promise<GraphState> {
  const result = await plannerNode.run(state);

  console.log(`${GRAPH_LOG_PREFIX} Planner selected`, {
    intent: result.intent,
    tool: result.selectedTool,
  });

  return result;
}

async function runToolNode(state: GraphState): Promise<GraphState> {
  const result = await toolNode.run(state);

  console.log(`${GRAPH_LOG_PREFIX} Tool executed`, {
    tool: result.selectedTool,
  });

  return result;
}

async function runGenerationNode(state: GraphState): Promise<GraphState> {
  const result = await generationNode.run(state);

  console.log(`${GRAPH_LOG_PREFIX} Generation completed`);

  return result;
}

// Real LangGraph StateGraph, replacing the previous hand-rolled edge-walker.
// Topology matches GRAPH_EDGES/edges.ts exactly, plus one conditional
// branch (routeAfterPlanner) deciding whether the tool node runs:
//
//   START -> planner -> [tool | promptBuilder] -> promptBuilder -> generation -> END
//                                                    ^ tool always flows here too
const graphBuilder = new StateGraph(GraphStateAnnotation)
  .addNode("planner", runPlannerNode)
  .addNode("tool", runToolNode)
  .addNode("promptBuilder", (state) => promptBuilderNode.run(state))
  .addNode("generation", runGenerationNode)
  .addEdge(START, "planner")
  .addConditionalEdges("planner", routeAfterPlanner, {
    tool: "tool",
    promptBuilder: "promptBuilder",
  })
  .addEdge("tool", "promptBuilder")
  .addEdge("promptBuilder", "generation")
  .addEdge("generation", END);

const compiledGraph = graphBuilder.compile();

function buildGracefulErrorState(
  userQuestion: string,
  conversationHistory: ChatMessage[]
): GraphState {
  return {
    ...createInitialGraphState(userQuestion, conversationHistory),
    finalAnswer:
      "Sorry, something went wrong while processing your question. Please try again in a moment.",
  };
}

// Public entry point — same name/signature as the previous custom
// runGraph(), so agent.ts (and everything above it: ConversationService,
// the /api/ai/chat route) needs zero changes.
export async function runGraph(
  userQuestion: string,
  conversationHistory: ChatMessage[] = []
): Promise<GraphState> {
  console.log(`${GRAPH_LOG_PREFIX} Graph started`, {
    question: userQuestion.slice(0, 80),
  });

  try {
    const initialState = createInitialGraphState(userQuestion, conversationHistory);

    const result = (await compiledGraph.invoke(
      initialState as typeof GraphStateAnnotation.State
    )) as GraphState;

    console.log(`${GRAPH_LOG_PREFIX} Graph finished`, {
      intent: result.intent,
      tool: result.selectedTool,
    });

    return result;
  } catch (error) {
    console.error(`${GRAPH_LOG_PREFIX} Graph node failed`, error);

    return buildGracefulErrorState(userQuestion, conversationHistory);
  }
}
