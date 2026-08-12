import { Workbook } from "exceljs";
import PDFDocument from "pdfkit";

import { buildInterviewEligibility } from "./candidate-interview";
import { RecruiterAnalytics } from "./recruiter-analytics-types";
import { RecruiterJobRecord } from "./recruiter-job-types";
import { CandidateProfile, CandidateSummary, ComparisonRow, DecisionHistoryEntry } from "./candidate-types";

// Phase 13 Milestone 8's package explicitly names ONE candidate-export.ts
// file — every format's rendering logic lives here, same precedent as
// Milestones 6/7's single export-service.ts. Phase 16 Milestone 9 adds
// the Hiring Decision Report and Comparison renderers here too, rather
// than a second export engine.

const EVALUATION_STATUS_LABEL: Record<CandidateSummary["evaluationStatus"], string> = {
  not_evaluated: "Not Evaluated",
  complete: "Evaluated",
  stale: "Stale",
};

/**
 * Phase 16 Milestone 9, §1 — the additional per-candidate context
 * LIST_COLUMNS' new fields need beyond a bare CandidateSummary. Built
 * once per export call by candidate-service.ts's buildExportContext(),
 * never fetched per-row. All three maps are optional so every existing
 * caller of renderCandidateListCsv/Excel (none currently outside this
 * package) keeps working without passing one.
 */
export interface CandidateExportContext {
  jobsById?: Map<string, RecruiterJobRecord>;
  matchDetailsByCandidateId?: Map<string, { matchedSkills: string[]; missingSkills: string[]; educationScore: number | null; certificationScore: number | null }>;
  decisionHistoryByCandidateId?: Map<string, DecisionHistoryEntry[]>;
}

function latestDecision(ctx: CandidateExportContext, candidateId: string): DecisionHistoryEntry | null {
  const history = ctx.decisionHistoryByCandidateId?.get(candidateId);
  return history && history.length > 0 ? history[history.length - 1] : null;
}

