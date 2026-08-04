import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import type { OptimizedResumeSections } from "./build-optimized-resume";

export async function renderOptimizedResumeDocx(sections: OptimizedResumeSections): Promise<Buffer> {
  const bulletParagraphs = (bullets: string[]) =>
    bullets.length > 0
      ? bullets.map((bullet) => new Paragraph({ text: bullet, bullet: { level: 0 } }))
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
          new Paragraph({ text: sections.skills.join(", ") || "—" }),
          new Paragraph({ text: "Experience Highlights (Optimized)", heading: HeadingLevel.HEADING_1 }),
          ...bulletParagraphs(sections.experienceBullets),
          ...(sections.projectBullets.length > 0
            ? [
                new Paragraph({ text: "Project Highlights (Optimized)", heading: HeadingLevel.HEADING_1 }),
                ...bulletParagraphs(sections.projectBullets),
              ]
            : []),
          ...(sections.missingSkills.length > 0
            ? [
                new Paragraph({ text: "Skills to Develop", heading: HeadingLevel.HEADING_1 }),
                new Paragraph({ text: sections.missingSkills.join(", ") }),
              ]
            : []),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
