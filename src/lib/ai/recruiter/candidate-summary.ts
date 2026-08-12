import { JdMatchResult } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { classifyCandidateFitLevel, computeRankingScore } from "./candidate-ranking";
import { CandidateFitLevel, CandidateScoreBreakdown, RecruiterSummary } from "./candidate-types";

// Phase 16 Milestone 1, §11 — a DETERMINISTIC recruiter summary,
// deliberately separate from candidate-insights.ts (which makes one
// LLM call per candidate, per Phase 13 Milestone 8). §11 explicitly
// requires this specific summary to be deterministic ("Do not generate
// these summaries with an LLM in this milestone") — the existing
// LLM-based insights remain available as their own, richer, separate
// feature; this is not a replacement for it, just a second, always-
// available, zero-cost summary built entirely from data already
// computed elsewhere (JdMatchResult's own matched/missing skills,
// candidate-score.ts's score breakdown) — never a re-derivation of
// either.

const SCORE_LABELS: { key: keyof CandidateScoreBreakdown; label: string }[] = [
  { key: "experienceScore", label: "experience alignment" },
  { key: "leadershipScore", label: "leadership signals" },
  { key: "skillsScore", label: "skills coverage" },
  { key: "projectsScore", label: "project relevance" },
  { key: "certificationScore", label: "certification coverage" },
  { key: "communicationScore", label: "communication/soft-skill signals" },
];

// Phase 16 Milestone 4, §12 — a fixed, deterministic recommendation
// keyed by Milestone 1's own Candidate Fit tiers (classifyCandidateFitLevel,
// same 90/75/60 thresholds, never re-weighted here). No LLM call: this
// is a lookup, not a rewrite of the deterministic summary above it.
const RECOMMENDED_ACTIONS: Record<CandidateFitLevel, string> = {
  STRONG: "Fast-track for interview — this candidate closely matches the role.",
  GOOD: "Proceed to screening — a solid match worth a closer look.",
  MODERATE: "Consider with reservations — review the gaps below before advancing.",
  LOW: "Likely not a fit for this role based on available data.",
};

export function recommendRecruiterAction(fitLevel: CandidateFitLevel): string {
  return RECOMMENDED_ACTIONS[fitLevel];
}

/**
 * §6 — every gap here is either a genuine, evidence-backed mismatch
 * (a JD-required skill the resume doesn't list) or an honest "not
 * provided" note — never a fabricated deficiency ("no projects" is
 * never phrased as a candidate shortcoming, only as missing data the
 * evaluator should be aware of).
 */
export function buildRecruiterSummary(resume: Resume, jdMatch: JdMatchResult | null, scores: CandidateScoreBreakdown): RecruiterSummary {
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (jdMatch) {
    for (const skill of jdMatch.matchedSkills.slice(0, 6)) {
      strengths.push(`${skill} — matches the job description`);
    }
    for (const skill of jdMatch.missingSkills.slice(0, 6)) {
      gaps.push(`${skill} — not found on the resume`);
    }
  }

  for (const { key, label } of SCORE_LABELS) {
    const value = scores[key];
    if (value !== null && value >= 85) strengths.push(`Strong ${label} (${value}/100)`);
  }

  const dataAvailability: RecruiterSummary["dataAvailability"] = {
    jdMatch: jdMatch ? "available" : "not_provided",
    certifications: resume.certifications.length > 0 ? "available" : "not_provided",
    projects: resume.projects.length > 0 ? "available" : "not_provided",
    education: resume.education.length > 0 ? "available" : "not_provided",
  };

  const fitLevel = classifyCandidateFitLevel(computeRankingScore(scores));

  return { strengths, gaps, dataAvailability, recommendedAction: recommendRecruiterAction(fitLevel) };
}
