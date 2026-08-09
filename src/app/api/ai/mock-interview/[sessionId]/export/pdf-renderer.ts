import PDFDocument from "pdfkit";

import type { SessionExportSections } from "./build-session-sections";

export function renderSessionPdf(sections: SessionExportSections): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(`Mock Interview Report — ${sections.candidateName}`, { align: "center" });
    doc.fontSize(11).fillColor("gray").text(`${sections.interviewType} interview for: ${sections.targetRole}`, { align: "center" });
    doc.fillColor("black");
    doc.moveDown();

    doc.fontSize(16).text(`Overall Score: ${sections.overallScore}/100`);
    doc.fontSize(16).text(`Interview Readiness: ${sections.interviewReadiness}/100`);
    doc.moveDown();

    if (sections.categoryScores.length > 0) {
      doc.fontSize(16).text("Category Scores");
      sections.categoryScores.forEach(({ label, score }) => doc.fontSize(10).text(`${label}: ${score}/100`));
      doc.moveDown();
    }

    if (sections.transcript.length > 0) {
      doc.fontSize(16).text("Transcript");
      doc.moveDown(0.5);

      sections.transcript.forEach((turn, index) => {
        doc.fontSize(12).text(`Q${index + 1} [${turn.type} / ${turn.difficulty}] — Score: ${turn.score}/100`);
        doc.fontSize(10).text(`Question: ${turn.question}`);
        doc.fontSize(10).fillColor("gray").text(`Your answer: ${turn.answerText || "(skipped)"}`);
        doc.fillColor("black");
        doc.fontSize(10).text(`A stronger answer: ${turn.betterAnswer}`);
        doc.moveDown(0.6);
      });

      doc.moveDown();
    }

    if (sections.strengths.length > 0) {
      doc.fontSize(16).text("Strengths");
      sections.strengths.forEach((item) => doc.fontSize(10).text(`• ${item}`));
      doc.moveDown();
    }

    if (sections.weaknesses.length > 0) {
      doc.fontSize(16).text("Weaknesses");
      sections.weaknesses.forEach((item) => doc.fontSize(10).text(`• ${item}`));
      doc.moveDown();
    }

    if (sections.topImprovements.length > 0) {
      doc.fontSize(16).text("Top Improvements");
      sections.topImprovements.forEach((item) => doc.fontSize(10).text(`• ${item}`));
      doc.moveDown();
    }

    if (sections.questionsMissed.length > 0) {
      doc.fontSize(16).text("Questions Missed");
      sections.questionsMissed.forEach((item) => doc.fontSize(10).text(`• ${item}`));
      doc.moveDown();
    }

    if (sections.learningRoadmap.length > 0) {
      doc.fontSize(16).text("Learning Roadmap");
      for (const plan of sections.learningRoadmap) {
        doc.fontSize(12).text(`${plan.days}-Day Plan`);
        plan.topics.forEach((topic) => doc.fontSize(10).text(`• ${topic}`));
      }
    }

    doc.end();
  });
}
