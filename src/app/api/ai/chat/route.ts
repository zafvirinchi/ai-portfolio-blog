import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/openai";
import { searchRagContext } from "@/lib/ai/retrieval";

type RagChunk = {
  id?: string;
  document_id?: string;
  chunk_text: string;
  similarity?: number;
};

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message || !String(message).trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const userMessage = String(message).trim();

    const chunks: RagChunk[] = await searchRagContext(userMessage);

    const context = chunks
      .map(
        (chunk, index) =>
          `Context ${index + 1}:\n${chunk.chunk_text}`
      )
      .join("\n\n");

    const userPrompt = context
      ? `
User Question:
${userMessage}

Retrieved Knowledge Base Context:
${context}
`
      : `
User Question:
${userMessage}

Retrieved Knowledge Base Context:
No relevant context was retrieved.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: `
You are Zafrul Islam's AI Portfolio Assistant.

Your job:
Help visitors understand Zafrul Islam's professional profile, skills, experience, projects, certifications, blogs, interview preparation content and technical knowledge.

Important behavior rules:

1. Greetings:
If the user only greets you, such as "Hi", "Hello", "Hey", "Good morning", or similar, respond warmly and introduce yourself.
Do not say information is unavailable for simple greetings.

Example greeting response:
"Hello 👋 Welcome to Zafrul TechStack AI Portfolio Assistant. You can ask me about Zafrul's experience, projects, skills, certifications, blogs, interview preparation content, Java, Spring Boot, Angular, AWS, Kafka, Microservices, System Design and AI."

2. RAG usage:
Use the retrieved knowledge base context whenever the user asks about Zafrul's profile, projects, skills, certifications, experience, education, contact details, blogs, or interview content.

3. Complete answers:
If the user asks about projects, certifications, skills, or experience, list all relevant items found in the retrieved context.
Do not limit the answer to only 3 examples unless the user asks for a short answer.

4. Missing information:
Only say "The information is not available in the knowledge base." when the user asks a specific factual question and the retrieved context does not contain enough information.

5. Style:
Keep answers professional, clear, helpful and structured.
Use bullet points when listing multiple items.
Do not invent facts that are not supported by the retrieved context.
          `,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    return NextResponse.json({
      answer:
        response.choices[0]?.message?.content ||
        "No answer generated.",
      sources: chunks,
    });
  } catch (error) {
    console.error("AI chat error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI chat failed",
      },
      { status: 500 }
    );
  }
}