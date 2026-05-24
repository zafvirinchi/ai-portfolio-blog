import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const { name, email, message } = body;

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "All fields are required." },
      { status: 400 }
    );
  }

  console.log("New contact message:", {
    name,
    email,
    message,
  });

  return NextResponse.json({
    success: true,
    message: "Message received successfully.",
  });
}