import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

// Phase 24 Milestone 2 — genuine defect found and fixed: this route
// previously only console.log'd a submission and always returned
// {success: true} — a real visitor's message was invisible beyond an
// ephemeral server log line, with no durable record. Fixed with the
// safest minimal change reachable using existing architecture (no new
// external email provider — none is configured anywhere in this repo,
// and adding one is a business decision, not a code defect this route
// can resolve on its own): persist to contact_messages via the same
// supabaseAdmin client every other table in this project already uses.
// This is a PRIMARY action (the message's only purpose), not secondary
// bookkeeping — unlike login/session tracking, there is no already-
// succeeded action to preserve if the write fails, so this correctly
// fails closed (an honest error) rather than pretending success.
export async function POST(req: Request) {
  const body = await req.json();

  const { name, email, message } = body;

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "All fields are required." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("contact_messages").insert({ name, email, message });

  if (error) {
    console.error("[contact] Failed to persist contact message", error);
    return NextResponse.json(
      { error: "We couldn't save your message right now. Please try again shortly or email us directly." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Message received successfully.",
  });
}