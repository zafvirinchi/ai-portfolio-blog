import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireUserId, createVersionSchema, resumeVersionService, UnauthorizedError } from "@/lib/ai/resume-versions";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { recordUsage, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

const LOG_PREFIX = "[resume-version]";

// Listing/creating without a job description is deterministic — no
// credit check, no AI usage metering (Resume Version Management itself
// never invokes an LLM). Only when jobDescriptionText is supplied does
// this route run the EXISTING JD-matching/optimization pipeline
// (jd-service.ts's computeJdMatchForResume, unmodified), metered
// exactly like /api/ai/resume/jd-match already is.
export const maxDuration = 60;

export async function GET() {
  try {
    const userId = await requireUserId();
    const versions = await resumeVersionService.listVersions(userId);

    return NextResponse.json({ versions });
  } catch (error) {
    console.error(`${LOG_PREFIX} Listing failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load resume versions" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = createVersionSchema.parse(await req.json());

    if (body.jobDescriptionText) {
      await checkCredits("jd_match");
      // Additive to the org-scoped check above, same pattern as
      // /api/ai/resume/jd-match's own requireQuota()/recordUsage()
      // integration — this route requires a real session (requireUserId()
      // above), so userId is always the platform user id here.
      await requireQuota(userId, "JD_MATCHES");
    }

    const startedAt = Date.now();

    const version = body.jobDescriptionText
      ? await withUsageContext("JD_MATCHING", "JD_ANALYSIS", () => resumeVersionService.createVersion(userId, body))
      : await resumeVersionService.createVersion(userId, body);

    if (body.jobDescriptionText) {
      await consumeCredits("jd_match", Date.now() - startedAt);
      // Recorded only after the analysis genuinely succeeded.
      await recordUsage(userId, "JD_MATCHES");
    }

    return NextResponse.json({ version });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    console.error(`${LOG_PREFIX} Creation failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create resume version" }, { status: 422 });
  }
}
