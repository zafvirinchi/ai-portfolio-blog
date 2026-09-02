import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { requireUserId, resumeVersionService, ResumeVersionNotFoundError, UnauthorizedError } from "@/lib/ai/resume-versions";
import { requireFeature, requireQuota, recordUsage } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { generateAndValidateVariants } from "@/lib/ai/resume-rewriter/rewrite-service";
import { generateBulletVariants } from "@/lib/ai/resume-rewriter/bullet-rewriter";
import { generateSummaryVariants } from "@/lib/ai/resume-rewriter/summary-rewriter";
import { generateSkillsRewrite } from "@/lib/ai/resume-rewriter/skills-rewriter";
import { REWRITE_STYLES } from "@/lib/ai/resume-rewriter/rewrite-schema";

const LOG_PREFIX = "[resume-version]";

// Phase 25 Milestone 1 — the generic "Improve with AI" entry point the
// Resume Builder calls for a single section/entry. Zero new AI/prompt
// logic: dispatches to the SAME generator functions the standalone
// ephemeral /resume-rewriter flow already uses, and reuses
// generateAndValidateVariants()'s existing fabrication-guard/fallback
// behavior verbatim (see rewrite-service.ts). "skills" and "summary"
// each have their own dedicated, content-tuned generator (matching how
// the existing engine already treats them); every other improvable
// section reuses generateBulletVariants() — the engine's own
// designated "improve exactly this one text item, in resume context"
// tool, already used this same way (regardless of section) by the
// ephemeral flow's own single-item "Generate Again" mode.
const AI_IMPROVABLE_SECTIONS = ["summary", "experience", "skills", "achievements", "projects", "certifications"] as const;

const aiImproveSchema = z.object({
  section: z.enum(AI_IMPROVABLE_SECTIONS),
  // Required for every section except "summary"/"skills" — those two
  // generators operate on the whole resume.summary / whole skill
  // lists, not a single passed-in string (see the dispatch below).
  itemText: z.string().trim().min(1).max(4000).optional(),
  style: z.enum(REWRITE_STYLES).default("Professional"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const { section, itemText, style } = aiImproveSchema.parse(await req.json());

    if (section !== "summary" && section !== "skills" && !itemText) {
      return NextResponse.json({ error: "itemText is required for this section" }, { status: 400 });
    }

    // Ownership check (404 not 403 for another user's version) before
    // any entitlement check or LLM call.
    const version = await resumeVersionService.getVersion(userId, id);

    // Entitlement gate — reuses the existing resume.rewrite feature and
    // AI_REWRITES usage metric (no new feature ID/metric introduced).
    // Completes before the LLM call, matching every sibling AI route.
    await requireFeature(userId, "resume.rewrite");
    await requireQuota(userId, "AI_REWRITES");

    const resume = version.resumeData;

    if (section === "skills") {
      const categories = await generateSkillsRewrite(resume);
      await recordUsage(userId, "AI_REWRITES");
      return NextResponse.json({ section, suggestion: { categories } });
    }

    if (section === "summary") {
      const original = resume.summary ?? "";
      const suggestions = await generateAndValidateVariants(
        resume,
        original,
        (correction) => generateSummaryVariants(resume, style, null, false, correction),
        "summary",
        []
      );
      await recordUsage(userId, "AI_REWRITES");
      return NextResponse.json({ section, original, suggestions });
    }

    const original = itemText as string;
    const suggestions = await generateAndValidateVariants(
      resume,
      original,
      (correction) => generateBulletVariants(resume, original, style, null, correction),
      section,
      []
    );

    await recordUsage(userId, "AI_REWRITES");

    return NextResponse.json({ section, original, suggestions });
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof ResumeVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error(`${LOG_PREFIX} AI improve failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI improve failed" }, { status: 422 });
  }
}
