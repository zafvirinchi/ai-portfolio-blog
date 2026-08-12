import { NextResponse } from "next/server";

import { requireUserId, resumeVersionService, updatePersonalInformationSchema } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string }> };

// GET returns this version's dynamic document (lazily migrated from
// resume_data if the Resume Builder has never touched it — see
// dynamic/resume-migration.ts). Zero AI calls, deterministic.
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const document = await resumeVersionService.getDynamicDocument(userId, id);

    return NextResponse.json({ document });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to load resume document");
  }
}

// PATCH updates personalInformation (name/email/phone/location/
// linkedin/github/website) — the one part of the dynamic document that
// isn't a section, so it doesn't go through /sections* like everything
// else. Reuses this same route rather than adding a new one, per the
// milestone's "add an endpoint only if genuinely no suitable one
// exists" instruction.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const updates = updatePersonalInformationSchema.parse(await req.json());

    const version = await resumeVersionService.updatePersonalInformation(userId, id, updates);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to update personal information");
  }
}
