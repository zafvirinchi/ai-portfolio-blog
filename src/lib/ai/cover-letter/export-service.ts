import PDFDocument from "pdfkit";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import { Resume } from "../resume/resume-schema";
import { CoverLetterRecord } from "./cover-types";

// Phase 13 Milestone 6's package explicitly names ONE export-service.ts
// file (unlike Milestones 3-5, where export rendering lived as sibling
// files under the API route's own export/ folder) — every format's
// rendering logic lives here, organized under section comments. The API
// export route is a thin caller.

export interface CoverEmailSection {
  audience: string;
  subject: string;
  body: string;
}

export interface CoverLinkedinSection {
  type: string;
  message: string;
}

export interface CoverExportSections {
  candidateName: string;
  companyName: string;
  role: string;
  letterText: string;
  emailSections: CoverEmailSection[];
  linkedinMessages: CoverLinkedinSection[];
}

// ---------------------------------------------------------------------------
// Shared sections builder
// ---------------------------------------------------------------------------

export function buildCoverExportSections(record: CoverLetterRecord, resume: Resume): CoverExportSections {
  const letter = record.acceptedLetter ?? record.letterVariants[0] ?? null;

  return {
    candidateName: resume.contact.name ?? "Candidate",
    companyName: record.companyName,
    role: record.role,
    letterText: letter?.sections.fullText ?? "",
    emailSections: Object.values(record.emails).map((email) => ({
      audience: email.audience,
      subject: email.subject,
      body: email.body,
    })),
    linkedinMessages: (record.linkedinMessages ?? []).map((message) => ({ type: message.type, message: message.message })),
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function renderCoverMarkdown(sections: CoverExportSections): string {
  const lines: string[] = [
    `# Cover Letter — ${sections.candidateName}`,
    `*For: ${sections.role} at ${sections.companyName}*`,
    "",
    sections.letterText,
  ];

  if (sections.emailSections.length > 0) {
    lines.push("", "## Application Email(s)");
    for (const email of sections.emailSections) {
      lines.push("", `### ${email.audience}`, `**Subject:** ${email.subject}`, "", email.body);
    }
  }

  if (sections.linkedinMessages.length > 0) {
    lines.push("", "## LinkedIn Messages");
    for (const message of sections.linkedinMessages) {
      lines.push("", `### ${message.type}`, message.message);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function renderCoverPlainText(sections: CoverExportSections): string {
  const lines: string[] = [
    `Cover Letter — ${sections.candidateName}`,
    `For: ${sections.role} at ${sections.companyName}`,
    "",
    sections.letterText,
  ];

  if (sections.emailSections.length > 0) {
    lines.push("", "APPLICATION EMAIL(S)");
    for (const email of sections.emailSections) {
      lines.push("", email.audience.toUpperCase(), `Subject: ${email.subject}`, "", email.body);
    }
  }

  if (sections.linkedinMessages.length > 0) {
    lines.push("", "LINKEDIN MESSAGES");
    for (const message of sections.linkedinMessages) {
      lines.push("", message.type.toUpperCase(), message.message);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// HTML — self-contained, inline-styled, no external stylesheet/script.
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export function renderCoverHtml(sections: CoverExportSections): string {
  const emailsHtml = sections.emailSections
    .map(
      (email) => `
    <section>
      <h3>${escapeHtml(email.audience)}</h3>
      <p><strong>Subject:</strong> ${escapeHtml(email.subject)}</p>
      <p>${escapeHtml(email.body).replace(/\n/g, "<br/>")}</p>
    </section>`
    )
    .join("\n");

  const linkedinHtml = sections.linkedinMessages
    .map(
      (message) => `
    <section>
      <h3>${escapeHtml(message.type)}</h3>
      <p>${escapeHtml(message.message).replace(/\n/g, "<br/>")}</p>
    </section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(sections.candidateName)} — Cover Letter</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 780px; margin: 40px auto; padding: 0 24px; color: #1f2937; line-height: 1.6; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  h2, h3 { color: #1d4ed8; }
  p { margin: 0 0 12px; }
</style>
</head>
<body>
  <h1>${escapeHtml(sections.candidateName)}</h1>
  <p><em>For: ${escapeHtml(sections.role)} at ${escapeHtml(sections.companyName)}</em></p>
  ${paragraphsHtml(sections.letterText)}
  ${sections.emailSections.length > 0 ? `<h2>Application Email(s)</h2>${emailsHtml}` : ""}
  ${sections.linkedinMessages.length > 0 ? `<h2>LinkedIn Messages</h2>${linkedinHtml}` : ""}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export function renderCoverPdf(sections: CoverExportSections): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(`${sections.candidateName} — Cover Letter`);
    doc.fontSize(10).fillColor("gray").text(`For: ${sections.role} at ${sections.companyName}`);
    doc.fillColor("black");
    doc.moveDown();
    doc.fontSize(11).text(sections.letterText);

    if (sections.emailSections.length > 0) {
      doc.addPage();
      doc.fontSize(16).text("Application Email(s)");
      doc.moveDown(0.5);
      for (const email of sections.emailSections) {
        doc.fontSize(12).text(email.audience);
        doc.fontSize(10).text(`Subject: ${email.subject}`);
        doc.fontSize(10).text(email.body);
        doc.moveDown();
      }
    }

    if (sections.linkedinMessages.length > 0) {
      doc.addPage();
      doc.fontSize(16).text("LinkedIn Messages");
      doc.moveDown(0.5);
      for (const message of sections.linkedinMessages) {
        doc.fontSize(12).text(message.type);
        doc.fontSize(10).text(message.message);
        doc.moveDown();
      }
    }

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

export async function renderCoverDocx(sections: CoverExportSections): Promise<Buffer> {
  const paragraphs: Paragraph[] = [
    new Paragraph({ text: `${sections.candidateName} — Cover Letter`, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `For: ${sections.role} at ${sections.companyName}`, italics: true })] }),
    ...sections.letterText.split(/\n{2,}/).map((paragraph) => new Paragraph({ text: paragraph })),
  ];

  if (sections.emailSections.length > 0) {
    paragraphs.push(new Paragraph({ text: "Application Email(s)", heading: HeadingLevel.HEADING_1 }));

    for (const email of sections.emailSections) {
      paragraphs.push(
        new Paragraph({ text: email.audience, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: `Subject: ${email.subject}`, bold: true })] }),
        new Paragraph({ text: email.body })
      );
    }
  }

  if (sections.linkedinMessages.length > 0) {
    paragraphs.push(new Paragraph({ text: "LinkedIn Messages", heading: HeadingLevel.HEADING_1 }));

    for (const message of sections.linkedinMessages) {
      paragraphs.push(new Paragraph({ text: message.type, heading: HeadingLevel.HEADING_2 }), new Paragraph({ text: message.message }));
    }
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });

  return Packer.toBuffer(doc);
}
