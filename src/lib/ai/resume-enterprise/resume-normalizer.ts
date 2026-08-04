import { EnterpriseResume } from "./resume-schema";

// Phase 12 Milestone 2. Deterministic, narrow-scope cleanup applied AFTER
// OpenAI extraction + Zod validation — a reliability backstop on top of the
// system prompt's own normalization instructions (resume-parser.ts), not a
// replacement for them. Deliberately does NOT touch free-text prose
// (responsibilities/achievements/descriptions/careerObjective) — exact-match
// lookup tables are safe for short tokens like a technology name, but risk
// mangling a real sentence, so those fields are left exactly as the LLM
// (already instructed to normalize contextually) produced them.

// Observed in real testing (Zaf Resume PDF): the model sometimes emits the
// literal text "null" (or similar filler) as a string value for a genuinely
// absent field, instead of the JSON null the schema/prompt asks for. Since
// `z.string().nullable()` accepts any string, this passes validation but is
// a real bug downstream — a non-empty string is truthy in JS, so
// `if (education.startYear)` would wrongly be true. This is caught and
// fixed here rather than relying solely on the prompt.
const NULL_LIKE_STRINGS = new Set(["null", "n/a", "na", "none", "not available", "unknown", "-", "--"]);

function cleanNullableString(value: string | null): string | null {
  if (value === null) return null;

  const trimmed = value.trim();

  if (!trimmed || NULL_LIKE_STRINGS.has(trimmed.toLowerCase())) {
    return null;
  }

  return trimmed;
}

// Keys are lowercased with internal whitespace collapsed to a single space
// before lookup, so "Java17", "JAVA17", and "java 17" all resolve the same
// way — see normalizeTechToken().
const TECH_NAME_MAP: Record<string, string> = {
  java17: "Java 17",
  "java 17": "Java 17",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  springboot: "Spring Boot",
  "spring boot": "Spring Boot",
  nodejs: "Node.js",
  "node js": "Node.js",
  "node.js": "Node.js",
  reactjs: "React",
  "react.js": "React",
  vuejs: "Vue.js",
  "vue.js": "Vue.js",
  "amazon web services": "AWS",
  aws: "AWS",
  "microsoft azure": "Azure",
  azure: "Azure",
  "google cloud platform": "GCP",
  "google cloud": "GCP",
  gcp: "GCP",
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  mongo: "MongoDB",
};

// Common "still working here" phrasings across resume conventions —
// collapsed to one consistent value rather than left as free variation.
const PRESENT_DATE_ALIASES = new Set([
  "present",
  "current",
  "currently working",
  "ongoing",
  "till date",
  "till now",
  "to date",
  "now",
]);

function normalizeTechToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return TECH_NAME_MAP[key] ?? trimmed;
}

function normalizeDateField(raw: string | null): string | null {
  const cleaned = cleanNullableString(raw);
  if (cleaned === null) return null;

  return PRESENT_DATE_ALIASES.has(cleaned.toLowerCase()) ? "Present" : cleaned;
}

/**
 * Deterministic cleanup pass over an already-validated EnterpriseResume:
 * converts null-like filler strings ("null", "N/A", ...) to real null,
 * canonicalizes known technology-name variants in skill/technology token
 * lists, and collapses "still working here" date phrasing to "Present".
 * Returns a new object — never mutates the input.
 */
export function normalizeEnterpriseResume(resume: EnterpriseResume): EnterpriseResume {
  return {
    personalInfo: {
      firstName: cleanNullableString(resume.personalInfo.firstName),
      lastName: cleanNullableString(resume.personalInfo.lastName),
      email: cleanNullableString(resume.personalInfo.email),
      phone: cleanNullableString(resume.personalInfo.phone),
      linkedin: cleanNullableString(resume.personalInfo.linkedin),
      github: cleanNullableString(resume.personalInfo.github),
      portfolio: cleanNullableString(resume.personalInfo.portfolio),
      location: cleanNullableString(resume.personalInfo.location),
    },
    professionalSummary: {
      headline: cleanNullableString(resume.professionalSummary.headline),
      currentDesignation: cleanNullableString(resume.professionalSummary.currentDesignation),
      careerObjective: cleanNullableString(resume.professionalSummary.careerObjective),
      yearsOfExperience: resume.professionalSummary.yearsOfExperience,
    },
    education: resume.education.map((entry) => ({
      institute: cleanNullableString(entry.institute),
      degree: cleanNullableString(entry.degree),
      specialization: cleanNullableString(entry.specialization),
      startYear: cleanNullableString(entry.startYear),
      endYear: cleanNullableString(entry.endYear),
      grade: cleanNullableString(entry.grade),
    })),
    companyHistory: resume.companyHistory.map((company) => ({
      companyName: cleanNullableString(company.companyName),
      designation: cleanNullableString(company.designation),
      employmentType: cleanNullableString(company.employmentType),
      startDate: normalizeDateField(company.startDate),
      endDate: normalizeDateField(company.endDate),
      duration: cleanNullableString(company.duration),
      location: cleanNullableString(company.location),
      responsibilities: company.responsibilities,
      achievements: company.achievements,
    })),
    projects: resume.projects.map((project) => ({
      projectName: cleanNullableString(project.projectName),
      client: cleanNullableString(project.client),
      role: cleanNullableString(project.role),
      description: cleanNullableString(project.description),
      responsibilities: project.responsibilities,
      technologies: project.technologies.map(normalizeTechToken),
      duration: cleanNullableString(project.duration),
      achievements: project.achievements,
    })),
    skills: resume.skills.map((group) => ({
      category: group.category,
      skills: group.skills.map(normalizeTechToken),
    })),
    certifications: resume.certifications.map((cert) => ({
      name: cleanNullableString(cert.name),
      issuer: cleanNullableString(cert.issuer),
      date: cleanNullableString(cert.date),
      expiryDate: cleanNullableString(cert.expiryDate),
      credentialId: cleanNullableString(cert.credentialId),
    })),
    awards: resume.awards.map((award) => ({
      title: cleanNullableString(award.title),
      issuer: cleanNullableString(award.issuer),
      date: cleanNullableString(award.date),
      description: cleanNullableString(award.description),
    })),
    publications: resume.publications.map((publication) => ({
      title: cleanNullableString(publication.title),
      publisher: cleanNullableString(publication.publisher),
      date: cleanNullableString(publication.date),
      url: cleanNullableString(publication.url),
      description: cleanNullableString(publication.description),
    })),
    patents: resume.patents.map((patent) => ({
      title: cleanNullableString(patent.title),
      patentNumber: cleanNullableString(patent.patentNumber),
      date: cleanNullableString(patent.date),
      description: cleanNullableString(patent.description),
    })),
    languagesKnown: resume.languagesKnown.map((language) => ({
      language: language.language,
      proficiency: cleanNullableString(language.proficiency),
    })),
    volunteerExperience: resume.volunteerExperience.map((entry) => ({
      organization: cleanNullableString(entry.organization),
      role: cleanNullableString(entry.role),
      startDate: normalizeDateField(entry.startDate),
      endDate: normalizeDateField(entry.endDate),
      description: cleanNullableString(entry.description),
    })),
    interests: resume.interests,
    achievements: resume.achievements,
  };
}
