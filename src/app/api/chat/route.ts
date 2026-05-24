import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { answer: "Message is required." },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant for Zafrul Islam's portfolio website. Help with Java, Spring Boot, Angular, Microservices, AWS and interview preparation.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    return NextResponse.json({
      answer:
        response.choices[0]?.message?.content ||
        "I received your question, but no answer was generated.",
    });
  } catch (error: any) {
    console.error("CHAT_API_ERROR:", error);

    return NextResponse.json(
      {
        answer:
          error?.message ||
          "AI service error. Please check API key, base URL and model name.",
      },
      { status: 500 }
    );
  }
}