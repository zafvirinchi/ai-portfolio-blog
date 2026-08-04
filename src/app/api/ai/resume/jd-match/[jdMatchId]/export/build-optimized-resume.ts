import type { JdMatchRecord } from "@/lib/ai/job-description/jd-types";

// Shared "optimized resume -> structured sections" formatter — every
// export format (Markdown/PDF/DOCX) renders from this same object, so
// they can never drift from each other. Note: optimizedExperience/
// optimizedProjects are flat rewritten-bullet lists (not regrouped back
// under their original employer/dates) — a deliberate simplification for
// this milestone, documented in the milestone doc.

export interface OptimizedResumeSections {
  candidateName: string;
  targetRole: string;
  summary: string;
  skills: string[];
  experienceBullets: string[];
  projectBullets: string[];
  missingSkills: string[];
}

export function buildOptimizedResumeSections(record: JdMatchRecord, candidateName: string): OptimizedResumeSections {
  const { jobDescription, matchResult } = record;

  const targetRole = [jobDescription.jobTitle, jobDescription.companyName].filter(Boolean).join(" at ") || "this role";

  return {
    candidateName,
    targetRole,
    summary: matchResult.optimizedSummary,
    skills: matchResult.optimizedSkills,
    experienceBullets: matchResult.optimizedExperience.map((bullet) => bullet.optimized),
    projectBullets: matchResult.optimizedProjects.map((bullet) => bullet.optimized),
    missingSkills: matchResult.missingKeywordsSection,
  };
}

export function renderOptimizedResumeMarkdown(sections: OptimizedResumeSections): string {
  const lines: string[] = [
    `# ${sections.candidateName}`,
    `*Optimized for: ${sections.targetRole}*`,
    "",
    "## Professional Summary",
    sections.summary,
    "",
    "## Skills",
    sections.skills.join(", ") || "—",
    "",
    "## Experience Highlights (Optimized)",
    ...(sections.experienceBullets.length > 0 ? sections.experienceBullets.map((bullet) => `- ${bullet}`) : ["—"]),
  ];

  if (sections.projectBullets.length > 0) {
    lines.push("", "## Project Highlights (Optimized)", ...sections.projectBullets.map((bullet) => `- ${bullet}`));
  }

  if (sections.missingSkills.length > 0) {
    lines.push("", "## Skills to Develop", sections.missingSkills.join(", "));
  }

  return lines.join("\n");
}
