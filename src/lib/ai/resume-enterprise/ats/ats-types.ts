import { EnterpriseResume } from "../resume-schema";

// Phase 12 Milestone 3. Non-schema wrapper/internal types — mirrors the role
// resume-types.ts plays for the parser: the public *output* shape lives in
// ats-schema.ts (Zod), while the types the rule engine's internals pass
// around live here.

export interface AtsEngineInput {
  resume: EnterpriseResume;
}

// The 10 scored sections from the spec's point breakdown (10/10/20/10/10/
// 15/10/5/5/5 — see ats-rules.ts's SECTION_MAX_SCORES). Defined as a const
// tuple (not a hand-written union) so ats-schema.ts's zod enum can be
// derived from the same array instead of duplicating the list.
export const ATS_SECTION_KEYS = [
  "contactInformation",
  "professionalSummary",
  "experience",
  "education",
  "projects",
  "skills",
  "formatting",
  "achievements",
  "certifications",
  "keywordDensity",
] as const;

export type AtsSectionKey = (typeof ATS_SECTION_KEYS)[number];

// The 11 technology categories the spec's Keyword Density / Technology
// Coverage sections are grouped by — same const-tuple pattern.
export const ATS_TECHNOLOGY_CATEGORIES = [
  "Programming Languages",
  "Frameworks",
  "Cloud",
  "Databases",
  "DevOps",
  "AI",
  "Security",
  "Architecture",
  "Testing",
  "Frontend",
  "Backend",
] as const;

export type AtsTechnologyCategory = (typeof ATS_TECHNOLOGY_CATEGORIES)[number];

export interface TechnologyDictionaryEntry {
  name: string;
  category: AtsTechnologyCategory;
  // Alternate spellings/tokens that count as a mention of `name` (e.g.
  // "Node" for "Node.js") — matched case-insensitively as whole words.
  aliases: string[];
}

export interface WeakPhraseRule {
  phrase: string;
  replacements: string[];
}

export const ATS_ACHIEVEMENT_TYPES = [
  "percentage",
  "revenue",
  "performance",
  "costSavings",
  "userGrowth",
  "responseTime",
  "automation",
] as const;

export type AchievementFindingType = (typeof ATS_ACHIEVEMENT_TYPES)[number];

export interface AchievementPattern {
  type: AchievementFindingType;
  pattern: RegExp;
}

export const ATS_FEEDBACK_PRIORITIES = ["High", "Medium", "Low"] as const;
export type AtsFeedbackPriority = (typeof ATS_FEEDBACK_PRIORITIES)[number];

export const ATS_FEEDBACK_IMPACTS = [2, 5, 8, 10] as const;
export type AtsFeedbackImpact = (typeof ATS_FEEDBACK_IMPACTS)[number];

export const ATS_SECTION_STATUSES = ["Excellent", "Good", "Average", "Poor", "Critical"] as const;
export type AtsSectionStatus = (typeof ATS_SECTION_STATUSES)[number];

export const ATS_TECHNOLOGY_STATUSES = ["Excellent", "Good", "Average", "Poor", "Missing"] as const;
export type AtsTechnologyStatus = (typeof ATS_TECHNOLOGY_STATUSES)[number];

export const ATS_FORMATTING_SEVERITIES = ["High", "Medium", "Low"] as const;
export type AtsFormattingSeverity = (typeof ATS_FORMATTING_SEVERITIES)[number];

// Declarative feedback rule: ats-feedback.ts evaluates `appliesTo` against
// the resume (and, for a few rules, the already-computed breakdown data) to
// decide whether `message` should be emitted.
export interface FeedbackRule {
  id: string;
  section: AtsSectionKey;
  priority: AtsFeedbackPriority;
  impact: AtsFeedbackImpact;
  // A "quick fix" is something a candidate can correct in minutes (add a
  // LinkedIn URL, fix a phone format) as opposed to a substantive rewrite —
  // used to build the "Immediate Fixes" insight separately from "Critical
  // Improvements" (which is priority-based instead).
  quickFix: boolean;
  message: string;
  appliesTo: (resume: EnterpriseResume) => boolean;
}
