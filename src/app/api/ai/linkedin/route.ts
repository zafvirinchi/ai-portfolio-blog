import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";
import * as activityService from "@/lib/saas/activity-service";
import { recordUsage, requireFeature, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { getOptionalUserId } from "@/lib/billing/persona-service";

// Phase 19 Milestone 6 — genuine defect found and fixed (Phase 19 M5's
// own top finding): this route, and every one of the LinkedIn
// Optimizer's other ~15 routes, had NO entitlement/quota/cost-control
// plumbing at all. Fixed here, at the single narrowest point through
// which every LinkedIn generation must pass: linkedinService.start()
// itself performs no LLM call (it only creates the ephemeral session
// record — see linkedin-service.ts), but every one of the 7 real
// generator sub-actions (headline/about/experience/projects/skills/
// recommendations/banner) requires a linkedinId that can ONLY be
// minted by a successful call to this route — an unentitled caller can
// never obtain one, so gating here alone protects the whole session,
// exactly mirroring resume-rewriter's own already-audited "charge once
// at session start, never re-check the follow-on sub-action routes"
// design (resume-rewriter/route.ts). Anonymous callers are unaffected
// — additive, no-op when getOptionalUserId() resolves null, matching
// every other ephemeral-tool route's own established pattern.
export async function POST(req: Request) {
  try {
    const { resumeId, rewriteId, jdMatchId, careerGoal, targetRole, yearsOfExperience, industry, volunteerWork, publications, patents, licenses } =
      await req.json();

    if (typeof resumeId !== "string" || !resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    const platformUserId = await getOptionalUserId();
    if (platformUserId) {
      await requireFeature(platformUserId, "resume.linkedin_optimizer");
      await requireQuota(platformUserId, "LINKEDIN_OPTIMIZATIONS");
    }

    const record = linkedinService.start({
      resumeId,
      rewriteId: typeof rewriteId === "string" && rewriteId ? rewriteId : undefined,
      jdMatchId: typeof jdMatchId === "string" && jdMatchId ? jdMatchId : undefined,
      careerGoal: typeof careerGoal === "string" ? careerGoal : undefined,
      targetRole: typeof targetRole === "string" ? targetRole : undefined,
      yearsOfExperience: typeof yearsOfExperience === "number" ? yearsOfExperience : undefined,
      industry: typeof industry === "string" ? industry : undefined,
      volunteerWork: Array.isArray(volunteerWork) ? volunteerWork : undefined,
      publications: Array.isArray(publications) ? publications : undefined,
      patents: Array.isArray(patents) ? patents : undefined,
      licenses: Array.isArray(licenses) ? licenses : undefined,
    });

    if (platformUserId) await recordUsage(platformUserId, "LINKEDIN_OPTIMIZATIONS");

    await activityService.record("LinkedIn Optimized", `Optimized LinkedIn profile from resume: ${resumeId}`, {
      linkedinId: record.linkedinId,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] API route failed", error);

    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start LinkedIn optimizer" }, { status: 422 });
  }
}
