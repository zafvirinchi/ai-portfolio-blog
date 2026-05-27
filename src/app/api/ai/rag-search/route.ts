import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { query } = await req.json();

  if (!query) {
    return NextResponse.json(
      { error: "Query is required." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    query,
    results: [],
    message: "RAG search will be implemented in the next phase.",
  });
}

export async function GET() {
  return NextResponse.json({
    message: "RAG search API is working.",
  });
}