import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { exportHiringDecisionReportCsv, exportHiringDecisionReportExcel } from "@/lib/ai/recruiter/recruiter-analytics-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { recordUsage, requireFeature, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

// Phase 16 Milestone 9 — extends the existing candidate-list export
// route (Milestone 5) rather than creating parallel routes for each
// new report type. `type` selects what's rendered:
//   - "candidates" (default, unchanged): the existing candidate list,
//     now also filterable by `candidateIds` (§3, "Export Selected").
//   - "hiring-report" (new, §4): the deterministic Hiring Decision
//     Report over getRecruiterAnalytics()'s existing output.
//   - "comparison" (new, §7): the existing same-job comparison table,
//     rendered without re-invoking compare()'s LLM call.
// candidateIds (comma-separated) is NEVER trusted as pre-verified
// ownership — every path below routes through an existing
// ownership-checked service method (listByIds/buildComparisonExport)
// that rejects the whole request on any foreign/nonexistent id.
function parseCandidateIds(url: URL): string[] | undefined {
  const raw = url.searchParams.get("candidateIds");
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const type = url.searchParams.get("type") ?? "candidates";
  const jobId = url.searchParams.get("jobId") ?? undefined;
  const candidateIds = parseCandidateIds(url);

  try {
    const recruiterId = await requireRecruiterId();

    // Phase 18 Milestone 5 — the hiring-decision report is its own
    // feature (recruiter.hiring_report — NONE on Free/Pro, UNLIMITED
    // on Business only), distinct from the candidate-list/comparison
    // exports below (recruiter.export). No shared metric with those,
    // so no quota check here — just a boolean gate.
    if (type === "hiring-report") {
      await requireFeature(recruiterId, "recruiter.hiring_report");

      if (format === "excel") {
        const buffer = await exportHiringDecisionReportExcel(recruiterId, jobId);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="hiring-report.xlsx"`,
          },
        });
      }

      const csv = await exportHiringDecisionReportCsv(recruiterId, jobId);
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="hiring-report.csv"` },
      });
    }

    // Phase 18 Milestone 5 — every export type below is recruiter.export
    // (NONE on Free, LIMITED — RECRUITER_EXPORTS — on Pro, UNLIMITED on
    // Business). requireFeature() catches Free's NONE with an accurate
    // FEATURE_NOT_INCLUDED; requireQuota() then only ever rejects a real
    // Pro-tier limit. One usage unit per export request, recorded after
    // the file actually generates successfully.
    await requireFeature(recruiterId, "recruiter.export");
    await requireQuota(recruiterId, "RECRUITER_EXPORTS");

    if (type === "comparison") {
      if (!candidateIds || candidateIds.length === 0) {
        return NextResponse.json({ error: "candidateIds is required for a comparison export" }, { status: 400 });
      }

      if (format === "excel") {
        const buffer = await candidateService.exportComparisonExcel(recruiterId, candidateIds);
        await recordUsage(recruiterId, "RECRUITER_EXPORTS");
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="comparison.xlsx"`,
          },
        });
      }

      const csv = await candidateService.exportComparisonCsv(recruiterId, candidateIds);
      await recordUsage(recruiterId, "RECRUITER_EXPORTS");
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="comparison.csv"` },
      });
    }

    if (format === "excel") {
      const buffer = await candidateService.exportCandidateListExcel(recruiterId, { jobId, candidateIds });
      await recordUsage(recruiterId, "RECRUITER_EXPORTS");

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="candidates.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const buffer = await candidateService.exportCandidateListPdf(recruiterId, jobId);
      await recordUsage(recruiterId, "RECRUITER_EXPORTS");

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="candidates.pdf"`,
        },
      });
    }

    const csv = await candidateService.exportCandidateListCsv(recruiterId, { jobId, candidateIds });
    await recordUsage(recruiterId, "RECRUITER_EXPORTS");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="candidates.csv"`,
      },
    });
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    // §3/§12 — handleRecruiterRouteError maps CandidateNotFoundError/
    // RecruiterJobNotFoundError to the same 404 every other recruiter
    // route already uses (never a distinct 403, never revealing which
    // id was foreign or whether a jobId exists for someone else).
    return handleRecruiterRouteError(error, "Export failed");
  }
}
