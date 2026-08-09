import { NextResponse } from "next/server";

import { notificationService } from "@/lib/ai/recruitment/notification-service";

export async function GET() {
  return NextResponse.json(notificationService.list());
}
