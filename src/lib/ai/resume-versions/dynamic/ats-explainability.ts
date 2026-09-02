import { AtsScore, Resume } from "../../resume/resume-schema";
import { resumeScorer, WEIGHTS as GENERAL_ATS_WEIGHTS } from "../../resume/resume-score";
import { JobDescription } from "../../job-description/jd-schema";
import { AtsCategoryScores } from "../../job-description/jd-types";
import { WEIGHTS as JD_ATS_WEIGHTS } from "../../job-description/ats-engine";
import { matchKeywords, textContainsTerm } from "../../job-description/keyword-engine";
import { DynamicPersonalInformation, DynamicResumeDocument, SectionType } from "./dynamic-resume-schema";
import { MORE_SECTION_TYPES, RECOMMENDED_SECTION_TYPES, getSectionDefinition } from "./section-registry";
import { ResumeQualityReport } from "./resume-quality";

// Phase 15 Milestone 7 — ATS Explainability. Every function here is
// pure and deterministic (no AI call, no network) and computes
// EXPLANATIONS/CLASSIFICATIONS from scores/data the existing engines
// (resume-score.ts, ats-engine.ts, keyword-engine.ts, resume-quality.ts)
// already produce — this module never re-implements scoring, matching,
// or quality-checking. Its only job is to make the existing numbers
// understandable: why is the score what it is, what's already good,
// what would help most, and which of those fixes is safe to apply
// without a human confirming a new fact.

// ---------------------------------------------------------------------------
// Resume Health (§5) — a fixed, deterministic 5-tier classification of
// the SAME overall score already computed elsewhere. Distinct from the
// existing 4-tier "verdict" badges (JdAtsBreakdown.tsx/ResumeAtsScore.tsx,
// 85/70/50 thresholds) only in granularity/labeling — this milestone's
// own spec asks for 5 tiers with different thresholds, so it's added
// alongside rather than silently changing the existing badges' meaning.
// ---------------------------------------------------------------------------

export type ResumeHealthTier = "Excellent" | "Strong" | "Good" | "Needs Improvement" | "High Risk";

export function classifyResumeHealth(overall: number): ResumeHealthTier {
  if (overall >= 95) return "Excellent";
  if (overall >= 80) return "Strong";
  if (overall >= 65) return "Good";
  if (overall >= 50) return "Needs Improvement";
  return "High Risk";
}

// ---------------------------------------------------------------------------
// Recruiter Readiness (§6) — deliberately a DIFFERENT signal from
// Resume Health: combines the deterministic ATS score with the
// existing, separate Resume Quality report (resume-quality.ts —
// completeness/formatting/page-length checks, already computed for
// the Design tab) so a resume that scores well on ATS content but has
// real presentation problems (empty sections, no contact info) isn't
// called "recruiter ready." Never implies an actual recruiter's
// approval (§6's own explicit caution) — the reasons are always
// concrete, checkable facts, never a prediction about a person.
// ---------------------------------------------------------------------------

export type RecruiterReadinessLevel = "High" | "Medium" | "Low";

export interface RecruiterReadiness {
  level: RecruiterReadinessLevel;
  reasons: string[];
}

export function classifyRecruiterReadiness(atsScore: AtsScore, quality: ResumeQualityReport | null): RecruiterReadiness {
  const reasons: string[] = [];
  let points = 0;
  const maxPoints = quality ? 4 : 3;

  if (atsScore.overall >= 70) {
    points += 1;
    reasons.push(`ATS compatibility is ${atsScore.overall >= 85 ? "excellent" : "good"} (${atsScore.overall}/100).`);
  } else {
    reasons.push(`ATS compatibility needs work (${atsScore.overall}/100).`);
  }

  if (atsScore.formatting >= 70) {
    points += 1;
    reasons.push("Formatting and contact completeness are solid.");
  } else {
    reasons.push("Formatting or contact details are incomplete.");
  }

  if (atsScore.experience >= 50) {
    points += 1;
  } else {
    reasons.push("Experience coverage is thin.");
  }

  if (quality) {
    const passedChecks = quality.checks.filter((check) => check.passed).length;
    if (passedChecks === quality.checks.length) {
      points += 1;
      reasons.push("Passes every resume quality check (no empty sections, fits on-page, ATS-friendly layout).");
    } else {
      reasons.push(`${quality.checks.length - passedChecks} resume quality check${quality.checks.length - passedChecks > 1 ? "s" : ""} not yet passing.`);
    }
  }

  const ratio = points / maxPoints;
  const level: RecruiterReadinessLevel = ratio >= 0.75 ? "High" : ratio >= 0.4 ? "Medium" : "Low";

  return { level, reasons };
}

