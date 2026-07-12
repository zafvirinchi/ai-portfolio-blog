import { executor } from "../tools/executor";
import { portfolioChain } from "../chains/portfolio.chain";
import { answerBuilder } from "./answer-builder";
import { sourceBuilder } from "./source-builder";
import { isRagToolResult } from "../tools/tool-utils";
import { ChatMessage } from "@/types/ai";


export class ConversationService {

    async ask(question: string, history: ChatMessage[] = []) {

        const execution =
            await executor.execute(question);

        let context = "";

        let sources: ReturnType<typeof sourceBuilder.build> = [];

        if (isRagToolResult(execution.result.result)) {

            context =
                execution.result.result.context;

            sources =
                sourceBuilder.build(
                    execution.result.result.chunks
                );

        }
        else {

            context =
                JSON.stringify(
                    execution.result.result,
                    null,
                    2
                );

        }

        const { answer } =
            await portfolioChain.invoke(
                question,
                history,
                context
            );

        return {

            answer:
                answerBuilder.build(
                    answer || "No answer."
                ),

            tool:
                execution.tool,

            sources

        };

    }

}

export const conversationService =
    new ConversationService();