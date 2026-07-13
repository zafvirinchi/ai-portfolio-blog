import { ChatMessage } from "@/types/ai";

export interface ContextManagerInput {
  history: ChatMessage[];
  retrievedContext: string;
  toolOutput?: unknown;
}

export interface MergedContext {
  contextText: string;
  history: ChatMessage[];
}

export class ContextManager {
  merge(input: ContextManagerInput): MergedContext {
    const sections: string[] = [];

    if (input.retrievedContext) {
      sections.push(input.retrievedContext);
    }

    if (input.toolOutput !== undefined) {
      sections.push(
        `========== Tool Output ==========\n${JSON.stringify(
          input.toolOutput,
          null,
          2
        )}`
      );
    }

    return {
      contextText: sections.join("\n\n"),
      history: input.history,
    };
  }
}

export const contextManager = new ContextManager();
