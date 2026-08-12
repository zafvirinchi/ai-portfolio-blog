import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  requireUserId,
  applyJdOptimizationSchema,
  resumeVersionService,
  ResumeVersionNotFoundError,
  MasterResumeProtectedError,
  UnauthorizedError,
  buildLegacyOptimizeAccessedLog,
  buildLegacyOptimizeAuthenticatedLog,
  buildLegacyOptimizeCompletedLog,
} from "@/lib/ai/resume-versions";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

const LOG_PREFIX = "[resume-version]";

// Re-runs the existing (unmodified) JD-matching/optimization pipeline
// against an already-created, non-master version — the "Optimize for
// JD" version-detail action. Metered exactly like /api/ai/resume/
// jd-match, since it invokes the same underlying LLM calls.
//
// Phase 13 Milestone 19 audit: no current UI calls this route —
// VersionDetail.tsx uses JdOptimizationReview.tsx, which calls
// /jd-optimize/propose + /jd-optimize/apply (the reviewed flow) instead.
// Left in place rather than removed (a route with no known frontend
// caller isn't proof no external caller exists); see
// PHASE13_MILESTONE19_RESUME_OPTIMIZER_CONSOLIDATION.md.
//
// Phase 13 Milestone 20, Part 3/4 — added traffic-audit logging (see
// legacy-optimize-audit-log.ts and
// PHASE13_MILESTONE20_RESUME_OPTIMIZER_SECURITY_AND_LEGACY_ROUTE_AUDIT.md)
// so real-world hits to this legacy route are observable in application
// logs. The log payloads are built by a pure, independently-unit-tested
// function that never includes the request body, job description text,
// resume content, generated output, tokens, or any resolved user/version
// identifier — only a fixed route name plus a timestamp/boolean.
//
// Phase 13 Milestone 21, Part 2/3 — re-audited: still zero repository-
// level callers found. Extended the audit log with an `event` field and
// a "completed" entry (route name + success + durationMs only) fired on
// the guaranteed-success path, so a fully-successful call is
// distinguishable from a mere probe — see
// PHASE13_MILESTONE21_RESUME_ANALYZER_SECURITY_AND_LEGACY_AUDIT.md.
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const accessedLog = buildLegacyOptimizeAccessedLog();
  console.log(accessedLog.message, accessedLog.payload);

  try {
    const userId = await requireUserId();
    const authenticatedLog = buildLegacyOptimizeAuthenticatedLog();
    console.log(authenticatedLog.message, authenticatedLog.payload);
    const { id } = await params;
    const body = applyJdOptimizationSchema.parse(await req.json());

    await checkCredits("jd_match");
    const startedAt = Date.now();

    const version = await withUsageContext("JD_MATCHING", "JD_ANALYSIS", () => resumeVersionService.applyJdOptimization(userId, id, body.jobDescriptionText));

    await consumeCredits("jd_match", Date.now() - startedAt);

    const completedLog = buildLegacyOptimizeCompletedLog(Date.now() - startedAt);
    console.log(completedLog.message, completedLog.payload);

    return NextResponse.json({ version });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof ResumeVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof MasterResumeProtectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    console.error(`${LOG_PREFIX} JD optimization failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to optimize this version" }, { status: 422 });
  }
}
