import type { RewriteSection } from "@/lib/ai/resume-rewriter/rewrite-schema";
import type { RewriteRecord } from "@/lib/ai/resume-rewriter/rewrite-types";
import type { Resume } from "@/lib/ai/resume/resume-schema";

// Shared "record -> structured sections" formatter — every export format
// (Markdown/PDF/DOCX/HTML) renders from this same object, same pattern
// every export route in this arc uses. Falls back to the resume's own
// original content for any section the user never touched.

export interface RewriteExportSections {
  candidateName: string;
  summary: string;
  experience: string[];
  projects: string[];
  skills: string[];
  achievements: string[];
  certifications: string[];
}

function sectionOrOriginal(record: RewriteRecord, section: RewriteSection, original: string[]): string[] {
  return record.sections[section]?.current ?? original;
}

export function buildRewriteExportSections(record: RewriteRecord, resume: Resume): RewriteExportSections {
  return {
    candidateName: resume.contact.name ?? "Candidate",
    summary: sectionOrOriginal(record, "summary", [resume.summary ?? ""])[0] ?? "",
    experience: sectionOrOriginal(
      record,
      "experience",
      resume.workExperience.flatMap((job) => job.description)
    ),
    projects: sectionOrOriginal(
      record,
      "projects",
      resume.projects.map((project) => project.description ?? project.name)
    ),
    skills: sectionOrOriginal(record, "skills", [Array.from(new Set([...resume.skills, ...resume.technicalSkills])).join(", ")]),
    achievements: sectionOrOriginal(record, "achievements", resume.achievements),
    certifications: sectionOrOriginal(
      record,
      "certifications",
      resume.certifications.map((cert) => (cert.issuer ? `${cert.name} (${cert.issuer})` : cert.name))
    ),
  };
}

export function renderRewriteMarkdown(sections: RewriteExportSections): string {
  const lines: string[] = [`# ${sections.candidateName} — Rewritten Resume`, "", "## Professional Summary", "", sections.summary, ""];

  if (sections.experience.length > 0) lines.push("## Experience", "", ...sections.experience.map((line) => `- ${line}`), "");
  if (sections.projects.length > 0) lines.push("## Projects", "", ...sections.projects.map((line) => `- ${line}`), "");
  if (sections.skills.length > 0) lines.push("## Skills", "", ...sections.skills.map((line) => `- ${line}`), "");
  if (sections.achievements.length > 0) lines.push("## Achievements", "", ...sections.achievements.map((line) => `- ${line}`), "");
  if (sections.certifications.length > 0) lines.push("## Certifications", "", ...sections.certifications.map((line) => `- ${line}`), "");

  return lines.join("\n");
}
