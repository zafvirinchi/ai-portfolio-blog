import { Document, HeadingLevel, Packer, Paragraph } from "docx";

import type { RewriteExportSections } from "./build-rewrite-sections";

function listParagraphs(title: string, items: string[]): Paragraph[] {
  if (items.length === 0) return [];

  return [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    ...items.map((item) => new Paragraph({ text: item, bullet: { level: 0 } })),
  ];
}

export async function renderRewriteDocx(sections: RewriteExportSections): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: `${sections.candidateName} — Rewritten Resume`, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: "Professional Summary", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: sections.summary }),
          ...listParagraphs("Experience", sections.experience),
          ...listParagraphs("Projects", sections.projects),
          ...listParagraphs("Skills", sections.skills),
          ...listParagraphs("Achievements", sections.achievements),
          ...listParagraphs("Certifications", sections.certifications),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
