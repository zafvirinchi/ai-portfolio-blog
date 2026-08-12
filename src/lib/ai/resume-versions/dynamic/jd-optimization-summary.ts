import { CertificationRequirementMatch, EducationRequirementMatch } from "../../job-description/keyword-engine";
import { JdMatchResult, JobDescription } from "../../job-description/jd-schema";
import { Resume } from "../../resume/resume-schema";
import { DynamicResumeDocument, SectionType } from "./dynamic-resume-schema";

// Phase 13 Milestone 18 — turns the intelligence that already exists
// (JdMatchResult from jd-matcher.ts/ats-engine.ts/experience-engine.ts,
// plus Milestone 17's classifyEducationRequirements()/
// classifyCertificationRequirements() output) into one concise,
// recruiter-grade summary object. This is a pure, deterministic
// RESHAPING of already-computed data — it never re-derives a score,
// never calls an LLM, and never introduces a second matching algorithm.
// It is not an optimizer: it never proposes or applies a resume change
// (see optimization-review.ts for that) — only describes and prioritizes
// what the existing intelligence already found.

export type PriorityLevel = "critical" | "high" | "medium" | "low";

/**
 * Kept as a superset of the categories this deterministic v1 actually
 * populates ("skill" | "experience" | "education" | "certification") —
 * "keyword" | "project" | "achievement" are reserved for a future
 * milestone once a per-item (not just aggregate-score) evidence source
 * exists for those categories; see this milestone's docs, §17.
 */
export type SummaryCategory = "skill" | "experience" | "education" | "certification" | "keyword" | "project" | "achievement";

export interface OptimizationPriority {
  priority: PriorityLevel;
  category: SummaryCategory;
  title: string;
  reason: string;
  /** A coarse, level-derived 0-100 score (see PRIORITY_IMPACT) — deliberately not a separately-fabricated per-item estimate, which would imply false precision this deterministic engine cannot honestly provide. */
  impact: number;
}

export interface OptimizationHighlight {
  category: SummaryCategory;
  title: string;
  reason: string;
}

export interface ProtectedContentItem {
  /** The existing dynamic-document section this fact lives in, when it maps to one — null for personal/contact information, which isn't a "section" in the dynamic document model. */
  sectionId: string | null;
  sectionType: SectionType | null;
  reason: string;
}

export interface JdOptimizationSummary {
  /** Reused directly from JdMatchResult.overallMatch — never recomputed. */
  overallMatchScore: number;
  matchedCount: number;
  relatedCount: number;
  missingCount: number;

  education: {
    matched: number;
    equivalentOrHigher: number;
    missing: number;
  };

  certifications: {
    matched: number;
    related: number;
    missing: number;
  };

  priorities: OptimizationPriority[];
  strengths: OptimizationHighlight[];
  gaps: OptimizationHighlight[];
  protectedContent: ProtectedContentItem[];
}

const PRIORITY_RANK: Record<PriorityLevel, number> = { critical: 3, high: 2, medium: 1, low: 0 };
const PRIORITY_IMPACT: Record<PriorityLevel, number> = { critical: 90, high: 70, medium: 45, low: 20 };

function containsSkill(list: string[], skill: string): boolean {
  const normalized = skill.trim().toLowerCase();
  return list.some((item) => item.trim().toLowerCase() === normalized);
}

/**
 * jd-parser.ts's own extraction prompt documents "skills" as the flat
 * union of mandatorySkills/goodToHaveSkills — so a missing/partial skill
 * string can be checked for "was this stated as required?" via plain
 * membership in jobDescription.mandatorySkills, with no new NLP/fuzzy
 * matching. This is the ONLY place this milestone treats a requirement
 * as "mandatory" — every other category (education/certifications) has
 * no such field in JobDescription, so this milestone never invents a
 * mandatory/optional split for them (see this milestone's docs, §9/§11).
 */
function skillPriority(skill: string, jd: JobDescription): { level: PriorityLevel; reason: string } {
  if (containsSkill(jd.mandatorySkills, skill)) {
    return { level: "critical", reason: `"${skill}" is explicitly required by this job description and has no evidence in your resume.` };
  }

  if (containsSkill(jd.goodToHaveSkills, skill)) {
    return { level: "medium", reason: `"${skill}" is listed as preferred by this job description and has no evidence in your resume.` };
  }

  return { level: "high", reason: `"${skill}" is listed in this job description and has no evidence in your resume.` };
}

function partialSkillPriority(jdSkill: string, jd: JobDescription): PriorityLevel {
  if (containsSkill(jd.mandatorySkills, jdSkill)) return "high";
  if (containsSkill(jd.goodToHaveSkills, jdSkill)) return "low";
  return "medium";
}