const LIST_COLUMNS: { header: string; get: (candidate: CandidateSummary, ctx: CandidateExportContext) => string }[] = [
  { header: "Name", get: (c) => c.name },
  { header: "Email", get: (c) => c.email ?? "" },
  { header: "Phone", get: (c) => c.phone ?? "" },
  { header: "Job", get: (c, ctx) => (c.jobId ? ctx.jobsById?.get(c.jobId)?.title ?? "" : "") },
  { header: "Job Company", get: (c, ctx) => (c.jobId ? ctx.jobsById?.get(c.jobId)?.company ?? "" : "") },
  { header: "Current Role", get: (c) => c.currentRole ?? "" },
  { header: "Experience (yrs)", get: (c) => c.experienceYears?.toString() ?? "" },
  { header: "ATS Score", get: (c) => c.scores.atsScore?.toString() ?? "" },
  { header: "JD Match", get: (c) => c.scores.jdMatch?.toString() ?? "" },
  { header: "Resume Score", get: (c) => c.scores.resumeScore?.toString() ?? "" },
  { header: "Candidate Fit", get: (c) => c.fitScore.toString() },
  { header: "Fit Level", get: (c) => c.fitLevel },
  { header: "Evaluation Status", get: (c) => EVALUATION_STATUS_LABEL[c.evaluationStatus] },
  { header: "Evaluated At", get: (c) => (c.evaluatedAt ? new Date(c.evaluatedAt).toISOString() : "") },
  { header: "Skills Match", get: (c, ctx) => ctx.matchDetailsByCandidateId?.get(c.candidateId)?.matchedSkills.join("; ") ?? "" },
  { header: "Missing Skills", get: (c, ctx) => ctx.matchDetailsByCandidateId?.get(c.candidateId)?.missingSkills.join("; ") ?? "" },
  { header: "Education Match", get: (c, ctx) => ctx.matchDetailsByCandidateId?.get(c.candidateId)?.educationScore?.toString() ?? "" },
  { header: "Certification Match", get: (c) => c.scores.certificationScore?.toString() ?? "" },
  { header: "Interview Readiness", get: (c) => c.scores.interviewReadiness?.toString() ?? "" },
  { header: "Interview Eligible", get: (c) => (buildInterviewEligibility(c).eligible ? "Yes" : "No") },
  { header: "Recommended Action", get: (c) => c.recommendedAction },
  { header: "Location", get: (c) => c.location ?? "" },
  { header: "Notice Period", get: (c) => c.noticePeriod ?? "" },
  { header: "Current Company", get: (c) => c.currentCompany ?? "" },
  { header: "Expected Salary", get: (c) => c.expectedSalary ?? "" },
  { header: "Status", get: (c) => c.status },
  { header: "Decision", get: (c) => c.status },
  { header: "Last Decision Date", get: (c, ctx) => {
    const decision = latestDecision(ctx, c.candidateId);
    return decision ? new Date(decision.timestamp).toISOString() : "";
  } },
  { header: "Last Decision Note", get: (c, ctx) => latestDecision(ctx, c.candidateId)?.note ?? "" },
];

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Phase 16 Milestone 5, §19 — CSV (unlike the .xlsx export below, whose
// cells carry an explicit type in the OOXML format) has no cell-type
// metadata: spreadsheet apps heuristically treat ANY cell text starting
// with =, +, -, or @ as a formula to evaluate on open, regardless of
// where that text came from (here: a candidate's own resume-derived
// name/company/etc., which this app never controls or sanitizes at
// upload time). A leading apostrophe is the standard mitigation —
// every major spreadsheet app renders it as a literal string prefix,
// never as part of the displayed value, and never evaluates what
// follows.
const FORMULA_INJECTION_PREFIXES = ["=", "+", "-", "@"];

function neutralizeFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

function csvEscape(value: string): string {
  const safe = neutralizeFormulaInjection(value);
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function renderCandidateListCsv(summaries: CandidateSummary[], ctx: CandidateExportContext = {}): string {
  const header = LIST_COLUMNS.map((col) => csvEscape(col.header)).join(",");
  const rows = summaries.map((summary) => LIST_COLUMNS.map((col) => csvEscape(col.get(summary, ctx))).join(","));
  return [header, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// Excel (.xlsx)
// ---------------------------------------------------------------------------

// Phase 16 Milestone 9, §11 — audited: every cell here is written as a
// plain JS string via sheet.addRow({...}); exceljs serializes these as
// OOXML shared-string cells (type "s"), never as formula cells (type
// "str" with an <f> tag) — this codebase never constructs a
// `{formula: ...}` cell value anywhere. A candidate-controlled string
// like "=1+1" is therefore written to the file as literal text and
// rendered as literal text when Excel OPENS it (Excel only
// re-interprets typed keystrokes as formulas in a live, editable cell —
// not a cell whose XML already declares it a string). Confirmed by a
// round-trip regression test (candidate-export.test.ts) rather than
// asserted from documentation alone. Nothing was changed here per
// §11's own "if already safe, do not unnecessarily modify it."
export async function renderCandidateListExcel(summaries: CandidateSummary[], ctx: CandidateExportContext = {}): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Candidates");

  sheet.columns = LIST_COLUMNS.map((col) => ({ header: col.header, key: col.header, width: 22 }));
  summaries.forEach((summary) => {
    sheet.addRow(Object.fromEntries(LIST_COLUMNS.map((col) => [col.header, col.get(summary, ctx)])));
  });
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Comparison export (Phase 16 Milestone 9, §7) — renders the SAME
// deterministic table candidate-comparison.ts's buildComparisonTable()
// already computes (candidate-service.ts's buildComparisonExport(),
// which never calls the LLM-backed generateComparisonRecommendation()).
// Two supplementary rows (Status, Interview Readiness) are appended
// directly from the already-fetched CandidateSummary — no new fetch.
// ---------------------------------------------------------------------------

function comparisonRows(candidates: CandidateSummary[], table: ComparisonRow[]): { label: string; values: string[] }[] {
  const metricRows = table.map((row) => ({
    label: row.metric,
    values: candidates.map((candidate) => row.values[candidate.candidateId]?.toString() ?? ""),
  }));

  return [
    ...metricRows,
    { label: "Status", values: candidates.map((candidate) => candidate.status) },
    { label: "Interview Readiness", values: candidates.map((candidate) => candidate.scores.interviewReadiness?.toString() ?? "") },
  ];
}

export function renderComparisonCsv(candidates: CandidateSummary[], table: ComparisonRow[]): string {
  const header = ["Metric", ...candidates.map((candidate) => candidate.name)].map(csvEscape).join(",");
  const rows = comparisonRows(candidates, table).map((row) => [row.label, ...row.values].map(csvEscape).join(","));
  return [header, ...rows].join("\n");
}

export async function renderComparisonExcel(candidates: CandidateSummary[], table: ComparisonRow[]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Comparison");

  sheet.columns = [{ header: "Metric", key: "Metric", width: 22 }, ...candidates.map((candidate) => ({ header: candidate.name, key: candidate.candidateId, width: 22 }))];

  comparisonRows(candidates, table).forEach((row) => {
    const record: Record<string, string> = { Metric: row.label };
    candidates.forEach((candidate, index) => {
      record[candidate.candidateId] = row.values[index];
    });
    sheet.addRow(record);
  });
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Hiring Decision Report (Phase 16 Milestone 9, §4-§6/§8) — a pure
// rendering of RecruiterAnalytics (recruiter-analytics.ts's EXISTING,
// already-computed engine — Milestones 6/7/8, never recomputed here).
// Zero LLM calls, zero new metrics.
// ---------------------------------------------------------------------------

function hiringReportRows(analytics: RecruiterAnalytics): { section: string; metric: string; value: string }[] {
  const { overall, conversionRates, interviewFunnel, statusDistribution, topCandidates } = analytics;
  const pct = (value: number | null) => (value !== null ? `${value}%` : "Not available");

  const rows: { section: string; metric: string; value: string }[] = [
    { section: "Pipeline Summary", metric: "Total Candidates", value: overall.totalCandidates.toString() },
    { section: "Pipeline Summary", metric: "Evaluated", value: overall.evaluatedCandidates.toString() },
    { section: "Pipeline Summary", metric: "Shortlisted", value: statusDistribution["Shortlisted"].toString() },
    { section: "Pipeline Summary", metric: "Interviewed", value: interviewFunnel.interviewedCohortCount.toString() },
    { section: "Pipeline Summary", metric: "Hired", value: statusDistribution["Hired"].toString() },
    { section: "Pipeline Summary", metric: "Rejected", value: statusDistribution["Rejected"].toString() },

    { section: "Conversion Metrics", metric: "Evaluation Rate", value: pct(overall.totalCandidates > 0 ? Math.round((overall.evaluatedCandidates / overall.totalCandidates) * 100) : null) },
    { section: "Conversion Metrics", metric: "Shortlist Rate", value: pct(conversionRates.shortlistRate) },
    { section: "Conversion Metrics", metric: "Interview Rate", value: pct(conversionRates.interviewRate) },
    { section: "Conversion Metrics", metric: "Hire Rate", value: pct(conversionRates.hireRate) },
    { section: "Conversion Metrics", metric: "Interview → Hire Rate", value: pct(interviewFunnel.interviewToHireRate) },

    { section: "Decision Breakdown", metric: "Candidates Shortlisted", value: statusDistribution["Shortlisted"].toString() },
    { section: "Decision Breakdown", metric: "Candidates Interviewed", value: interviewFunnel.interviewedCohortCount.toString() },
    { section: "Decision Breakdown", metric: "Candidates Hired", value: statusDistribution["Hired"].toString() },
    { section: "Decision Breakdown", metric: "Candidates Rejected", value: statusDistribution["Rejected"].toString() },
    { section: "Decision Breakdown", metric: "Rejected After Interview", value: interviewFunnel.rejectedAfterInterviewCount.toString() },
    { section: "Decision Breakdown", metric: "Awaiting Decision (Pending Review)", value: statusDistribution["Pending Review"].toString() },

    { section: "Interview Outcome", metric: "Interview Eligible", value: interviewFunnel.interviewEligibleCandidates.toString() },
    { section: "Interview Outcome", metric: "Interviewed", value: interviewFunnel.interviewedCohortCount.toString() },
    { section: "Interview Outcome", metric: "Currently In Interview", value: interviewFunnel.interviewCandidates.toString() },
    { section: "Interview Outcome", metric: "Hired After Interview", value: interviewFunnel.hiredAfterInterviewCount.toString() },
    { section: "Interview Outcome", metric: "Rejected After Interview", value: interviewFunnel.rejectedAfterInterviewCount.toString() },
    {
      section: "Interview Outcome",
      metric: "Awaiting Interview Decision",
      value: Math.max(0, interviewFunnel.interviewedCohortCount - interviewFunnel.hiredAfterInterviewCount - interviewFunnel.rejectedAfterInterviewCount).toString(),
    },
  ];

  topCandidates.forEach((entry, index) => {
    rows.push({
      section: "Top Candidates",
      metric: `#${index + 1} ${entry.summary.name}`,
      value: `Fit ${entry.rankingScore} (${entry.level}) | JD Match ${entry.summary.scores.jdMatch ?? "N/A"} | ATS ${
        entry.summary.scores.atsScore ?? "N/A"
      } | Interview Readiness ${entry.summary.scores.interviewReadiness ?? "N/A"} | Status: ${entry.summary.status}`,
    });
  });

  return rows;
}

export function renderHiringDecisionReportCsv(analytics: RecruiterAnalytics): string {
  const header = ["Section", "Metric", "Value"].map(csvEscape).join(",");
  const rows = hiringReportRows(analytics).map((row) => [row.section, row.metric, row.value].map(csvEscape).join(","));
  return [header, ...rows].join("\n");
}

export async function renderHiringDecisionReportExcel(analytics: RecruiterAnalytics): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Hiring Report");

  sheet.columns = [
    { header: "Section", key: "Section", width: 22 },
    { header: "Metric", key: "Metric", width: 32 },
    { header: "Value", key: "Value", width: 60 },
  ];
  hiringReportRows(analytics).forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// PDF — candidate list (workspace-level table)
// ---------------------------------------------------------------------------

export function renderCandidateListPdf(summaries: CandidateSummary[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Recruiter Workspace — Candidate List");
    doc.fontSize(9).fillColor("gray").text(`Generated ${new Date().toLocaleString()}`);
    doc.fillColor("black").moveDown();

    summaries.forEach((summary) => {
      doc.fontSize(11).text(`${summary.name} — ${summary.status}`);
      doc
        .fontSize(8)
        .text(
          `${summary.currentRole ?? "Role unknown"} at ${summary.currentCompany ?? "unknown company"} | ${
            summary.experienceYears ?? "?"
          } yrs | ${summary.location ?? "location unknown"}`
        );
      doc
        .fontSize(8)
        .text(
          `ATS ${summary.scores.atsScore ?? "N/A"} | JD Match ${summary.scores.jdMatch ?? "N/A"} | Resume Score ${
            summary.scores.resumeScore ?? "N/A"
          } | Tags: ${summary.tags.join(", ") || "none"}`
        );
      doc.moveDown(0.5);
    });

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// PDF — single Candidate Report
// ---------------------------------------------------------------------------

export function renderCandidateReportPdf(profile: CandidateProfile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { summary, resume, record, jdMatchResult } = profile;

    doc.fontSize(20).text(summary.name);
    doc
      .fontSize(11)
      .fillColor("gray")
      .text(`${summary.currentRole ?? "Role unknown"} at ${summary.currentCompany ?? "unknown company"}`);
    doc.fillColor("black").moveDown();

    doc.fontSize(13).text("Contact");
    doc.fontSize(9).text(`Email: ${resume.contact.email ?? "n/a"} | Phone: ${resume.contact.phone ?? "n/a"} | Location: ${resume.contact.location ?? "n/a"}`);
    doc.moveDown();

    doc.fontSize(13).text("Status & Scores");
    doc.fontSize(9).text(`Status: ${record.status} | Tags: ${record.tags.join(", ") || "none"}`);
    doc
      .fontSize(9)
      .text(
        `Resume Score: ${summary.scores.resumeScore ?? "N/A"} | ATS: ${summary.scores.atsScore ?? "N/A"} | JD Match: ${
          summary.scores.jdMatch ?? "N/A"
        } | Overall: ${summary.scores.overallScore ?? "N/A"}`
      );
    doc.moveDown();

    if (resume.summary) {
      doc.fontSize(13).text("Professional Summary");
      doc.fontSize(9).text(resume.summary);
      doc.moveDown();
    }

    if (resume.workExperience.length > 0) {
      doc.fontSize(13).text("Experience");
      resume.workExperience.forEach((job) => {
        doc.fontSize(10).text(`${job.title} — ${job.company}${job.isCurrent ? " (Current)" : ""}`);
        job.description.forEach((bullet) => doc.fontSize(8).text(`• ${bullet}`));
        doc.moveDown(0.3);
      });
      doc.moveDown(0.3);
    }

    if (resume.skills.length > 0) {
      doc.fontSize(13).text("Skills");
      doc.fontSize(9).text(resume.skills.join(", "));
      doc.moveDown();
    }

    if (resume.certifications.length > 0) {
      doc.fontSize(13).text("Certifications");
      resume.certifications.forEach((cert) => doc.fontSize(9).text(`${cert.name}${cert.issuer ? ` — ${cert.issuer}` : ""}`));
      doc.moveDown();
    }

    if (jdMatchResult) {
      doc.addPage();
      doc.fontSize(14).text("JD Match Analysis");
      doc.fontSize(9).text(`Overall match: ${jdMatchResult.overallMatch}% | ATS: ${jdMatchResult.atsScore}`);
      doc.fontSize(9).text(`Matched skills: ${jdMatchResult.matchedSkills.join(", ") || "none"}`);
      doc.fontSize(9).text(`Missing skills: ${jdMatchResult.missingSkills.join(", ") || "none"}`);
    }

    if (record.insights) {
      doc.moveDown();
      doc.fontSize(14).text("AI Insights");
      doc.fontSize(9).text(`Strengths: ${record.insights.strengths.join("; ") || "none"}`);
      doc.fontSize(9).text(`Weaknesses: ${record.insights.weaknesses.join("; ") || "none"}`);
      doc.fontSize(9).text(`Risk factors: ${record.insights.riskFactors.join("; ") || "none"}`);
      doc
        .fontSize(9)
        .text(`Hiring recommendation: ${record.insights.hiringRecommendation.rating} — ${record.insights.hiringRecommendation.explanation}`);
    }

    if (record.notes.length > 0) {
      doc.moveDown();
      doc.fontSize(14).text("Notes");
      record.notes.forEach((note) => doc.fontSize(9).text(`[${note.category}] ${note.text}`));
    }

    doc.end();
  });
}
