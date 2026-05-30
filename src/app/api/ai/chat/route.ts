import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/openai";
import { searchRagContext } from "@/lib/ai/retrieval";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const chunks = await searchRagContext(message);

    const context = chunks
      .map((chunk: any, index: number) => `Context ${index + 1}:\n${chunk.chunk_text}`)
      .join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Zafrul Islam's AI portfolio assistant.
Answer using the provided context only when relevant.
Help users understand Zafrul's experience, projects, blogs, skills, and interview preparation content.
If context is missing, say that the information is not available in the knowledge base.
          `,
        },
        {
          role: "user",
          content: `
Question:
${message}

Relevant Context:
${context}
          `,
        },
      ],
    });

    return NextResponse.json({
      answer: response.choices[0]?.message?.content || "No answer generated.",
      sources: chunks,
    });
  } catch (error) {
    console.error("AI chat error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI chat failed" },
      { status: 500 }
    );
  }
}