import { toolSelector } from "./tool-selector";

export class ToolExecutor {

    async execute(question: string) {

        const tool =
            toolSelector.find(question);

        const result =
            await tool.execute(question);

        return {

            tool: tool.name,

            result

        };

    }

}

export const executor =
    new ToolExecutor();