import { NextResponse } from "next/server";

import { register } from "@/lib/auth/auth-service";
import { registerSchema } from "@/lib/auth/auth-schema";
import { verifySameOrigin } from "@/lib/auth/security-service";

export async function POST(req: Request) {
  try {
    if (!verifySameOrigin(req)) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }

    const body = registerSchema.parse(await req.json());
    const result = await register(req, body.email, body.password);

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Registration failed" }, { status: 422 });
    }

    return NextResponse.json({ needsConfirmation: result.needsConfirmation, defaultLandingPath: result.defaultLandingPath });
  } catch (error) {
    console.error("[auth] Register route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Registration failed" }, { status: 422 });
  }
}