// ---------------------------------------------------------------------------
// Per-category explanations (§3/§4) — resume-score.ts already produces
// ONE combined explanation paragraph; ats-engine.ts (the JD-aware,
// 12-category engine) produces NONE at all. This gives every category,
// in both engines, a short, deterministic, per-bar caption — no new
// signal, just a sentence describing the number that already exists.
// ---------------------------------------------------------------------------

export interface ScoreCategoryExplanation {
  key: string;
  label: string;
  value: number;
  explanation: string;
}

function qualifier(value: number): string {
  if (value >= 85) return "Strong";
  if (value >= 60) return "Adequate";
  if (value >= 1) return "Weak";
  return "Missing";
}

const GENERAL_CATEGORY_LABELS: Record<Exclude<keyof AtsScore, "overall" | "explanation">, string> = {
  formatting: "Formatting",
  keyword: "Keyword Match",
  experience: "Experience",
  skills: "Skills Match",
  education: "Education",
  certification: "Certifications",
};

const GENERAL_CATEGORY_CAPTIONS: Record<Exclude<keyof AtsScore, "overall" | "explanation">, string> = {
  formatting: "Contact details, a real summary, and bulleted experience entries.",
  keyword: "Breadth of distinct skills listed — ATS software matches primarily on keyword density.",
  experience: "Total years of experience and progression across multiple roles.",
  skills: "Number of distinct technical and soft skills detected.",
  education: "Education entries present and their completeness.",
  certification: "Certifications listed — one of the fastest ways to raise this score if missing.",
};

export function explainGeneralAtsCategories(score: AtsScore): ScoreCategoryExplanation[] {
  return (Object.keys(GENERAL_CATEGORY_LABELS) as (keyof typeof GENERAL_CATEGORY_LABELS)[]).map((key) => ({
    key,
    label: GENERAL_CATEGORY_LABELS[key],
    value: score[key],
    explanation: `${qualifier(score[key])} — ${GENERAL_CATEGORY_CAPTIONS[key]}`,
  }));
}

const JD_CATEGORY_LABELS: Record<Exclude<keyof AtsCategoryScores, "overall">, string> = {
  keyword: "Keyword Match",
  experience: "Experience Match",
  education: "Education Match",
  formatting: "Formatting",
  achievement: "Achievement Quality",
  project: "Project Quality",
  leadership: "Leadership Signals",
  certification: "Certifications",
  aiSkills: "AI/ML Skills",
  cloud: "Cloud Skills",
  security: "Security Skills",
  softSkills: "Soft Skills",
};

const JD_CATEGORY_CAPTIONS: Record<Exclude<keyof AtsCategoryScores, "overall">, string> = {
  keyword: "How many of the job description's requested skills your resume covers.",
  experience: "How well your years and role progression match what the job asks for.",
  education: "How well your education matches the job's stated requirements.",
  formatting: "Contact details, a real summary, and bulleted experience entries.",
  achievement: "Whether your bullets are quantified (numbers, %, $) rather than vague.",
  project: "Whether your projects list real technologies matching the job's stack.",
  leadership: "Leadership language in your experience, when the role calls for it.",
  certification: "How many of the job's requested certifications you hold.",
  aiSkills: "AI/ML technology coverage against the job's requirements.",
  cloud: "Cloud technology coverage against the job's requirements.",
  security: "Security technology coverage against the job's requirements.",
  softSkills: "Soft skills coverage against the job's requirements.",
};

