import { JdMatchResult } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { SeoKeywordCoverage, SeoReport } from "./linkedin-schema";
import { LinkedinRecord } from "./linkedin-types";

// Deterministic — no LLM call. Same "re-derive from real text, never
// trust a self-report" discipline as Milestone 6's computeKeywordCoverage.

function containsWholeTermLoose(haystack: string, term: string): boolean {
  if (!term.trim()) return false;
  const escaped = term.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, "i");
  return pattern.test(haystack);
}

function resolveKeywordList(resume: Resume, jdMatchResult?: JdMatchResult): string[] {
  if (jdMatchResult) {
    return Array.from(new Set([...jdMatchResult.matchedSkills, ...jdMatchResult.missingSkills]));
  }

  return Array.from(new Set([...resume.skills, ...resume.technicalSkills]));
}

function currentHeadlineText(record: LinkedinRecord): string {
  const accepted = record.acceptedHeadlineStyle ? record.headlines[record.acceptedHeadlineStyle] : undefined;
  return (accepted ?? Object.values(record.headlines)[0])?.text ?? "";
}

function currentAboutText(record: LinkedinRecord): string {
  const accepted = record.acceptedAboutStyle ? record.about[record.acceptedAboutStyle] : undefined;
  return (accepted ?? Object.values(record.about)[0])?.text ?? "";
}

export function computeSeoReport(record: LinkedinRecord, resume: Resume, jdMatchResult?: JdMatchResult): SeoReport {
  const keywords = resolveKeywordList(resume, jdMatchResult);

  const headlineText = currentHeadlineText(record).toLowerCase();
  const aboutText = currentAboutText(record).toLowerCase();
  const skillsText = (record.skills ?? []).flatMap((group) => group.skills).join(" ").toLowerCase();
  const experienceText = (record.experience ?? []).map((item) => item.rewritten).join(" ").toLowerCase();

  const coverage: SeoKeywordCoverage[] = keywords.map((keyword) => ({
    keyword,
    inHeadline: containsWholeTermLoose(headlineText, keyword),
    inAbout: containsWholeTermLoose(aboutText, keyword),
    inSkills: containsWholeTermLoose(skillsText, keyword),
    inExperience: containsWholeTermLoose(experienceText, keyword),
  }));

  const missingKeywords = coverage
    .filter((entry) => !entry.inHeadline && !entry.inAbout && !entry.inSkills && !entry.inExperience)
    .map((entry) => entry.keyword);

  const coveredCount = coverage.length - missingKeywords.length;
  const coverageRatio = coverage.length === 0 ? 0 : coveredCount / coverage.length;
  const headlineHits = coverage.filter((entry) => entry.inHeadline).length;

  // LinkedIn search weights the headline heavily — reward keyword
  // breadth, with extra credit for headline placement specifically.
  const searchRankingScore = Math.round(
    Math.min(100, coverageRatio * 70 + (coverage.length === 0 ? 0 : (headlineHits / coverage.length) * 30))
  );

  // Recruiter boolean search hits more fields = more likely to surface
  // — reward breadth across sections, not just keyword count.
  const sectionsPresent = [headlineText, aboutText, skillsText, experienceText].filter((text) => text.trim().length > 0).length;
  const recruiterVisibilityScore = Math.round(Math.min(100, coverageRatio * 60 + (sectionsPresent / 4) * 40));

  const recommendations: string[] = [];
  if (!headlineText) recommendations.push("Generate and accept a Headline — it's the single highest-weighted field for LinkedIn search.");
  if (!aboutText) recommendations.push("Generate an About section — recruiters read it right after the headline.");
  if (missingKeywords.length > 0) {
    recommendations.push(`Consider working in these real keywords where genuinely true: ${missingKeywords.slice(0, 5).join(", ")}.`);
  }
  if (coverage.length > 0 && headlineHits < Math.min(3, coverage.length)) {
    recommendations.push("Your Headline surfaces few of your real keywords — consider a more keyword-dense style like Recruiter or FAANG.");
  }

  return {
    keywordCoverage: coverage,
    missingKeywords,
    searchRankingScore,
    recruiterVisibilityScore,
    recommendations,
  };
}
