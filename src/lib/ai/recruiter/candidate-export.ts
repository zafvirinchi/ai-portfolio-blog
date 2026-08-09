import { Workbook } from "exceljs";
import PDFDocument from "pdfkit";

import { CandidateProfile, CandidateSummary } from "./candidate-types";

// Phase 13 Milestone 8's package explicitly names ONE candidate-export.ts
// file — every format's rendering logic lives here, same precedent as
// Milestones 6/7's single export-service.ts.

const LIST_COLUMNS: { header: string; get: (candidate: CandidateSummary) => string }[] = [
  { header: "Name", get: (c) => c.name },
  { header: "Current Role", get: (c) => c.currentRole ?? "" },
  { header: "Experience (yrs)", get: (c) => c.experienceYears?.toString() ?? "" },
  { header: "ATS Score", get: (c) => c.scores.atsScore?.toString() ?? "" },
  { header: "JD Match", get: (c) => c.scores.jdMatch?.toString() ?? "" },
  { header: "Resume Score", get: (c) => c.scores.resumeScore?.toString() ?? "" },
  { header: "Location", get: (c) => c.location ?? "" },
  { header: "Notice Period", get: (c) => c.noticePeriod ?? "" },
  { header: "Current Company", get: (c) => c.currentCompany ?? "" },
  { header: "Expected Salary", get: (c) => c.expectedSalary ?? "" },
  { header: "Status", get: (c) => c.status },
];

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function renderCandidateListCsv(summaries: CandidateSummary[]): string {
  const header = LIST_COLUMNS.map((col) => csvEscape(col.header)).join(",");
  const rows = summaries.map((summary) => LIST_COLUMNS.map((col) => csvEscape(col.get(summary))).join(","));
  return [header, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// Excel (.xlsx)
// ---------------------------------------------------------------------------

export async function renderCandidateListExcel(summaries: CandidateSummary[]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Candidates");

  sheet.columns = LIST_COLUMNS.map((col) => ({ header: col.header, key: col.header, width: 22 }));
  summaries.forEach((summary) => {
    sheet.addRow(Object.fromEntries(LIST_COLUMNS.map((col) => [col.header, col.get(summary)])));
  });
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