export function explainJdAtsCategories(score: AtsCategoryScores): ScoreCategoryExplanation[] {
  return (Object.keys(JD_CATEGORY_LABELS) as (keyof typeof JD_CATEGORY_LABELS)[]).map((key) => ({
    key,
    label: JD_CATEGORY_LABELS[key],
    value: score[key],
    explanation: `${qualifier(score[key])} — ${JD_CATEGORY_CAPTIONS[key]}`,
  }));
}

// ---------------------------------------------------------------------------
// Deterministic strengths/issues (§7/§8) — used when no AI-generated
// resumeStrengths/resumeWeaknesses exist (the general, no-JD case;
// JdAtsBreakdown.tsx already shows the AI-generated ones when a JD
// match is present, and those are left untouched — this is a
// deterministic FALLBACK/SUPPLEMENT, not a replacement). "Do not
// fabricate praise" (§7) — a category only becomes a strength when its
// own already-computed score says so.
// ---------------------------------------------------------------------------

export function deriveStrengthsFromCategories(categories: ScoreCategoryExplanation[]): string[] {
  return categories.filter((category) => category.value >= 85).map((category) => `Strong ${category.label.toLowerCase()} (${category.value}/100).`);
}

export type FixType = "safe" | "manual";
export type IssuePriority = "Critical" | "High" | "Medium" | "Low";

export interface DashboardIssue {
  key: string;
  label: string;
  value: number;
  priority: IssuePriority;
  fixType: FixType;
  /** Deterministic maximum point gain to the OVERALL score if this category were fully fixed — (100 - value) * weight. Never fabricated; always derived from the same weight table the real score used. */
  potentialImpact: number;
  /** Where to send the user to act on this (§15 — "Open Section", reusing the existing Builder, never a new editor). Null for a category with no single obvious section (e.g. "formatting" spans contact info + summary + every entry). */
  sectionType: SectionType | null;
}

/**
 * Phase 15 Milestone 8 (§15) — the one new piece of routing logic this
 * milestone adds: which existing Builder section a given score
 * category is about, so an issue can carry a genuine "Open Section"
 * target instead of being a dead end the user has to search the
 * resume for themselves. A fixed lookup table, not a guess — every
 * mapping is the category's own definition (e.g. "certification" is
 * definitionally about the CERTIFICATIONS section).
 */
const SECTION_TYPE_BY_CATEGORY: Record<string, SectionType> = {
  experience: "EXPERIENCE",
  achievement: "EXPERIENCE",
  leadership: "EXPERIENCE",
  project: "PROJECTS",
  education: "EDUCATION",
  certification: "CERTIFICATIONS",
  keyword: "SKILLS",
  skills: "SKILLS",
  softSkills: "SKILLS",
  aiSkills: "SKILLS",
  cloud: "SKILLS",
  security: "SKILLS",
};

export function deriveIssueSectionType(categoryKey: string): SectionType | null {
  return SECTION_TYPE_BY_CATEGORY[categoryKey] ?? null;
}

/**
 * Safe = wording/presentation of content the user already entered can
 * be improved without inventing a new fact (matches this codebase's
 * established "Protected Facts" rule from the Resume Rewriter —
 * AI/manual polish of existing bullets/summary is fine; a NEW
 * employer, degree, certification, or date is not). Manual = fixing
 * this category would typically require adding a fact that must come
 * from the user, never fabricated.
 */
const FIX_TYPE_BY_CATEGORY: Record<string, FixType> = {
  formatting: "safe",
  keyword: "safe",
  achievement: "safe",
  softSkills: "safe",
  leadership: "safe",
  project: "safe",
  skills: "safe",
  experience: "manual",
  education: "manual",
  certification: "manual",
};

export function classifyFixType(categoryKey: string): FixType {
  return FIX_TYPE_BY_CATEGORY[categoryKey] ?? "manual";
}

