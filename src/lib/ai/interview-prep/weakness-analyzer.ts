import { JdMatchResult } from "../job-description/jd-schema";
import { SkillGap } from "../resume/resume-schema";
import { ConfidenceAnalysis, WeaknessAnalysis } from "./prep-schema";

// Deterministic — reuses JdMatchResult's already-computed category scores
// (job-description/jd-matcher.ts's own scoreAts output, read-only) and
// SkillGap (resume/resume-suggestions.ts's analyzeSkillGap, read-only).
// Same threshold logic jd-matcher.ts's own deriveStrengthsAndWeaknesses()
// already established (score >= 75 strong, < 50 weak).

const CATEGORY_LABELS: Record<string, string> = {
  keywordScore: "Keyword alignment",
  experienceScore: "Experience fit",
  educationScore: "Education match",
  formattingScore: "Resume formatting",
  achievementScore: "Quantified achievements",
  projectScore: "Project relevance",
  leadershipScore: "Leadership signal",
  certificationScore: "Certifications",
  aiScore: "AI/ML skills",
  cloudScore: "Cloud skills",
  securityScore: "Security skills",
  softSkillsScore: "Soft skills",
};

function categorizedScores(jdMatch: JdMatchResult): { label: string; score: number }[] {
  return Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
    label,
    score: jdMatch[key as keyof JdMatchResult] as number,
  }));
}

/**
 * Section 7 — category-level weak areas (from the JD-match ATS
 * breakdown) plus skill-level gaps (from SkillGap's per-technology
 * lists). `conceptsToLearn` is the same gap list capped/prioritized
 * differently from `knowledgeGaps` (the full deduped set) — a curated
 * top subset, not a separate data source (SkillGap doesn't distinguish
 * "skills" from "concepts").
 */
export function analyzeWeaknesses(jdMatch: JdMatchResult, skillGap: SkillGap): WeaknessAnalysis {
  const weakAreas = categorizedScores(jdMatch)
    .filter((entry) => entry.score < 50)
    .map((entry) => `${entry.label} (${entry.score}/100)`);

  const knowledgeGaps = Array.from(
    new Set([
      ...skillGap.missingJavaSkills,
      ...skillGap.missingSpringSkills,
      ...skillGap.missingCloudSkills,
      ...skillGap.missingDevOpsSkills,
      ...skillGap.missingAiSkills,
      ...skillGap.missingDatabaseSkills,
    ])
  );

  return {
    weakAreas,
    missingSkills: jdMatch.missingSkills,
    knowledgeGaps,
    projectsToBuild: skillGap.recommendedProjects,
    conceptsToLearn: knowledgeGaps.slice(0, 10),
  };
}

/**
 * Section 11 — same category scores as `analyzeWeaknesses` (that pairing
 * is the spec's own framing: "Strong Areas ~ High Confidence", "Weak
 * Areas ~ Low Confidence"), plus a skill-level view via `matchedSkills`/
 * `missingSkills` so the two sections aren't identical outputs.
 */
export function analyzeConfidence(jdMatch: JdMatchResult): ConfidenceAnalysis {
  const scores = categorizedScores(jdMatch);

  return {
    strongAreas: scores.filter((entry) => entry.score >= 75).map((entry) => `${entry.label} (${entry.score}/100)`),
    weakAreas: scores.filter((entry) => entry.score < 50).map((entry) => `${entry.label} (${entry.score}/100)`),
    highConfidenceTopics: jdMatch.matchedSkills,
    lowConfidenceTopics: jdMatch.missingSkills,
  };
}
