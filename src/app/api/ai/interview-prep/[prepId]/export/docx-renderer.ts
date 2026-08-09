import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import type { PrepExportSections, QaSection } from "./build-prep-sections";

function qaListParagraphs(title: string, items: QaSection[]): Paragraph[] {
  if (items.length === 0) return [];

  const paragraphs: Paragraph[] = [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 })];

  for (const item of items) {
    paragraphs.push(
      new Paragraph({ children: [new TextRun({ text: `Q: ${item.question}`, bold: true })] }),
      new Paragraph({ text: item.answerText })
    );
  }

  return paragraphs;
}

export async function renderPrepDocx(sections: PrepExportSections): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: `Interview Preparation — ${sections.candidateName}`, heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({ text: `For: ${sections.targetRole}`, italics: true })],
          }),
          new Paragraph({ text: `Readiness Score: ${sections.readinessScore}/100`, heading: HeadingLevel.HEADING_1 }),
          ...qaListParagraphs("Technical Questions", sections.technicalQuestions),
          ...qaListParagraphs("HR Questions", sections.hrQuestions),
          ...qaListParagraphs("Project Questions", sections.projectQuestions),
          ...qaListParagraphs("System Design Questions", sections.systemDesignQuestions),
          ...(sections.codingRecommendations.length > 0
            ? [
                new Paragraph({ text: "Coding Practice", heading: HeadingLevel.HEADING_1 }),
                ...sections.codingRecommendations.map((item) => new Paragraph({ text: item, bullet: { level: 0 } })),
              ]
            : []),
          ...(sections.weakAreas.length > 0
            ? [
                new Paragraph({ text: "Weak Areas", heading: HeadingLevel.HEADING_1 }),
                ...sections.weakAreas.map((item) => new Paragraph({ text: item, bullet: { level: 0 } })),
              ]
            : []),
          ...(sections.learningRoadmap.length > 0
            ? [
                new Paragraph({ text: "Learning Roadmap", heading: HeadingLevel.HEADING_1 }),
                ...sections.learningRoadmap.flatMap((plan) => [
                  new Paragraph({ text: `${plan.days}-Day Plan`, heading: HeadingLevel.HEADING_2 }),
                  ...plan.topics.map((topic) => new Paragraph({ text: topic, bullet: { level: 0 } })),
                ]),
              ]
            : []),
          ...(sections.cheatSheet.length > 0
            ? [
                new Paragraph({ text: "Cheat Sheet", heading: HeadingLevel.HEADING_1 }),
                ...sections.cheatSheet.flatMap((entry) => [
                  new Paragraph({ text: entry.technology, heading: HeadingLevel.HEADING_2 }),
                  ...entry.points.map((point) => new Paragraph({ text: point, bullet: { level: 0 } })),
                ]),
              ]
            : []),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
