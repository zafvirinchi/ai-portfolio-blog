import { projectKnowledge } from "../knowledge/project.service";
import { ToolResponse, AITool } from "./types";
import { DatabaseToolResult } from "@/types/tool-result";

export class ProjectTool implements AITool {

  name = "project-tool";

  description =
    "Project related questions";

  keywords = [

    "project",

    "projects",

    "client",

    "clients",

    "application",

    "system",

    "implementation",

    "work"

  ];

  priority = 100;

  async execute(question: string): Promise<ToolResponse<DatabaseToolResult>> {

    const rows =
        await projectKnowledge.searchProjects(question);

    return {

        success: true,

        tool: this.name,

        result: {

            rows

        }

    };

  }
}

export const projectTool =
  new ProjectTool();