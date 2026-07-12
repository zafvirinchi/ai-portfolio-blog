export interface ToolResponse<T> {
  success: boolean;
  tool: string;
  result: T;
}

export interface ToolMetadata {
  name: string;

  description: string;

  keywords: string[];

  priority: number;
}

export interface AITool extends ToolMetadata {

  execute(
    question: string
  ): Promise<ToolResponse<unknown>>;

}