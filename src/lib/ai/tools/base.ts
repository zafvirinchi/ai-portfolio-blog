export interface ToolResult<T = unknown> {
  success: boolean;
  tool: string;
  data: T;
}

export interface PortfolioTool {
  name: string;

  description: string;

  execute(input: string): Promise<ToolResult>;
}