import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId, resumeVersionService, gapSkillsFor, buildChangeProposals, buildEducationAndCertificationProposals, projectAtsScoreAfterProposals, buildJdOptimizationSummary } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";
import { computeJdMatchForResume } from "@/lib/ai/job-description/jd-service";
import { OPTIMIZATION_MODES, OptimizerOutput } from "@/lib/ai/job-description/jd-schema";
import { classifyCertificationRequirements, classifyEducationRequirements } from "@/lib/ai/job-description/keyword-engine";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { recordUsage, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

// Milestone 15, §17/§20/§32 — "Analyze Changes" step of the JD
// Optimization Panel. Runs the existing (unmodified) JD parse + match +
// optimize pipeline (computeJdMatchForResume, same 2 LLM calls the
// pre-existing /optimize route already makes) and returns a REVIEWABLE
// list of change proposals — nothing is saved. Allowed on the master:
// previewing what optimization would suggest never mutates anything,
// only the /apply step (below) can ever write, and that one is blocked
// on the master exactly like every other AI-driven write in this
// service.
export const maxDuration = 60;

const proposeSchema = z.object({
  jobDescriptionText: z.string().trim().min(1),
  mode: z.enum(OPTIMIZATION_MODES).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = proposeSchema.parse(await req.json());

    await checkCredits("jd_match");

    // Phase 19 Milestone 3 — genuine bypass found and fixed: this route
    // runs the exact same computeJdMatchForResume() pipeline (2 LLM
    // calls) as /api/ai/resume/jd-match, which has required this same
    // JD_MATCHES quota since Phase 18 M5 — but this route only ever had
    // the org-scoped checkCredits() above (a no-op for an individual
    // user with no organization), so a Free-tier user could run
    // unlimited JD analyses here despite being capped at 5/month
    // through the other route. requireUserId() above already guarantees
    // a real session on every call — no anonymous-preservation branch
    // is needed here, unlike the ephemeral tool's additive pattern.
    await requireQuota(userId, "JD_MATCHES");

    const startedAt = Date.now();

    const version = await resumeVersionService.getVersion(userId, id);
    const document = await resumeVersionService.getDynamicDocument(userId, id);

    const { jobDescription, matchResult } = await withUsageContext("JD_MATCHING", "JD_ANALYSIS", () =>
      computeJdMatchForResume(version.resumeData, { text: body.jobDescriptionText }, body.mode)
    );

    await consumeCredits("jd_match", Date.now() - startedAt);
    await recordUsage(userId, "JD_MATCHES");

    const gapSkills = gapSkillsFor(matchResult.missingSkills, matchResult.partialSkills);
    const optimizerOutput: OptimizerOutput = {
      optimizedSummary: matchResult.optimizedSummary,
      optimizedExperience: matchResult.optimizedExperience,
      optimizedProjects: matchResult.optimizedProjects,
      optimizedSkills: matchResult.optimizedSkills,
      missingSkillsSection: matchResult.missingKeywordsSection,
      improvementSuggestions: matchResult.improvementSuggestions,
    };

    // Milestone 16 — Education/Certification proposals are pure
    // deterministic matching (no LLM output to draw from; the optimizer
    // never rewrites these sections), so they're built independently of
    // buildChangeProposals() and simply concatenated into one response.
    // No new AI call: computeJdMatchForResume() above already ran the
    // one JD-parse + one optimize call this route has always made.
    const proposals = [
      ...buildChangeProposals(document, optimizerOutput, gapSkills),
      ...buildEducationAndCertificationProposals(document, version.resumeData, jobDescription),
    ];
    const projectedAtsScore = projectAtsScoreAfterProposals(version.resumeData, jobDescription, proposals);

    // Milestone 17 — additive, backward-compatible response fields: the
    // full per-requirement breakdown (all 3 statuses, not just gaps) for
    // the review UI's "Education Match"/"Certification Match" sections.
    // Same classifiers buildEducationAndCertificationProposals() above
    // already used — no second matching computation.
    const educationMatches = classifyEducationRequirements(
      version.resumeData.education.map((entry) => entry.degree),
      jobDescription.educationRequired
    );
    const certificationMatches = classifyCertificationRequirements(
      version.resumeData.certifications.map((cert) => cert.name),
      jobDescription.certifications
    );

    // Milestone 18 — additive: a deterministic, zero-extra-LLM-call
    // reshaping of everything already computed above (matchResult,
    // educationMatches, certificationMatches) into one concise,
    // prioritized summary. See jd-optimization-summary.ts — this never
    // recomputes a score or introduces a second matcher/optimizer.
    const summary = buildJdOptimizationSummary({
      document,
      resumeData: version.resumeData,
      jobDescription,
      matchResult,
      educationMatches,
      certificationMatches,
    });

    return NextResponse.json({
      jobDescription,
      matchResult,
      proposals,
      currentAtsScore: version.atsScore,
      projectedAtsScore,
      educationMatches,
      certificationMatches,
      summary,
    });
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return handleVersionRouteError(error, "Failed to analyze changes for this job description");
  }
}
