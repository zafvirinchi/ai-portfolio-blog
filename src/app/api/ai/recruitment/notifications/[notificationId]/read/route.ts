import { NextResponse } from "next/server";

import { notificationService } from "@/lib/ai/recruitment/notification-service";

type Params = {
  params: Promise<{ notificationId: string }>;
};

export async function PATCH(_req: Request, { params }: Params) {
  const { notificationId } = await params;

  try {
    const notification = notificationService.markRead(notificationId);
    return NextResponse.json(notification);
  } catch (error) {
    console.error("[recruitment] Mark notification read route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Marking notification read failed" }, { status: 422 });
  }
}
