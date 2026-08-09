import { ragKnowledge } from "../knowledge/rag.service";
import { usageFeatureOverrideContext } from "../usage/usage-context";
import { AITool, ToolResponse } from "./types";
import { RagToolResult } from "@/types/tool-result";


export class RagTool implements AITool {

  name = "rag-tool";

  description =
    "General portfolio knowledge";

  keywords = [];

  priority = 1;

async execute(question: string): Promise < ToolResponse < RagToolResult >> {

    // Phase 14 Milestone 4 — relabels this tool's embedding call as
    // KNOWLEDGE_SEARCH (distinct from the outer AI_CHAT context the
    // chat route wraps every tool call in) so usage-meter.ts attributes
    // it correctly; a pure no-op when no usageRequestContext is set.
    const result =
        await usageFeatureOverrideContext.run({ feature: "KNOWLEDGE_SEARCH" }, () => ragKnowledge.search(question));

    return {

        success: true,

        tool: this.name,

        result: {

            context: result.context,

            chunks: result.chunks

        }

    };

}

}

export const ragTool =
  new RagTool();