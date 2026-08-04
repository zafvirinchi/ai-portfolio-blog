import { ResumeEducation } from "../resume-schema";
import { NormalizedEducation } from "./parser-types";

// Phase 12 Milestone 5. Degree-name canonicalization, percentage/CGPA
// parsing, and best-effort city/country extraction from the institute
// string — none of which the Milestone 1 schema captures as separate
// fields.

const DEGREE_ALIASES: Record<string, string> = {
  "b.tech": "Bachelor of Technology",
  btech: "Bachelor of Technology",
  "b.e": "Bachelor of Engineering",
  "b.e.": "Bachelor of Engineering",
  be: "Bachelor of Engineering",
  "m.tech": "Master of Technology",
  mtech: "Master of Technology",
  "m.e": "Master of Engineering",
  "m.e.": "Master of Engineering",
  "b.sc": "Bachelor of Science",
  bsc: "Bachelor of Science",
  "m.sc": "Master of Science",
  msc: "Master of Science",
  bca: "Bachelor of Computer Applications",
  mca: "Master of Computer Applications",
  mba: "Master of Business Administration",
  "b.com": "Bachelor of Commerce",
  bcom: "Bachelor of Commerce",
  phd: "Doctor of Philosophy",
  "ph.d": "Doctor of Philosophy",
  "ph.d.": "Doctor of Philosophy",
};

function normalizeDegree(degree: string | null): string | null {
  if (!degree) return null;

  const key = degree.trim().toLowerCase().replace(/\s+/g, "");
  return DEGREE_ALIASES[key] ?? degree.trim();
}

function parseGrade(grade: string | null): NormalizedEducation["grade"] {
  if (!grade) return null;
  const trimmed = grade.trim();

  const percentMatch = trimmed.match(/(\d{1,3}(?:\.\d+)?)\s?%/);
  if (percentMatch) {
    return { type: "percentage", value: Number(percentMatch[1]) };
  }

  // Only classified as CGPA when the text explicitly says so — a bare
  // number is ambiguous and left unparsed rather than guessed.
  if (/cgpa|gpa|\/\s*10\b|\/\s*4\b/i.test(trimmed)) {
    const numberMatch = trimmed.match(/\d(?:\.\d+)?/);
    if (numberMatch) {
      return { type: "cgpa", value: Number(numberMatch[0]) };
    }
  }

  return null;
}

/** Best-effort: "XYZ University, Pune, India" -> city "Pune", country "India". Not guaranteed for every institute-string convention. */
function extractLocationFromInstitute(institute: string | null): { city: string | null; country: string | null } {
  if (!institute) return { city: null, country: null };

  const parts = institute
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return { city: null, country: null };

  return {
    country: parts[parts.length - 1] ?? null,
    city: parts.length >= 3 ? parts[parts.length - 2] : null,
  };
}

export function normalizeEducation(entries: ResumeEducation[]): NormalizedEducation[] {
  return entries.map((entry) => {
    const { city, country } = extractLocationFromInstitute(entry.institute);

    return {
      institute: entry.institute,
      degree: normalizeDegree(entry.degree),
      specialization: entry.specialization,
      startYear: entry.startYear,
      endYear: entry.endYear,
      grade: parseGrade(entry.grade),
      city,
      country,
    };
  });
}
