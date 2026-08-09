import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import type { SessionExportSections } from "./build-session-sections";

function transcriptParagraphs(sections: SessionExportSections): Paragraph[] {
  if (sections.transcript.length === 0) return [];

  const paragraphs: Paragraph[] = [new Paragraph({ text: "Transcript", heading: HeadingLevel.HEADING_1 })];

  sections.transcript.forEach((turn, index) => {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Q${index + 1} [${turn.type} / ${turn.difficulty}] — Score: ${turn.score}/100` })],
      }),
      new Paragraph({ children: [new TextRun({ text: `Question: ${turn.question}`, bold: true })] }),
      new Paragraph({ text: `Your answer: ${turn.answerText || "(skipped)"}` }),
      new Paragraph({ text: `A stronger answer: ${turn.betterAnswer}` })
    );
  });

  return paragraphs;
}

function bulletSection(title: string, items: string[]): Paragraph[] {
  if (items.length === 0) return [];

  return [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }), ...items.map((item) => new Paragraph({ text: item, bullet: { level: 0 } }))];
}

export async function renderSessionDocx(sections: SessionExportSections): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: `Mock Interview Report — ${sections.candidateName}`, heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({ text: `${sections.interviewType} interview for: ${sections.targetRole}`, italics: true })],
          }),
          new Paragraph({ text: `Overall Score: ${sections.overallScore}/100`, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `Interview Readiness: ${sections.interviewReadiness}/100`, heading: HeadingLevel.HEADING_1 }),
          ...bulletSection(
            "Category Scores",
            sections.categoryScores.map(({ label, score }) => `${label}: ${score}/100`)
          ),
          ...transcriptParagraphs(sections),
          ...bulletSection("Strengths", sections.strengths),
          ...bulletSection("Weaknesses", sections.weaknesses),
          ...bulletSection("Top Improvements", sections.topImprovements),
          ...bulletSection("Questions Missed", sections.questionsMissed),
          ...(sections.learningRoadmap.length > 0
            ? [
                new Paragraph({ text: "Learning Roadmap", heading: HeadingLevel.HEADING_1 }),
                ...sections.learningRoadmap.flatMap((plan) => [
                  new Paragraph({ text: `${plan.days}-Day Plan`, heading: HeadingLevel.HEADING_2 }),
                  ...plan.topics.map((topic) => new Paragraph({ text: topic, bullet: { level: 0 } })),
                ]),
              ]
            : []),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
