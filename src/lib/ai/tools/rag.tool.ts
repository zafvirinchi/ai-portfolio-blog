import { ragKnowledge } from "../knowledge/rag.service";
import { AITool, ToolResponse } from "./types";
import { RagToolResult } from "@/types/tool-result";


export class RagTool implements AITool {

  name = "rag-tool";

  description =
    "General portfolio knowledge";

  keywords = [];

  priority = 1;

async execute(question: string): Promise < ToolResponse < RagToolResult >> {

    const result =
        await ragKnowledge.search(question);

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