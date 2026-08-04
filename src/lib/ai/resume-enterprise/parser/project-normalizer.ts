import { TECHNOLOGY_DICTIONARY } from "../ats";
import { ResumeProject } from "../resume-schema";
import { NormalizedProject } from "./parser-types";

// Phase 12 Milestone 5. `tools` isn't a field the Milestone 1 schema
// captures separately from `technologies` — split heuristically using
// ATS's TECHNOLOGY_DICTIONARY categories (read-only reuse, same as
// certification-normalizer.ts): DevOps/Testing-tagged entries count as
// tools, everything else stays a technology.

const TOOL_CATEGORIES = new Set(["DevOps", "Testing"]);

function splitTechnologiesAndTools(technologies: string[]): { technologies: string[]; tools: string[] } {
  const tools: string[] = [];
  const remaining: string[] = [];

  for (const tech of technologies) {
    const lower = tech.toLowerCase();
    const dictionaryEntry = TECHNOLOGY_DICTIONARY.find(
      (entry) => entry.name.toLowerCase() === lower || entry.aliases.some((alias) => alias.toLowerCase() === lower)
    );

    if (dictionaryEntry && TOOL_CATEGORIES.has(dictionaryEntry.category)) {
      tools.push(tech);
    } else {
      remaining.push(tech);
    }
  }

  return { technologies: remaining, tools };
}

function extractTeamSize(texts: string[]): number | null {
  for (const text of texts) {
    const match = text.match(/team of\s+(\d{1,3})/i);
    if (match) return Number(match[1]);
  }
  return null;
}

export function normalizeProjects(entries: ResumeProject[]): NormalizedProject[] {
  return entries.map((project) => {
    const { technologies, tools } = splitTechnologiesAndTools(project.technologies);

    return {
      name: project.projectName,
      organization: project.client,
      role: project.role,
      duration: project.duration,
      description: project.description,
      technologies,
      tools,
      teamSize: extractTeamSize([project.description ?? "", ...project.responsibilities, ...project.achievements]),
      responsibilities: project.responsibilities,
      achievements: project.achievements,
    };
  });
}
