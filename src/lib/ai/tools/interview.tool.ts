import { ragKnowledge } from "../knowledge/rag.service";
import { interviewChatService } from "../interview-chat";
import { ToolResponse, AITool } from "./types";
import { RagToolResult } from "@/types/tool-result";

const LOG_PREFIX = "[interview-chat]";

export class InterviewTool implements AITool {
  name = "interview-tool";

  description =
    "Interview questions and technical prep — Java, Spring, Angular, React, Node, Database, Kafka, system design, and behavioral interview topics";

  keywords = [
    "interview",
    "interview question",
    "mock interview",
    "java",
    "spring",
    "spring boot",
    "angular",
    "react",
    "node",
    "kafka",
    "database",
    "sql",
    "system design",
    "behavioral",
    "hashmap",
    "coding question",
  ];

  priority = 90;

  async execute(question: string): Promise<ToolResponse<RagToolResult>> {
    const matched = await interviewChatService.search(question);

    if (matched) {
      console.log(`${LOG_PREFIX} PortfolioChain Invoked`);

      return {
        success: true,
        tool: this.name,
        result: {
          context: matched.context,
          chunks: [],
          exactAnswer: matched.exactAnswer,
        },
      };
    }

    // No relevant imported interview questions — fall back to the RAG
    // knowledge base exactly like resumeTool does for its no-match case.
    const fallback = await ragKnowledge.search(question);

    return {
      success: true,
      tool: this.name,
      result: {
        context: fallback.context,
        chunks: fallback.chunks,
      },
    };
  }
}

export const interviewTool = new InterviewTool();
