import { GraphNode, GraphState } from "./state";
import { plannerService } from "../planner/planner";

export const plannerNode: GraphNode = {
  name: "planner",

  async run(state: GraphState): Promise<GraphState> {

    const plan = await plannerService.plan(
      state.userQuestion,
      state.conversationHistory
    );

    return {
      ...state,
      selectedTool: plan.tool,
      intent: plan.intent,
    };

  },
};