function buildPriorities(
  matchResult: JdMatchResult,
  jobDescription: JobDescription,
  educationMatches: EducationRequirementMatch[],
  certificationMatches: CertificationRequirementMatch[]
): OptimizationPriority[] {
  const priorities: OptimizationPriority[] = [];

  for (const skill of matchResult.missingSkills) {
    const { level, reason } = skillPriority(skill, jobDescription);
    priorities.push({ priority: level, category: "skill", title: skill, reason, impact: PRIORITY_IMPACT[level] });
  }

  for (const partial of matchResult.partialSkills) {
    const level = partialSkillPriority(partial.jdSkill, jobDescription);
    priorities.push({ priority: level, category: "skill", title: partial.jdSkill, reason: partial.reason, impact: PRIORITY_IMPACT[level] });
  }

  for (const result of educationMatches) {
    if (result.status !== "missing") continue;
    priorities.push({
      priority: "high",
      category: "education",
      title: result.requirement,
      reason: `"${result.requirement}" is required by this job description and isn't reflected in your Education section.`,
      impact: PRIORITY_IMPACT.high,
    });
  }

  for (const result of certificationMatches) {
    if (result.status === "matched") continue;

    if (result.status === "missing") {
      priorities.push({
        priority: "high",
        category: "certification",
        title: result.requirement,
        reason: `"${result.requirement}" is required by this job description and isn't reflected in your Certifications section.`,
        impact: PRIORITY_IMPACT.high,
      });
      continue;
    }

    priorities.push({
      priority: "medium",
      category: "certification",
      title: result.requirement,
      reason: `This job description asks for "${result.requirement}"; your resume shows a related certification ("${result.resumeEvidence}") that doesn't exactly match.`,
      impact: PRIORITY_IMPACT.medium,
    });
  }

  if (matchResult.experienceMatch.level === "Weak") {
    priorities.push({
      priority: "high",
      category: "experience",
      title: "Experience level may not fully meet this role's expectations",
      reason: matchResult.experienceMatch.reasoning,
      impact: PRIORITY_IMPACT.high,
    });
  }

  return priorities.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.impact - a.impact || a.title.localeCompare(b.title));
}

function buildStrengths(matchResult: JdMatchResult, educationMatches: EducationRequirementMatch[], certificationMatches: CertificationRequirementMatch[]): OptimizationHighlight[] {
  const strengths: OptimizationHighlight[] = matchResult.matchedSkills.map((skill) => ({
    category: "skill" as const,
    title: skill,
    reason: "Present in your resume and required or preferred by this job description.",
  }));

  for (const result of educationMatches) {
    if (result.status === "missing") continue;
    strengths.push({
      category: "education",
      title: result.requirement,
      reason: result.status === "matched" ? `Matched by "${result.resumeEvidence}".` : `Satisfied by your equivalent-or-higher qualification ("${result.resumeEvidence}").`,
    });
  }

  for (const result of certificationMatches) {
    if (result.status !== "matched") continue;
    strengths.push({ category: "certification", title: result.requirement, reason: `You hold this certification ("${result.resumeEvidence}").` });
  }

  if (matchResult.experienceMatch.level === "Excellent") {
    strengths.push({ category: "experience", title: "Experience aligns well with this role", reason: matchResult.experienceMatch.reasoning });
  }

  return strengths;
}

function buildGaps(matchResult: JdMatchResult, educationMatches: EducationRequirementMatch[], certificationMatches: CertificationRequirementMatch[]): OptimizationHighlight[] {
  const gaps: OptimizationHighlight[] = matchResult.missingSkills.map((skill) => ({
    category: "skill" as const,
    title: skill,
    reason: `"${skill}" is listed in this job description and has no evidence in your resume.`,
  }));

  for (const result of educationMatches) {
    if (result.status !== "missing") continue;
    gaps.push({ category: "education", title: result.requirement, reason: `"${result.requirement}" isn't reflected in your Education section.` });
  }

  for (const result of certificationMatches) {
    if (result.status !== "missing") continue;
    gaps.push({ category: "certification", title: result.requirement, reason: `"${result.requirement}" isn't reflected in your Certifications section.` });
  }

  if (matchResult.experienceMatch.level === "Weak") {
    gaps.push({ category: "experience", title: "Experience level below what this role expects", reason: matchResult.experienceMatch.reasoning });
  }

  return gaps;
}

