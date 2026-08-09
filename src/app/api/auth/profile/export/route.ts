import { NextResponse } from "next/server";

import { exportPersonalData } from "@/lib/auth/auth-service";
import { requireAuthContext } from "@/lib/auth/permission-service";

export async function GET() {
  try {
    const context = await requireAuthContext();
    const data = await exportPersonalData(context.userId);

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="personal-data-${context.userId}.json"`,
      },
    });
  } catch (error) {
    console.error("[auth] Profile export route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 422 });
  }
}
