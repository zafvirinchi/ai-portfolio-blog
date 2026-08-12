import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId, resumeVersionService, resumeChangeProposalSchema } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

// Milestone 15, §18/§24/§25 — applies only the accepted (optionally
// user-edited) proposals returned by /propose, field by field, via
// resumeVersionService.applyOptimizationProposals(). Two target modes:
//
// - "new": duplicates the version first (resumeVersionService.
//   duplicateVersion(), already-existing, unmodified), then applies the
//   accepted proposals to the DUPLICATE — the original version, and
//   therefore the user's ability to revert, is untouched by
//   construction. This reuses the existing Resume Versioning history
//   mechanism rather than building a second, purpose-built snapshot
//   system, per §25's explicit "if the existing resume versioning
//   system exists, reuse it" instruction.
// - "current": applies directly to this version (blocked on the master
//   by applyOptimizationProposals(), exactly like every other AI-driven
//   write in this service).
const applySchema = z.object({
  proposals: z.array(resumeChangeProposalSchema),
  target: z.enum(["current", "new"]).default("current"),
  newVersionName: z.string().trim().min(1).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = applySchema.parse(await req.json());

    if (body.proposals.length === 0) {
      const version = await resumeVersionService.getVersion(userId, id);
      return NextResponse.json({ version });
    }

    if (body.target === "new") {
      const duplicate = await resumeVersionService.duplicateVersion(userId, id, body.newVersionName);
      const { version, results } = await resumeVersionService.applyOptimizationProposals(userId, duplicate.id, body.proposals);
      return NextResponse.json({ version, results, createdNewVersion: true });
    }

    const { version, results } = await resumeVersionService.applyOptimizationProposals(userId, id, body.proposals);
    return NextResponse.json({ version, results, createdNewVersion: false });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to apply the selected changes");
  }
}
