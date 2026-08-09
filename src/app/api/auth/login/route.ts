import { NextResponse } from "next/server";

import { login } from "@/lib/auth/auth-service";
import { loginSchema } from "@/lib/auth/auth-schema";
import { verifySameOrigin } from "@/lib/auth/security-service";

export async function POST(req: Request) {
  try {
    if (!verifySameOrigin(req)) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }

    const body = loginSchema.parse(await req.json());
    const result = await login(req, body.email, body.password);

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Login failed" }, { status: 401 });
    }

    return NextResponse.json({ mfaRequired: result.mfaRequired, factorId: result.factorId, challengeId: result.challengeId });
  } catch (error) {
    console.error("[auth] Login route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Login failed" }, { status: 422 });
  }
}
