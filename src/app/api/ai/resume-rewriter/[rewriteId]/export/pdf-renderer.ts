import PDFDocument from "pdfkit";

import type { RewriteExportSections } from "./build-rewrite-sections";

function renderList(doc: PDFKit.PDFDocument, title: string, items: string[]) {
  if (items.length === 0) return;

  doc.fontSize(16).text(title);
  doc.moveDown(0.3);
  items.forEach((item) => doc.fontSize(10).text(`• ${item}`));
  doc.moveDown();
}

export function renderRewritePdf(sections: RewriteExportSections): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(`${sections.candidateName} — Rewritten Resume`, { align: "center" });
    doc.moveDown();

    doc.fontSize(16).text("Professional Summary");
    doc.moveDown(0.3);
    doc.fontSize(10).text(sections.summary);
    doc.moveDown();

    renderList(doc, "Experience", sections.experience);
    renderList(doc, "Projects", sections.projects);
    renderList(doc, "Skills", sections.skills);
    renderList(doc, "Achievements", sections.achievements);
    renderList(doc, "Certifications", sections.certifications);

    doc.end();
  });
}
