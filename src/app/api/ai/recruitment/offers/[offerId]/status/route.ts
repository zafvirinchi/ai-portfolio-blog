import { NextResponse } from "next/server";

import { OFFER_STATUSES } from "@/lib/ai/recruitment/pipeline-schema";
import { offerService } from "@/lib/ai/recruitment/offer-service";

type Params = {
  params: Promise<{ offerId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { offerId } = await params;

  try {
    const { status } = await req.json();

    if (!OFFER_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${OFFER_STATUSES.join(", ")}` }, { status: 400 });
    }

    const offer = offerService.updateStatus(offerId, status);

    return NextResponse.json(offer);
  } catch (error) {
    console.error("[recruitment] Offer status route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Offer status update failed" }, { status: 422 });
  }
}