/**
 * Every fact type here is informational-only, per this milestone's
 * "protected content" requirement — the summary tells the user not to
 * change it automatically unless it's factually wrong; nothing in this
 * module (or the optimizer it summarizes) ever rewrites these fields.
 * Only lists a category when the corresponding section/data genuinely
 * exists — never asserts a resume "has" protected employment dates, for
 * example, when there is no EXPERIENCE section with any entries.
 */
function buildProtectedContent(document: DynamicResumeDocument, resumeData: Resume): ProtectedContentItem[] {
  const protectedContent: ProtectedContentItem[] = [];
  const trailer = "Do not change this unless the information is factually incorrect.";

  const hasPersonalInformation = Object.values(resumeData.contact).some((value) => Boolean(value));
  if (hasPersonalInformation) {
    protectedContent.push({ sectionId: null, sectionType: null, reason: `Personally identifying information (name, email, phone, location, links) is never changed automatically. ${trailer}` });
  }

  const findPopulatedSection = (type: SectionType) => document.sections.find((section) => section.type === type && section.entries.length > 0) ?? null;

  const experienceSection = findPopulatedSection("EXPERIENCE");
  if (experienceSection) {
    protectedContent.push({ sectionId: experienceSection.id, sectionType: "EXPERIENCE", reason: `Employment dates and company names are factual and are never changed automatically — only bullet wording is ever optimized. ${trailer}` });
  }

  const educationSection = findPopulatedSection("EDUCATION");
  if (educationSection) {
    protectedContent.push({ sectionId: educationSection.id, sectionType: "EDUCATION", reason: `Degree names, institutions, and dates are never changed or invented automatically. ${trailer}` });
  }

  const certificationsSection = findPopulatedSection("CERTIFICATIONS");
  if (certificationsSection) {
    protectedContent.push({ sectionId: certificationsSection.id, sectionType: "CERTIFICATIONS", reason: `Certification names, issuers, and dates are never renamed or invented automatically. ${trailer}` });
  }

  const projectsSection = findPopulatedSection("PROJECTS");
  if (projectsSection) {
    protectedContent.push({ sectionId: projectsSection.id, sectionType: "PROJECTS", reason: `Project dates and factual outcomes are preserved — only descriptive wording is ever optimized. ${trailer}` });
  }

  return protectedContent;
}

/**
 * Milestone 17's classifyEducationRequirements()/
 * classifyCertificationRequirements() already fold "equivalent_or_higher"
 * education and "matched" certifications into a status that produces NO
 * gap proposal (buildEducationAndCertificationProposals only proposes
 * on "missing" education / "missing"+"related" certifications) — i.e.
 * the existing architecture already treats an equivalent-or-higher
 * degree as satisfying the requirement outright, unlike a merely
 * "related" certification. This summary's combined matched/related/
 * missing counts follow that same existing distinction rather than
 * inventing a new one: equivalent-or-higher counts as matched, related
 * certifications count as related (not matched, not missing).
 */
export function buildJdOptimizationSummary(params: {
  document: DynamicResumeDocument;
  resumeData: Resume;
  jobDescription: JobDescription;
  matchResult: JdMatchResult;
  educationMatches: EducationRequirementMatch[];
  certificationMatches: CertificationRequirementMatch[];
}): JdOptimizationSummary {
  const { document, resumeData, jobDescription, matchResult, educationMatches, certificationMatches } = params;

  const educationCounts = {
    matched: educationMatches.filter((result) => result.status === "matched").length,
    equivalentOrHigher: educationMatches.filter((result) => result.status === "equivalent_or_higher").length,
    missing: educationMatches.filter((result) => result.status === "missing").length,
  };

  const certificationCounts = {
    matched: certificationMatches.filter((result) => result.status === "matched").length,
    related: certificationMatches.filter((result) => result.status === "related").length,
    missing: certificationMatches.filter((result) => result.status === "missing").length,
  };

  return {
    overallMatchScore: matchResult.overallMatch,
    matchedCount: matchResult.matchedSkills.length + educationCounts.matched + educationCounts.equivalentOrHigher + certificationCounts.matched,
    relatedCount: matchResult.partialSkills.length + certificationCounts.related,
    missingCount: matchResult.missingSkills.length + educationCounts.missing + certificationCounts.missing,
    education: educationCounts,
    certifications: certificationCounts,
    priorities: buildPriorities(matchResult, jobDescription, educationMatches, certificationMatches),
    strengths: buildStrengths(matchResult, educationMatches, certificationMatches),
    gaps: buildGaps(matchResult, educationMatches, certificationMatches),
    protectedContent: buildProtectedContent(document, resumeData),
  };
}
