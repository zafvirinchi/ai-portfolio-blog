import { DetectedSection, ParserSectionKey } from "./parser-types";

// Phase 12 Milestone 5. Detects section boundaries in the raw resume text
// (the same normalized text extractEnterpriseResumeText() produces) using
// heading heuristics: short lines that are ALL-CAPS, Title Case, or
// numbered, matched against a table of known heading variants. No font-
// style/spacing metadata exists at this pipeline stage — Milestone 2's
// extraction already flattens the document to plain text — so this is
// text-shape heuristics only, documented rather than silently pretending
// to see layout that was never captured.

const SECTION_HEADING_ALIASES: Record<ParserSectionKey, string[]> = {
  summary: [
    "summary",
    "professional summary",
    "career objective",
    "objective",
    "about me",
    "profile",
  ],
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "career history",
    "employment history",
  ],
  education: ["education", "academic background", "educational qualification", "educational qualifications"],
  projects: ["projects", "key projects", "academic projects", "professional projects", "personal projects"],
  skills: ["skills", "key skills", "core competencies"],
  technicalSkills: ["technical skills", "technology skills", "tech skills"],
  softSkills: ["soft skills", "interpersonal skills"],
  achievements: ["achievements", "key achievements", "accomplishments"],
  awards: ["awards", "awards and honors", "honors", "honours"],
  certifications: ["certifications", "certificates", "licenses and certifications", "licenses & certifications"],
  languages: ["languages", "languages known"],
  publications: ["publications"],
  patents: ["patents"],
  volunteerExperience: ["volunteer experience", "volunteering", "community service"],
  internships: ["internships", "internship experience"],
  trainings: ["trainings", "training", "workshops"],
  interests: ["interests", "hobbies", "hobbies and interests"],
  references: ["references", "references available upon request"],
};

function isHeadingCandidate(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 40) return false;

  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (!letters) return false;

  const isAllCaps = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  const isNumbered = /^\d+[.)]\s*[A-Za-z]/.test(trimmed);
  const isTitleCase = /^([A-Z][a-zA-Z&]*\s*){1,5}$/.test(trimmed) && !/[.!?]$/.test(trimmed);

  return isAllCaps || isNumbered || isTitleCase;
}

function normalizeHeadingText(line: string): string {
  return line
    .replace(/^\d+[.)]\s*/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchSection(normalized: string): { section: ParserSectionKey; confidence: number } | null {
  const entries = Object.entries(SECTION_HEADING_ALIASES) as [ParserSectionKey, string[]][];

  for (const [section, aliases] of entries) {
    if (aliases.includes(normalized)) {
      return { section, confidence: 1 };
    }
  }

  for (const [section, aliases] of entries) {
    if (aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
      return { section, confidence: 0.6 };
    }
  }

  return null;
}

export function detectSections(rawText: string): DetectedSection[] {
  const lines = rawText.split(/\r?\n/);

  const candidates: { lineIndex: number; section: ParserSectionKey; heading: string; confidence: number }[] = [];

  lines.forEach((line, index) => {
    if (!isHeadingCandidate(line)) return;

    const match = matchSection(normalizeHeadingText(line));
    if (match) {
      candidates.push({ lineIndex: index, section: match.section, heading: line.trim(), confidence: match.confidence });
    }
  });

  return candidates.map((candidate, index) => {
    const nextStart = candidates[index + 1]?.lineIndex ?? lines.length;

    return {
      section: candidate.section,
      heading: candidate.heading,
      startLine: candidate.lineIndex,
      endLine: Math.max(candidate.lineIndex, nextStart - 1),
      confidence: candidate.confidence,
    };
  });
}

/** Returns the raw text belonging to one detected section (excluding its heading line), or null if that section wasn't detected. */
export function getSectionText(rawText: string, detected: DetectedSection[], section: ParserSectionKey): string | null {
  const match = detected.find((entry) => entry.section === section);
  if (!match) return null;

  const lines = rawText.split(/\r?\n/);
  const text = lines.slice(match.startLine + 1, match.endLine + 1).join("\n").trim();

  return text || null;
}
