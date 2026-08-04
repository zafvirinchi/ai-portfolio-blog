import { EnterpriseResume, ResumeParserConfidence } from "../resume-schema";
import { DetectedSection, ParserQuality, TimelineEntry } from "./parser-types";

// Phase 12 Milestone 5. A transparent, inspectable parser-quality score:
// every point deducted is tied to a specific, listed issue rather than an
// opaque single number.

const EXPECTED_SECTIONS_FOR_ANY_RESUME: DetectedSection["section"][] = ["summary", "experience", "education", "skills"];

export function computeParserQuality(
  resume: EnterpriseResume,
  confidence: ResumeParserConfidence,
  timeline: TimelineEntry[],
  sections: DetectedSection[]
): ParserQuality {
  const issues: string[] = [];
  let score = 100;

  const detectedKeys = new Set(sections.map((entry) => entry.section));
  const missingExpected = EXPECTED_SECTIONS_FOR_ANY_RESUME.filter((key) => !detectedKeys.has(key));
  if (missingExpected.length > 0) {
    issues.push(`Could not detect a heading for: ${missingExpected.join(", ")}.`);
    score -= missingExpected.length * 10;
  }

  score -= Math.round((1 - confidence.overall) * 30);

  const ambiguousDates = timeline.filter((entry) => (entry.rawStartDate || entry.rawEndDate) && !entry.startDate).length;
  if (ambiguousDates > 0) {
    issues.push(`${ambiguousDates} timeline entr${ambiguousDates === 1 ? "y has" : "ies have"} an unparseable date.`);
    score -= ambiguousDates * 5;
  }

  const missingEmployers = resume.companyHistory.filter((company) => !company.companyName).length;
  if (missingEmployers > 0) {
    issues.push(
      `${missingEmployers} work-experience entr${missingEmployers === 1 ? "y is" : "ies are"} missing an employer name.`
    );
    score -= missingEmployers * 5;
  }

  const missingDegrees = resume.education.filter((entry) => !entry.degree).length;
  if (missingDegrees > 0) {
    issues.push(`${missingDegrees} education entr${missingDegrees === 1 ? "y is" : "ies are"} missing a degree name.`);
    score -= missingDegrees * 5;
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), issues };
}
