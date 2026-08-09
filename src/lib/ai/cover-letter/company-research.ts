import { JobDescription } from "../job-description/jd-schema";

/**
 * Deterministic extraction — no LLM call, and never fabricates a
 * real-world fact about the company. There's no web-search tool in
 * scope for this milestone, and inventing "recent news"/funding/product
 * facts about a real company would be a severe fabrication risk this
 * arc has never allowed anywhere else. This only ever reflects what the
 * parsed JD itself already states — the sole source cover-generator.ts
 * is allowed to draw on for "Why Company" content.
 */
export function deriveCompanyTalkingPoints(jd: JobDescription, companyName: string): string[] {
  const points: string[] = [];

  if (jd.domain) {
    points.push(`${companyName} operates in the ${jd.domain} domain.`);
  }

  if (jd.responsibilities.length > 0) {
    points.push(`The role's stated responsibilities include: ${jd.responsibilities.slice(0, 3).join("; ")}.`);
  }

  const stack = Array.from(
    new Set([...jd.programmingLanguages, ...jd.frameworks, ...jd.cloud, ...jd.databases, ...jd.tools])
  ).slice(0, 8);

  if (stack.length > 0) {
    points.push(`The team's stated technology stack includes: ${stack.join(", ")}.`);
  }

  if (jd.mandatorySkills.length > 0) {
    points.push(`Skills the role explicitly requires: ${jd.mandatorySkills.slice(0, 5).join(", ")}.`);
  }

  if (jd.softSkills.length > 0) {
    points.push(`Soft skills the role values: ${jd.softSkills.slice(0, 4).join(", ")}.`);
  }

  return points;
}
