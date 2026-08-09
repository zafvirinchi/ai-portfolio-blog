import { Workbook } from "exceljs";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { jobService } from "@/lib/ai/recruitment/job-service";
import { computeAnalytics } from "@/lib/ai/recruitment/pipeline-analytics";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

// No dedicated export file exists in this milestone's 11-file package
// list — unlike Milestone 8's own candidate-export.ts, Hiring/Pipeline
// Report rendering lives directly in this route. "Candidate Report"
// stays PDF-only, reusing Milestone 8's own renderer (see
// jobs/[jobId]/pipeline/[candidateId]/export/route.ts).

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildPipelineRows(jobId: string) {
  const pipelineCandidates = pipelineService.list(jobId);
  const allCandidates = candidateService.list();

  return pipelineCandidates.map((pc) => {
    const summary = allCandidates.find((candidate) => candidate.candidateId === pc.candidateId);

    return {
      name: summary?.name ?? "Unknown",
      stage: pc.stage,
      atsScore: summary?.scores.atsScore?.toString() ?? "",
      jdMatch: summary?.scores.jdMatch?.toString() ?? "",
      resumeScore: summary?.scores.resumeScore?.toString() ?? "",
      assignedRecruiter: pc.assignedRecruiter ?? "",
      hiringManager: pc.hiringManager ?? "",
    };
  });
}

const PIPELINE_COLUMNS = ["Name", "Stage", "ATS Score", "JD Match", "Resume Score", "Assigned Recruiter", "Hiring Manager"];

function renderPipelineCsv(jobId: string): string {
  const rows = buildPipelineRows(jobId);
  const header = PIPELINE_COLUMNS.map(csvEscape).join(",");
  const body = rows.map((row) => [row.name, row.stage, row.atsScore, row.jdMatch, row.resumeScore, row.assignedRecruiter, row.hiringManager].map(csvEscape).join(","));

  return [header, ...body].join("\n");
}

async function renderPipelineExcel(jobId: string): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Pipeline");
  sheet.columns = PIPELINE_COLUMNS.map((header) => ({ header, key: header, width: 22 }));

  buildPipelineRows(jobId).forEach((row) => {
    sheet.addRow({
      Name: row.name,
      Stage: row.stage,
      "ATS Score": row.atsScore,
      "JD Match": row.jdMatch,
      "Resume Score": row.resumeScore,
      "Assigned Recruiter": row.assignedRecruiter,
      "Hiring Manager": row.hiringManager,
    });
  });
  sheet.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function renderPipelinePdf(jobId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const job = jobService.get(jobId);
    doc.fontSize(16).text(`Pipeline Report — ${job?.title ?? jobId}`);
    doc.fontSize(9).fillColor("gray").text(`Generated ${new Date().toLocaleString()}`);
    doc.fillColor("black").moveDown();

    buildPipelineRows(jobId).forEach((row) => {
      doc.fontSize(11).text(`${row.name} — ${row.stage}`);
      doc.fontSize(8).text(`ATS ${row.atsScore || "N/A"} | JD Match ${row.jdMatch || "N/A"} | Resume Score ${row.resumeScore || "N/A"}`);
      doc.fontSize(8).text(`Recruiter: ${row.assignedRecruiter || "unassigned"} | Hiring Manager: ${row.hiringManager || "unassigned"}`);
      doc.moveDown(0.5);
    });

    doc.end();
  });
}

function buildHiringRows(jobId: string | null) {
  const pipelineCandidates = jobId ? pipelineService.list(jobId) : pipelineService.listAll();
  const analytics = computeAnalytics(pipelineCandidates, jobId);

  return {
    analytics,
    summaryRows: [
      ["Applications", analytics.applications.toString()],
      ["Shortlisted", analytics.shortlisted.toString()],
      ["Rejected", analytics.rejected.toString()],
      ["Offers", analytics.offers.toString()],
      ["Hired", analytics.hired.toString()],
      ["Average ATS", analytics.averageAts?.toString() ?? "N/A"],
      ["Average JD Match", analytics.averageJdMatch?.toString() ?? "N/A"],
      ["Average Time To Hire (days)", analytics.averageTimeToHireDays?.toString() ?? "N/A"],
      ["Conversion Rate (%)", analytics.conversionRate?.toString() ?? "N/A"],
    ],
  };
}

function renderHiringCsv(jobId: string | null): string {
  const { summaryRows, analytics } = buildHiringRows(jobId);
  const lines = ["Metric,Value", ...summaryRows.map((row) => row.map(csvEscape).join(","))];
  lines.push("", "Stage,Funnel Count");
  analytics.hiringFunnel.forEach((entry) => lines.push(`${csvEscape(entry.stage)},${entry.count}`));

  return lines.join("\n");
}

async function renderHiringExcel(jobId: string | null): Promise<Buffer> {
  const { summaryRows, analytics } = buildHiringRows(jobId);
  const workbook = new Workbook();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [{ header: "Metric", key: "metric", width: 28 }, { header: "Value", key: "value", width: 16 }];
  summaryRows.forEach(([metric, value]) => summarySheet.addRow({ metric, value }));
  summarySheet.getRow(1).font = { bold: true };

  const funnelSheet = workbook.addWorksheet("Hiring Funnel");
  funnelSheet.columns = [{ header: "Stage", key: "stage", width: 24 }, { header: "Count", key: "count", width: 12 }];
  analytics.hiringFunnel.forEach((entry) => funnelSheet.addRow({ stage: entry.stage, count: entry.count }));
  funnelSheet.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function renderHiringPdf(jobId: string | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const job = jobId ? jobService.get(jobId) : null;
    const { summaryRows, analytics } = buildHiringRows(jobId);

    doc.fontSize(16).text(`Hiring Report — ${job ? job.title : "All Jobs"}`);
    doc.fontSize(9).fillColor("gray").text(`Generated ${new Date().toLocaleString()}`);
    doc.fillColor("black").moveDown();

    summaryRows.forEach(([metric, value]) => doc.fontSize(11).text(`${metric}: ${value}`));
    doc.moveDown();

    doc.fontSize(13).text("Hiring Funnel");
    analytics.hiringFunnel.forEach((entry) => doc.fontSize(10).text(`${entry.stage}: ${entry.count}`));

    doc.end();
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const report = url.searchParams.get("report") ?? "hiring";
  const jobId = url.searchParams.get("jobId");

  try {
    if (report === "pipeline") {
      if (!jobId) {
        return NextResponse.json({ error: "jobId is required for a pipeline report" }, { status: 400 });
      }

      if (format === "excel") {
        return new NextResponse(new Uint8Array(await renderPipelineExcel(jobId)), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="pipeline-report.xlsx"',
          },
        });
      }

      if (format === "pdf") {
        return new NextResponse(new Uint8Array(await renderPipelinePdf(jobId)), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="pipeline-report.pdf"' },
        });
      }

      return new NextResponse(renderPipelineCsv(jobId), {
        headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="pipeline-report.csv"' },
      });
    }

    if (format === "excel") {
      return new NextResponse(new Uint8Array(await renderHiringExcel(jobId)), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="hiring-report.xlsx"',
        },
      });
    }

    if (format === "pdf") {
      return new NextResponse(new Uint8Array(await renderHiringPdf(jobId)), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="hiring-report.pdf"' },
      });
    }

    return new NextResponse(renderHiringCsv(jobId), {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="hiring-report.csv"' },
    });
  } catch (error) {
    console.error("[recruitment] Export route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500 });
  }
}
