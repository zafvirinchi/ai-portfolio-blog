import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(req: Request) {
  const { message } = await req.json();

  if (!message) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 }
    );
  }

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content:
          "You are an AI assistant for Zafrul Islam's portfolio website. Answer questions about Java, Spring Boot, Angular, Microservices, AWS and interview preparation.",
      },
      {
        role: "user",
        content: message,
      },
    ],
  });

  return NextResponse.json({
    answer: response.output_text,
  });
}