function priorityForScore(value: number): IssuePriority {
  if (value < 40) return "Critical";
  if (value < 55) return "High";
  if (value < 70) return "Medium";
  return "Low";
}

/**
 * `weights` must be the SAME weight table (resume-score.ts's or
 * ats-engine.ts's, both now exported for exactly this purpose) the
 * category's score was computed with — `weightScale` converts a
 * weight entry into a 0..1 fraction (resume-score.ts's own weights
 * already are fractions; ats-engine.ts's are 0..100, so /100).
 */
export function deriveIssuesFromCategories(categories: ScoreCategoryExplanation[], weights: Record<string, number>, weightScale: 1 | 100 = 1, threshold = 70): DashboardIssue[] {
  return categories
    .filter((category) => category.value < threshold)
    .map((category) => {
      const weight = (weights[category.key] ?? 0) / weightScale;
      return {
        key: category.key,
        label: category.label,
        value: category.value,
        priority: priorityForScore(category.value),
        fixType: classifyFixType(category.key),
        potentialImpact: Math.round((100 - category.value) * weight),
        sectionType: deriveIssueSectionType(category.key),
      };
    })
    .sort((a, b) => b.potentialImpact - a.potentialImpact);
}

export { GENERAL_ATS_WEIGHTS, JD_ATS_WEIGHTS };

// ---------------------------------------------------------------------------
// Section Completeness (§12) — reuses the existing Section Registry
// (Milestone 1) as the single source of truth for which types are
// "recommended" (Missing when absent) vs. "more"/optional (Optional
// when absent, never required — §12's own explicit instruction).
// "Complete" requires the section to both exist AND have at least one
// entry with real content — an added-but-empty section is not counted
// complete, matching resume-quality.ts's own "no empty visible
// sections" check.
// ---------------------------------------------------------------------------

export type SectionCompletenessStatus = "Complete" | "Missing" | "Optional";

export interface SectionCompletenessRow {
  type: SectionType;
  label: string;
  status: SectionCompletenessStatus;
  entryCount: number;
}

export function computeSectionCompleteness(document: DynamicResumeDocument): SectionCompletenessRow[] {
  const byType = new Map(document.sections.map((section) => [section.type, section]));

  const recommended: SectionCompletenessRow[] = RECOMMENDED_SECTION_TYPES.map((type) => {
    const section = byType.get(type);
    const entryCount = section?.entries.length ?? 0;
    return { type, label: getSectionDefinition(type).label, status: entryCount > 0 ? "Complete" : "Missing", entryCount };
  });

  const more: SectionCompletenessRow[] = MORE_SECTION_TYPES.map((type) => {
    const section = byType.get(type);
    const entryCount = section?.entries.length ?? 0;
    return { type, label: getSectionDefinition(type).label, status: entryCount > 0 ? "Complete" : "Optional", entryCount };
  });

  return [...recommended, ...more];
}

// ---------------------------------------------------------------------------
// Contact Quality (§13) — only reports what's actually present; never
// implies a field is required (a portfolio/GitHub URL is a bonus, not
// a gap in the same sense a missing email is).
// ---------------------------------------------------------------------------

export interface ContactQualityRow {
  field: keyof DynamicPersonalInformation;
  label: string;
  present: boolean;
}

// Phase 25 Milestone 1 — explicitly excludes "headline": it's a
// positioning/content field (rendered in the resume header, like the
// name), not a contact-quality signal in the same sense as
// email/phone/linkedin/github/website, so it deliberately never
// appears as a row here.
const CONTACT_FIELD_LABELS: Record<Exclude<keyof DynamicPersonalInformation, "headline">, string> = {
  name: "Full Name",
  email: "Email",
  phone: "Phone",
  location: "Location",
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Portfolio / Website",
};

export function computeContactQuality(personalInformation: DynamicPersonalInformation): ContactQualityRow[] {
  return (Object.keys(CONTACT_FIELD_LABELS) as Exclude<keyof DynamicPersonalInformation, "headline">[]).map((field) => ({
    field,
    label: CONTACT_FIELD_LABELS[field],
    present: Boolean(personalInformation[field]?.trim()),
  }));
}

