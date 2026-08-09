import PDFDocument from "pdfkit";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import { Resume } from "../resume/resume-schema";
import { CareerInterests, ProjectDescription } from "./linkedin-schema";
import { LinkedinRecord } from "./linkedin-types";

// Phase 13 Milestone 7's package explicitly names ONE export-service.ts
// file (same precedent as Milestone 6's cover-letter export-service.ts)
// — every format's rendering logic lives here, organized under section
// comments. The API export route is a thin format-switch caller.

export interface LinkedinExportSections {
  candidateName: string;
  targetRole: string;
  headline: string;
  about: string;
  experience: { original: string; rewritten: string }[];
  projects: ProjectDescription[];
  skills: { category: string; skills: string[] }[];
  featured: { title: string; detail: string; isGap: boolean }[];
  recommendations: { type: string; message: string }[];
  bannerTagline: string;
  brandingBios: { platform: string; bio: string }[];
  careerInterests: CareerInterests | null;
}

// ---------------------------------------------------------------------------
// Shared sections builder
// ---------------------------------------------------------------------------

export function buildLinkedinExportSections(record: LinkedinRecord, resume: Resume): LinkedinExportSections {
  const headline = record.acceptedHeadlineStyle ? record.headlines[record.acceptedHeadlineStyle] : Object.values(record.headlines)[0];
  const about = record.acceptedAboutStyle ? record.about[record.acceptedAboutStyle] : Object.values(record.about)[0];

  return {
    candidateName: resume.contact.name ?? "Candidate",
    targetRole: record.targetRole ?? "",
    headline: headline?.text ?? "",
    about: about?.text ?? "",
    experience: (record.experience ?? []).map((item) => ({ original: item.original, rewritten: item.rewritten })),
    projects: record.projects ?? [],
    skills: (record.skills ?? []).map((group) => ({ category: group.category, skills: group.skills })),
    featured: (record.featured?.items ?? []).map((item) => ({ title: item.title, detail: item.detail, isGap: item.isGap })),
    recommendations: (record.recommendations ?? []).map((message) => ({ type: message.type, message: message.message })),
    bannerTagline: record.bannerTagline ?? "",
    brandingBios: (record.brandingBios ?? []).map((bio) => ({ platform: bio.platform, bio: bio.bio })),
    careerInterests: record.careerInterests,
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function renderLinkedinMarkdown(sections: LinkedinExportSections): string {
  const lines: string[] = [
    `# ${sections.candidateName} — LinkedIn Profile`,
    `*Targeting: ${sections.targetRole}*`,
    "",
    "## Headline",
    sections.headline || "(not generated yet)",
    "",
    "## About",
    sections.about || "(not generated yet)",
    "",
  ];

  if (sections.experience.length > 0) {
    lines.push("## Experience", "");
    sections.experience.forEach((item) => lines.push(`- ${item.rewritten}`));
    lines.push("");
  }

  if (sections.projects.length > 0) {
    lines.push("## Projects", "");
    for (const project of sections.projects) {
      lines.push(
        `### ${project.name}`,
        `**Problem:** ${project.problem}`,
        `**Solution:** ${project.solution}`,
        `**Architecture:** ${project.architecture}`,
        `**Technology:** ${project.technology.join(", ")}`,
        `**Business Value:** ${project.businessValue}`,
        `**Impact:** ${project.impact}`,
        ""
      );
    }
  }

  if (sections.skills.length > 0) {
    lines.push("## Skills", "");
    for (const group of sections.skills) {
      lines.push(`**${group.category}:** ${group.skills.join(", ")}`);
    }
    lines.push("");
  }

  if (sections.featured.length > 0) {
    lines.push("## Featured", "");
    sections.featured.forEach((item) => lines.push(`- [${item.isGap ? "Suggestion" : "Item"}] ${item.title} — ${item.detail}`));
    lines.push("");
  }

  if (sections.recommendations.length > 0) {
    lines.push("## Networking Messages", "");
    sections.recommendations.forEach((message) => lines.push(`### ${message.type}`, message.message, ""));
  }

  if (sections.bannerTagline || sections.brandingBios.length > 0) {
    lines.push("## Personal Branding", "");
    if (sections.bannerTagline) lines.push(`**Banner tagline:** ${sections.bannerTagline}`, "");
    sections.brandingBios.forEach((bio) => lines.push(`### ${bio.platform} Bio`, bio.bio, ""));
  }

  if (sections.careerInterests) {
    const ci = sections.careerInterests;
    lines.push(
      "## Career Interests",
      "",
      `**Preferred roles:** ${ci.preferredRoles.join(", ") || "none specified"}`,
      `**Preferred industries:** ${ci.preferredIndustries.join(", ") || "none specified"}`,
      `**Preferred locations:** ${ci.preferredLocations.join(", ") || "none specified"}`,
      `**Remote preference:** ${ci.remotePreference ?? "not specified"}`,
      `**Relocation preference:** ${ci.relocationPreference ?? "not specified"}`,
      `**Visa sponsorship:** ${ci.visaSponsorshipStatement ?? "not specified"}`
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Plain text — a normal flowing document (distinct from LinkedIn Ready
// Text below, which is labeled for direct field-by-field copy-paste).
// ---------------------------------------------------------------------------

export function renderLinkedinPlainText(sections: LinkedinExportSections): string {
  const lines: string[] = [
    `${sections.candidateName} — LinkedIn Profile`,
    `Targeting: ${sections.targetRole}`,
    "",
    "HEADLINE",
    sections.headline || "(not generated yet)",
    "",
    "ABOUT",
    sections.about || "(not generated yet)",
    "",
  ];

  if (sections.experience.length > 0) {
    lines.push("EXPERIENCE", "");
    sections.experience.forEach((item) => lines.push(`- ${item.rewritten}`));
    lines.push("");
  }

  if (sections.skills.length > 0) {
    lines.push("SKILLS", "");
    sections.skills.forEach((group) => lines.push(`${group.category}: ${group.skills.join(", ")}`));
    lines.push("");
  }

  if (sections.recommendations.length > 0) {
    lines.push("NETWORKING MESSAGES", "");
    sections.recommendations.forEach((message) => lines.push(`${message.type.toUpperCase()}`, message.message, ""));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// LinkedIn Ready Text — labeled to match LinkedIn's own profile edit
// fields, for direct copy-paste section by section.
// ---------------------------------------------------------------------------

export function renderLinkedinReadyText(sections: LinkedinExportSections): string {
  const lines: string[] = ["HEADLINE:", sections.headline || "(not generated yet)", "", "ABOUT:", sections.about || "(not generated yet)", ""];

  sections.experience.forEach((item, index) => {
    lines.push(`EXPERIENCE ${index + 1} DESCRIPTION:`, item.rewritten, "");
  });

  sections.projects.forEach((project) => {
    lines.push(
      `FEATURED PROJECT — ${project.name}:`,
      `${project.problem} ${project.solution} ${project.architecture} Technologies: ${project.technology.join(", ")}. ${project.businessValue} ${project.impact}`,
      ""
    );
  });

  if (sections.skills.length > 0) {
    lines.push("SKILLS (add each individually):");
    sections.skills.forEach((group) => lines.push(`${group.category}: ${group.skills.join(", ")}`));
    lines.push("");
  }

  if (sections.bannerTagline) lines.push("BANNER TAGLINE:", sections.bannerTagline, "");

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

export function renderLinkedinHtml(sections: LinkedinExportSections): string {
  const experienceHtml = sections.experience.map((item) => `<li>${escapeHtml(item.rewritten)}</li>`).join("\n");
  const skillsHtml = sections.skills
    .map((group) => `<p><strong>${escapeHtml(group.category)}:</strong> ${escapeHtml(group.skills.join(", "))}</p>`)
    .join("\n");
  const projectsHtml = sections.projects
    .map(
      (project) => `
    <section>
      <h3>${escapeHtml(project.name)}</h3>
      <p><strong>Problem:</strong> ${escapeHtml(project.problem)}</p>
      <p><strong>Solution:</strong> ${escapeHtml(project.solution)}</p>
      <p><strong>Architecture:</strong> ${escapeHtml(project.architecture)}</p>
      <p><strong>Technology:</strong> ${escapeHtml(project.technology.join(", "))}</p>
      <p><strong>Business Value:</strong> ${escapeHtml(project.businessValue)}</p>
      <p><strong>Impact:</strong> ${escapeHtml(project.impact)}</p>
    </section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(sections.candidateName)} — LinkedIn Profile</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 780px; margin: 40px auto; padding: 0 24px; color: #1f2937; line-height: 1.6; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  h2, h3 { color: #0a66c2; }
  ul { padding-left: 20px; }
</style>
</head>
<body>
  <h1>${escapeHtml(sections.candidateName)}</h1>
  <p><em>Targeting: ${escapeHtml(sections.targetRole)}</em></p>
  <h2>Headline</h2>
  <p>${escapeHtml(sections.headline || "(not generated yet)")}</p>
  <h2>About</h2>
  <p>${escapeHtml(sections.about || "(not generated yet)").replace(/\n/g, "<br/>")}</p>
  ${sections.experience.length > 0 ? `<h2>Experience</h2><ul>${experienceHtml}</ul>` : ""}
  ${sections.projects.length > 0 ? `<h2>Projects</h2>${projectsHtml}` : ""}
  ${sections.skills.length > 0 ? `<h2>Skills</h2>${skillsHtml}` : ""}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export function renderLinkedinPdf(sections: LinkedinExportSections): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(`${sections.candidateName} — LinkedIn Profile`);
    doc.fontSize(10).fillColor("gray").text(`Targeting: ${sections.targetRole}`);
    doc.fillColor("black");
    doc.moveDown();

    doc.fontSize(14).text("Headline");
    doc.fontSize(10).text(sections.headline || "(not generated yet)");
    doc.moveDown();

    doc.fontSize(14).text("About");
    doc.fontSize(10).text(sections.about || "(not generated yet)");
    doc.moveDown();

    if (sections.experience.length > 0) {
      doc.fontSize(14).text("Experience");
      sections.experience.forEach((item) => doc.fontSize(10).text(`• ${item.rewritten}`));
      doc.moveDown();
    }

    if (sections.skills.length > 0) {
      doc.fontSize(14).text("Skills");
      sections.skills.forEach((group) => doc.fontSize(10).text(`${group.category}: ${group.skills.join(", ")}`));
      doc.moveDown();
    }

    if (sections.projects.length > 0) {
      doc.addPage();
      doc.fontSize(16).text("Projects");
      for (const project of sections.projects) {
        doc.fontSize(12).text(project.name);
        doc.fontSize(9).text(`Problem: ${project.problem}`);
        doc.fontSize(9).text(`Solution: ${project.solution}`);
        doc.fontSize(9).text(`Impact: ${project.impact}`);
        doc.moveDown(0.5);
      }
    }

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

export async function renderLinkedinDocx(sections: LinkedinExportSections): Promise<Buffer> {
  const paragraphs: Paragraph[] = [
    new Paragraph({ text: `${sections.candidateName} — LinkedIn Profile`, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Targeting: ${sections.targetRole}`, italics: true })] }),
    new Paragraph({ text: "Headline", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: sections.headline || "(not generated yet)" }),
    new Paragraph({ text: "About", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: sections.about || "(not generated yet)" }),
  ];

  if (sections.experience.length > 0) {
    paragraphs.push(
      new Paragraph({ text: "Experience", heading: HeadingLevel.HEADING_1 }),
      ...sections.experience.map((item) => new Paragraph({ text: item.rewritten, bullet: { level: 0 } }))
    );
  }

  if (sections.skills.length > 0) {
    paragraphs.push(new Paragraph({ text: "Skills", heading: HeadingLevel.HEADING_1 }));
    for (const group of sections.skills) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: `${group.category}: `, bold: true }), new TextRun(group.skills.join(", "))] }));
    }
  }

  if (sections.projects.length > 0) {
    paragraphs.push(new Paragraph({ text: "Projects", heading: HeadingLevel.HEADING_1 }));
    for (const project of sections.projects) {
      paragraphs.push(
        new Paragraph({ text: project.name, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: `Problem: ${project.problem}` }),
        new Paragraph({ text: `Solution: ${project.solution}` }),
        new Paragraph({ text: `Impact: ${project.impact}` })
      );
    }
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });

  return Packer.toBuffer(doc);
}
