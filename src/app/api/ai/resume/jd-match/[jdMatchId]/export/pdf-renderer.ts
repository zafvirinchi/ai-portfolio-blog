import PDFDocument from "pdfkit";

import type { OptimizedResumeSections } from "./build-optimized-resume";

export function renderOptimizedResumePdf(sections: OptimizedResumeSections): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(sections.candidateName, { align: "center" });
    doc.fontSize(11).fillColor("gray").text(`Optimized for: ${sections.targetRole}`, { align: "center" });
    doc.moveDown();
    doc.fillColor("black");

    doc.fontSize(14).text("Professional Summary");
    doc.fontSize(11).text(sections.summary || "—");
    doc.moveDown();

    doc.fontSize(14).text("Skills");
    doc.fontSize(11).text(sections.skills.join(", ") || "—");
    doc.moveDown();

    doc.fontSize(14).text("Experience Highlights (Optimized)");
    if (sections.experienceBullets.length > 0) {
      sections.experienceBullets.forEach((bullet) => doc.fontSize(11).text(`• ${bullet}`));
    } else {
      doc.fontSize(11).text("—");
    }
    doc.moveDown();

    if (sections.projectBullets.length > 0) {
      doc.fontSize(14).text("Project Highlights (Optimized)");
      sections.projectBullets.forEach((bullet) => doc.fontSize(11).text(`• ${bullet}`));
      doc.moveDown();
    }

    if (sections.missingSkills.length > 0) {
      doc.fontSize(14).text("Skills to Develop");
      doc.fontSize(11).text(sections.missingSkills.join(", "));
    }

    doc.end();
  });
}
