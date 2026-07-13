import { agent } from "../agent/agent";
import { ChatMessage } from "@/types/ai";


export class ConversationService {

    async ask(question: string, history: ChatMessage[] = []) {

        return agent.run(question, history);

    }

}

export const conversationService =
    new ConversationService();