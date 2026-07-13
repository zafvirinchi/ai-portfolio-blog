import { GraphNode, GraphState } from "./state";
import { AI_TOOLS } from "../tools/registry";
import { executor } from "../tools/executor";
import { isRagToolResult } from "../tools/tool-utils";
import { sourceBuilder } from "../services/source-builder";

export const toolNode: GraphNode = {
  name: "tool",

  async run(state: GraphState): Promise<GraphState> {

    const registeredTool =
      AI_TOOLS.find((tool) => tool.name === state.selectedTool);

    const execution = registeredTool
      ? {
          tool: registeredTool.name,
          result: await registeredTool.execute(state.userQuestion),
        }
      : await executor.execute(state.userQuestion);

    const payload = execution.result.result;

    const isRag = isRagToolResult(payload);

    return {
      ...state,
      selectedTool: execution.tool,
      retrievedContext: isRag ? payload.context : "",
      toolOutput: isRag ? undefined : payload,
      sources: isRag ? sourceBuilder.build(payload.chunks) : [],
    };

  },
};
