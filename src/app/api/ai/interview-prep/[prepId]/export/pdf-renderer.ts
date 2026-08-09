import PDFDocument from "pdfkit";

import type { PrepExportSections, QaSection } from "./build-prep-sections";

function renderQaList(doc: PDFKit.PDFDocument, title: string, items: QaSection[]) {
  if (items.length === 0) return;

  doc.fontSize(16).text(title);
  doc.moveDown(0.5);

  for (const item of items) {
    doc.fontSize(12).text(`Q: ${item.question}`, { continued: false });
    doc.fontSize(10).fillColor("gray").text(item.answerText);
    doc.fillColor("black");
    doc.moveDown(0.6);
  }

  doc.moveDown();
}

export function renderPrepPdf(sections: PrepExportSections): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(`Interview Preparation — ${sections.candidateName}`, { align: "center" });
    doc.fontSize(11).fillColor("gray").text(`For: ${sections.targetRole}`, { align: "center" });
    doc.fillColor("black");
    doc.moveDown();

    doc.fontSize(16).text(`Readiness Score: ${sections.readinessScore}/100`);
    doc.moveDown();

    renderQaList(doc, "Technical Questions", sections.technicalQuestions);
    renderQaList(doc, "HR Questions", sections.hrQuestions);
    renderQaList(doc, "Project Questions", sections.projectQuestions);
    renderQaList(doc, "System Design Questions", sections.systemDesignQuestions);

    if (sections.codingRecommendations.length > 0) {
      doc.fontSize(16).text("Coding Practice");
      sections.codingRecommendations.forEach((item) => doc.fontSize(10).text(`• ${item}`));
      doc.moveDown();
    }

    if (sections.weakAreas.length > 0) {
      doc.fontSize(16).text("Weak Areas");
      sections.weakAreas.forEach((item) => doc.fontSize(10).text(`• ${item}`));
      doc.moveDown();
    }

    if (sections.learningRoadmap.length > 0) {
      doc.fontSize(16).text("Learning Roadmap");
      for (const plan of sections.learningRoadmap) {
        doc.fontSize(12).text(`${plan.days}-Day Plan`);
        plan.topics.forEach((topic) => doc.fontSize(10).text(`• ${topic}`));
      }
      doc.moveDown();
    }

    if (sections.cheatSheet.length > 0) {
      doc.fontSize(16).text("Cheat Sheet");
      for (const entry of sections.cheatSheet) {
        doc.fontSize(12).text(entry.technology);
        entry.points.forEach((point) => doc.fontSize(10).text(`• ${point}`));
      }
    }

    doc.end();
  });
}
