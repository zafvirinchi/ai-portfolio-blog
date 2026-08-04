// Phase 12 Milestone 5. Shared types for the section-intelligence package —
// mirrors ats-types.ts's role for the ats/ package: const-tuple enums plus
// the internal interfaces every other file in parser/ passes around.

export const PARSER_SECTION_KEYS = [
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
  "technicalSkills",
  "softSkills",
  "achievements",
  "awards",
  "certifications",
  "languages",
  "publications",
  "patents",
  "volunteerExperience",
  "internships",
  "trainings",
  "interests",
  "references",
] as const;

export type ParserSectionKey = (typeof PARSER_SECTION_KEYS)[number];

export interface DetectedSection {
  section: ParserSectionKey;
  heading: string;
  startLine: number;
  endLine: number;
  confidence: number;
}

export interface NormalizedDate {
  normalized: string | null;
  raw: string | null;
  isCurrent: boolean;
  isApproximate: boolean;
}

export interface TimelineEntry {
  startDate: string | null;
  endDate: string | null;
  rawStartDate: string | null;
  rawEndDate: string | null;
  durationMonths: number | null;
  isCurrent: boolean;
  title: string | null;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  // Not derivable from the current schema (no dedicated field, no
  // reliable heuristic from a job title alone) — always null, documented
  // rather than guessed.
  industry: string | null;
}

export interface EmploymentGap {
  startDate: string;
  endDate: string;
  months: number;
  reason: string | null;
}

// Seniority ladder used by career-progression.ts, ordered low to high —
// array index doubles as the level's rank.
export const SENIORITY_LEVEL_NAMES = [
  "Intern",
  "Junior",
  "Engineer",
  "Senior",
  "Lead",
  "Architect",
  "Executive",
] as const;

export type SeniorityLevelName = (typeof SENIORITY_LEVEL_NAMES)[number];

export interface CareerLevelTransition {
  from: SeniorityLevelName | null;
  to: SeniorityLevelName;
  date: string | null;
  title: string;
  company: string | null;
}

export interface PromotionEvent {
  title: string;
  company: string | null;
  date: string | null;
  levelChange: number;
}

export interface CareerProgressionResult {
  careerGrowth: CareerLevelTransition[];
  promotionHistory: PromotionEvent[];
  leadershipGrowth: boolean;
  careerProgressionScore: number;
}

export interface CareerStatistics {
  totalExperienceMonths: number;
  relevantExperienceMonths: number;
  averageTenureMonths: number;
  longestTenureMonths: number;
  shortestTenureMonths: number;
  careerStabilityScore: number;
  careerProgressionScore: number;
  promotionCount: number;
  employmentGapCount: number;
  largestEmploymentGapMonths: number;
  averageEmploymentGapMonths: number;
}

export interface NormalizedEducation {
  institute: string | null;
  degree: string | null;
  specialization: string | null;
  startYear: string | null;
  endYear: string | null;
  grade: { type: "percentage" | "cgpa"; value: number } | null;
  city: string | null;
  country: string | null;
}

export interface NormalizedCertification {
  name: string | null;
  vendor: string | null;
  issueDate: NormalizedDate;
  expiryDate: NormalizedDate;
  credentialId: string | null;
  // Not in the Milestone 1 schema (ResumeCertification has no url field)
  // — always null, documented rather than invented.
  credentialUrl: string | null;
  skillsCovered: string[];
}

export interface NormalizedProject {
  name: string | null;
  organization: string | null;
  role: string | null;
  duration: string | null;
  description: string | null;
  technologies: string[];
  tools: string[];
  teamSize: number | null;
  responsibilities: string[];
  achievements: string[];
}

export const LANGUAGE_PROFICIENCY_LEVELS = ["Native", "Professional", "Intermediate", "Beginner"] as const;
export type LanguageProficiencyLevel = (typeof LANGUAGE_PROFICIENCY_LEVELS)[number];

export interface NormalizedLanguage {
  language: string;
  proficiency: LanguageProficiencyLevel | null;
}

export interface ParserQuality {
  score: number;
  issues: string[];
}

export interface ParserMetadata {
  parserVersion: string;
  processingTime: number;
  confidence: number;
  documentLanguage: string;
  sectionCount: number;
  pageCount: number;
  totalWords: number;
  resumeLength: number;
}
