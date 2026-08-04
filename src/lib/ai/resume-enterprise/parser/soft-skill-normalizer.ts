import { EnterpriseResume } from "../resume-schema";

const SOFT_SKILL_ALIASES: Record<string, string> = {
  "team leadership": "Leadership",
  "leadership skills": "Leadership",
  leadership: "Leadership",
  "communication skills": "Communication",
  communication: "Communication",
  "problem-solving": "Problem Solving",
  "problem solving": "Problem Solving",
  mentorship: "Mentoring",
  mentoring: "Mentoring",
  "ownership mindset": "Ownership",
  ownership: "Ownership",
  "decision-making": "Decision Making",
  "decision making": "Decision Making",
  presentation: "Presentation",
  "presentation skills": "Presentation",
  "stakeholder mgmt": "Stakeholder Management",
  "stakeholder management": "Stakeholder Management",
  "conflict resolution": "Conflict Resolution",
  negotiation: "Negotiation",
  "negotiation skills": "Negotiation",
  teamwork: "Teamwork",
  collaboration: "Collaboration",
  adaptability: "Adaptability",
  "time management": "Time Management",
  "critical thinking": "Critical Thinking",
};

function normalizeSoftSkill(raw: string): string {
  const key = raw.trim().toLowerCase();
  return SOFT_SKILL_ALIASES[key] ?? raw.trim();
}

/** Sourced from resume.skills[] groups already tagged "Soft Skills" by Milestone 1's SKILL_CATEGORIES. */
export function extractSoftSkills(resume: EnterpriseResume): string[] {
  const rawSkills = resume.skills.filter((group) => group.category === "Soft Skills").flatMap((group) => group.skills);

  return rawSkills.map(normalizeSoftSkill);
}