// ---------------------------------------------------------------------------
// Missing keyword importance + placement (§10) — reuses matchKeywords()/
// textContainsTerm() (keyword-engine.ts, unmodified) against the JD's
// OWN already-extracted categorization (mandatorySkills/goodToHaveSkills/
// category arrays/responsibilities) — never a guessed/invented
// importance score. Only possible when the full JobDescription is
// available (the ephemeral analyzer's JD-match flow); a persisted
// Resume Version only stores the flat missingSkills list, not the
// parsed JobDescription, so this cannot run for versions without a new
// JD-parse call (documented as a known limitation, not worked around).
// ---------------------------------------------------------------------------

export type KeywordImportance = "Critical" | "High" | "Medium";

export interface MissingKeywordInsight {
  keyword: string;
  importance: KeywordImportance;
  whereItBelongs: string;
}

function jdCategorySkillNames(jd: JobDescription): string[] {
  return [...jd.cloud, ...jd.frameworks, ...jd.programmingLanguages, ...jd.tools, ...jd.databases, ...jd.aiSkills, ...jd.security];
}

export function classifyMissingKeyword(missingSkill: string, jd: JobDescription): MissingKeywordInsight {
  const isMandatory = jd.mandatorySkills.length > 0 && matchKeywords([missingSkill], jd.mandatorySkills).matched.length > 0;
  const isGoodToHave = jd.goodToHaveSkills.length > 0 && matchKeywords([missingSkill], jd.goodToHaveSkills).matched.length > 0;
  const importance: KeywordImportance = isMandatory ? "Critical" : isGoodToHave ? "Medium" : "High";

  const inSkillsCategory = jdCategorySkillNames(jd).length > 0 && matchKeywords([missingSkill], jdCategorySkillNames(jd)).matched.length > 0;
  const inResponsibilities = jd.responsibilities.some((responsibility) => textContainsTerm(responsibility, missingSkill));

  let whereItBelongs = "Skills";
  if (inResponsibilities && inSkillsCategory) whereItBelongs = "Experience + Skills";
  else if (inResponsibilities) whereItBelongs = "Experience";

  return { keyword: missingSkill, importance, whereItBelongs };
}

// ---------------------------------------------------------------------------
// Improvement Impact (§18) / Before-After (§19) — deterministic what-if
// re-scoring via the SAME public resumeScorer.score() every version's
// persisted ats_score already comes from (Milestone 2). Deliberately
// bounded to the one concretely simulatable action (adding a specific
// missing skill) rather than attempting to estimate the impact of a
// vague prose change like "improve summary," which resumeScorer has no
// way to simulate without actually rewriting it (an AI call this
// milestone must not add). The JD-optimization-proposal review flow
// already has its own, separate "Projected ATS Score" for accepted
// proposals (optimization-review.ts's projectAtsScoreAfterProposals) —
// this is not a replacement for that, it fills the gap for missing-
// skill-driven improvements specifically, which that function doesn't
// cover.
// ---------------------------------------------------------------------------

function withAddedSkill(resume: Resume, skill: string): Resume {
  return { ...resume, technicalSkills: [...resume.technicalSkills, skill] };
}

/** The point gain to the OVERALL general ATS score from adding one specific missing skill — never a guess, always a real before/after diff of the same deterministic scorer. */
export function estimateSkillAdditionImpact(resume: Resume, skill: string): number {
  const before = resumeScorer.score(resume).overall;
  const after = resumeScorer.score(withAddedSkill(resume, skill)).overall;
  return after - before;
}

/** Before/After Preview (§19) — the resume itself is never modified; only a hypothetical clone is scored. */
export function estimatePotentialAtsScore(resume: Resume, skillsToAdd: string[]): { current: number; potential: number } {
  const current = resumeScorer.score(resume).overall;
  const projected = skillsToAdd.reduce((acc, skill) => withAddedSkill(acc, skill), resume);
  const potential = resumeScorer.score(projected).overall;
  return { current, potential };
}
