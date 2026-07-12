import { AI_TOOLS } from "./registry";
import { AITool } from "./types";

export class ToolSelector {

  find(question: string): AITool {

    const q =
      question.toLowerCase();

    let selected: AITool | undefined;

    let highestScore = -1;

    for (const tool of AI_TOOLS) {

      let score = 0;

      for (const keyword of tool.keywords) {

        if (q.includes(keyword)) {

          score += tool.priority;

        }

      }

      if (score > highestScore) {

        highestScore = score;

        selected = tool;

      }

    }

    return (
      selected ??
      AI_TOOLS.find(
        t => t.name === "rag-tool"
      )!
    );

  }

}

export const toolSelector =
  new ToolSelector();