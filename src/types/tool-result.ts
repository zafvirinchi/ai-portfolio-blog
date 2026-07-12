export interface RagToolResult {
  context: string;
  chunks: {
    id?: string;
    document_id?: string;
    similarity?: number;
  }[];
}

export interface DatabaseToolResult {
  rows: unknown[];
}