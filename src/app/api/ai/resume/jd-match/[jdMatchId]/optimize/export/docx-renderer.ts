import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import type { OptimizerExportSections } from "./build-optimizer-sections";

export async function renderOptimizerDocx(sections: OptimizerExportSections): Promise<Buffer> {
  const bulletParagraphs = (bullets: string[]) =>
    bullets.length > 0
      ? bullets.map((bullet) => new Paragraph({ text: bullet, bullet: { level: 0 } }))
      : [new Paragraph({ text: "—" })];

  const skillParagraphs =
    sections.skillGroups.length > 0
      ? sections.skillGroups.map(
          (group) =>
            new Paragraph({
              children: [
                new TextRun({ text: `${group.category}: `, bold: true }),
                new TextRun({ text: group.skills.join(", ") }),
              ],
            })
        )
      : [new Paragraph({ text: "—" })];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: sections.candidateName, heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({ text: `Optimized for: ${sections.targetRole}`, italics: true })],
          }),
          new Paragraph({ text: "Professional Summary", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: sections.summary || "—" }),
          new Paragraph({ text: "Skills", heading: HeadingLevel.HEADING_1 }),
          ...skillParagraphs,
          new Paragraph({ text: "Experience Highlights (Optimized)", heading: HeadingLevel.HEADING_1 }),
          ...bulletParagraphs(sections.experienceBullets),
          ...(sections.projectBullets.length > 0
            ? [
                new Paragraph({ text: "Project Highlights (Optimized)", heading: HeadingLevel.HEADING_1 }),
                ...bulletParagraphs(sections.projectBullets),
              ]
            : []),
          ...(sections.achievementBullets.length > 0
            ? [
                new Paragraph({ text: "Achievements (Optimized)", heading: HeadingLevel.HEADING_1 }),
                ...bulletParagraphs(sections.achievementBullets),
              ]
            : []),
          ...(sections.formattingSuggestions.length > 0
            ? [
                new Paragraph({ text: "Formatting Suggestions", heading: HeadingLevel.HEADING_1 }),
                ...sections.formattingSuggestions.map(
                  (item) =>
                    new Paragraph({
                      children: [
                        new TextRun({ text: `${item.area}: `, bold: true }),
                        new TextRun({ text: item.suggestion }),
                      ],
                      bullet: { level: 0 },
                    })
                ),
              ]
            : []),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
