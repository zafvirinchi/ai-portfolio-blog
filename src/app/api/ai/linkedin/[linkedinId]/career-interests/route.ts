import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { linkedinId } = await params;

  try {
    const { preferredRoles, preferredIndustries, preferredLocations, remotePreference, relocationPreference, visaSponsorshipStatement } =
      await req.json();

    const record = linkedinService.updateCareerInterests(linkedinId, {
      preferredRoles: Array.isArray(preferredRoles) ? preferredRoles : undefined,
      preferredIndustries: Array.isArray(preferredIndustries) ? preferredIndustries : undefined,
      preferredLocations: Array.isArray(preferredLocations) ? preferredLocations : undefined,
      remotePreference: typeof remotePreference === "string" ? remotePreference : undefined,
      relocationPreference: typeof relocationPreference === "string" ? relocationPreference : undefined,
      visaSponsorshipStatement: typeof visaSponsorshipStatement === "string" ? visaSponsorshipStatement : undefined,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] Career interests route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update career interests" }, { status: 422 });
  }
}
