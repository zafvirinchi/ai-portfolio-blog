import type { JobDescription } from "@/lib/ai/job-description/jd-schema";
import type { ResumeOptimizerResult } from "@/lib/ai/job-description/resume-optimizer-schema";

// Shared "optimizer result -> structured sections" formatter — every
// export format (Markdown/PDF/DOCX) renders from this same object, so
// they can never drift from each other. New, standalone from Milestone
// 4's build-optimized-resume.ts (not modified) — this one's section
// shape includes categorized skills and a separate achievements section.

export interface OptimizerExportSections {
  candidateName: string;
  targetRole: string;
  summary: string;
  skillGroups: { category: string; skills: string[] }[];
  experienceBullets: string[];
  projectBullets: string[];
  achievementBullets: string[];
  formattingSuggestions: { area: string; suggestion: string }[];
}

export function buildOptimizerExportSections(
  result: ResumeOptimizerResult,
  jobDescription: JobDescription,
  candidateName: string
): OptimizerExportSections {
  const targetRole = [jobDescription.jobTitle, jobDescription.companyName].filter(Boolean).join(" at ") || "this role";

  return {
    candidateName,
    targetRole,
    summary: result.optimizedSummary,
    skillGroups: result.optimizedSkills.filter((group) => group.skills.length > 0),
    experienceBullets: result.optimizedExperience.map((bullet) => bullet.optimized),
    projectBullets: result.optimizedProjects.map((bullet) => bullet.optimized),
    achievementBullets: result.optimizedAchievements.map((bullet) => bullet.optimized),
    formattingSuggestions: result.formattingSuggestions,
  };
}

export function renderOptimizerMarkdown(sections: OptimizerExportSections): string {
  const lines: string[] = [
    `# ${sections.candidateName}`,
    `*Optimized for: ${sections.targetRole}*`,
    "",
    "## Professional Summary",
    sections.summary || "—",
    "",
    "## Skills",
  ];

  if (sections.skillGroups.length > 0) {
    for (const group of sections.skillGroups) {
      lines.push(`**${group.category}:** ${group.skills.join(", ")}`);
    }
  } else {
    lines.push("—");
  }

  lines.push("", "## Experience Highlights (Optimized)");
  lines.push(...(sections.experienceBullets.length > 0 ? sections.experienceBullets.map((bullet) => `- ${bullet}`) : ["—"]));

  if (sections.projectBullets.length > 0) {
    lines.push("", "## Project Highlights (Optimized)", ...sections.projectBullets.map((bullet) => `- ${bullet}`));
  }

  if (sections.achievementBullets.length > 0) {
    lines.push("", "## Achievements (Optimized)", ...sections.achievementBullets.map((bullet) => `- ${bullet}`));
  }

  if (sections.formattingSuggestions.length > 0) {
    lines.push(
      "",
      "## Formatting Suggestions",
      ...sections.formattingSuggestions.map((item) => `- **${item.area}:** ${item.suggestion}`)
    );
  }

  return lines.join("\n");
}
