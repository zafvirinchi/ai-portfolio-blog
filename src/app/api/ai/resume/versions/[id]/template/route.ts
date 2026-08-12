import { NextResponse } from "next/server";

import { requireUserId, resumeVersionService, updateTemplateSettingsSchema } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string }> };

// GET returns this version's template settings (its own saved value,
// or DEFAULT_TEMPLATE_SETTINGS when it has never been set) — zero AI
// calls, deterministic, exactly like the sibling /document route.
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const templateSettings = await resumeVersionService.getTemplateSettings(userId, id);

    return NextResponse.json({ templateSettings });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to load template settings");
  }
}

// Partial-merge PATCH — the client sends only the fields the user
// changed (e.g. just {accentColor: "green"}); everything else keeps
// its current value. Allowed on the Master Resume, since this is a
// deterministic, non-AI, presentation-only edit — the same reasoning
// updateSection's own settings patch already established.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = updateTemplateSettingsSchema.parse(await req.json());

    const version = await resumeVersionService.saveTemplateSettings(userId, id, body);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to update template settings");
  }
}
