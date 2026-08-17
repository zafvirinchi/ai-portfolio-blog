import { NextResponse } from "next/server";

import { fromWebFile, loadDocument } from "@/lib/ai/ingestion/document-loader";
import { parseDocument, normalizeText } from "@/lib/ai/ingestion/document-parser";
import { jobMatchService } from "@/lib/ai/job-match/job-match-service";
import { checkAndRecordUsage, getClientIp } from "@/lib/ai/job-match/rate-limiter";
import { recordUsage, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { getOptionalUserId } from "@/lib/billing/persona-service";

// Parses the resume, then makes two OpenAI calls (resume extraction is
// inside jobMatchService, plus the job-match analysis itself) — same
// timeout risk as the resume-analyzer route.
export const maxDuration = 60;

async function resolveJobDescriptionText(formData: FormData): Promise<string | null> {
  const jdText = formData.get("jdText");

  if (typeof jdText === "string" && jdText.trim()) {
    return jdText.trim();
  }

  const jdFile = formData.get("jdFile");

  if (jdFile instanceof File) {
    const raw = await fromWebFile(jdFile);
    const loaded = loadDocument(raw);
    const parsed = await parseDocument(loaded);
    const normalized = normalizeText(parsed.text);

    return normalized || null;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimit = await checkAndRecordUsage(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `You've reached today's free limit of ${rateLimit.limit} job-match analyses. Please try again tomorrow.`,
        },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const resumeFile = formData.get("resume");

    if (!(resumeFile instanceof File)) {
      return NextResponse.json({ error: "A resume file is required" }, { status: 400 });
    }

    const jobDescription = await resolveJobDescriptionText(formData);

    if (!jobDescription) {
      return NextResponse.json(
        { error: "Paste a job description or upload a job description file" },
        { status: 400 }
      );
    }

    // Phase 18 Milestone 5 — additive to the pre-existing IP-based daily
    // rate limit above (which stays exactly as-is for anonymous
    // callers). JD_MATCHES is the same pooled metric resume.jd.match/
    // job.analyzer also draw from — a no-op for anonymous requests.
    const platformUserId = await getOptionalUserId();
    if (platformUserId) await requireQuota(platformUserId, "JD_MATCHES");

    const resumeInput = await fromWebFile(resumeFile);
    const result = await jobMatchService.analyze(resumeInput, jobDescription);
    if (platformUserId) await recordUsage(platformUserId, "JD_MATCHES");

    return NextResponse.json(result);
  } catch (error) {
    console.error("[job-match] API route failed", error);

    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job match analysis failed" },
      { status: 422 }
    );
  }
}
