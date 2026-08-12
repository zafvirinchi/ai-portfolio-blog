// Deterministic keyword/synonym/family matching between a resume's skill
// list and a job description's skill list.
//
// Phase 13 Milestone 15 fix: the previous version used naive substring
// containment ("javascript".includes("java")), which produced a real
// false positive — a resume listing only "Java" was reported as matching
// a JD requiring "JavaScript". Containment is now WORD-BOUNDARY-AWARE:
// "spring" matches "spring boot" (a whole word is a prefix of the other's
// word sequence) but "java" no longer matches "javascript" (not a
// distinct word within it). Legitimate no-space equivalents that used to
// rely on the unsafe containment behavior (e.g. Angular / AngularJS) are
// now explicit SYNONYM_MAP entries instead — a curated, intentional
// equivalence rather than an accidental one.

const SYNONYM_MAP: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  k8s: "kubernetes",
  node: "node.js",
  nodejs: "node.js",
  reactjs: "react",
  "react.js": "react",
  vuejs: "vue",
  "vue.js": "vue",
  angularjs: "angular",
  "angular.js": "angular",
  postgres: "postgresql",
  mongo: "mongodb",
  gcp: "google cloud platform",
  aws: "amazon web services",
  cicd: "ci/cd",
  ml: "machine learning",
  ai: "artificial intelligence",
};

/**
 * Curated groups of technologies that are the same product FAMILY but
 * not the same specific thing — e.g. "Spring Boot" and "Spring Cloud"
 * are both part of the Spring ecosystem, but experience with one does
 * not verify experience with the other. A JD skill in the same family
 * as a resume skill, without being a full match, becomes PARTIAL rather
 * than MATCHED (full credit) or MISSING (no credit) — deliberately a
 * short, hand-picked list, not a fuzzy semantic similarity computation,
 * so it can never accidentally group unrelated technologies (the exact
 * false-positive risk this milestone explicitly warns against).
 */
const FAMILY_GROUPS: string[][] = [
  ["spring", "spring boot", "spring framework", "spring mvc", "spring cloud", "spring security", "spring data"],
  ["react", "react native"],
  ["azure", "microsoft azure", "azure devops"],
  ["aws", "amazon web services", "aws lambda", "aws ec2", "aws eks", "aws s3"],
  ["kubernetes", "aws eks", "azure kubernetes service", "aks", "gke"],
  ["terraform", "terraform cloud"],
  [".net", ".net core", ".net framework", "asp.net"],
  ["sql server", "microsoft sql server", "mysql", "postgresql", "oracle database"],
];

function normalizeToken(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/\s+\d+(\.\d+)*\+?$/, "") // strip trailing version: "java 17" -> "java", "angular 18" -> "angular"
    .replace(/[^a-z0-9+#./ -]/g, "")
    .trim();
}

function canonicalize(token: string): string {
  const normalized = normalizeToken(token);
  return SYNONYM_MAP[normalized] ?? normalized;
}

/** Splits a canonical token into words on space/hyphen/slash/dot — the unit word-boundary matching operates on. */
function words(token: string): string[] {
  return token.split(/[\s/.-]+/).filter(Boolean);
}

/** Whether the shorter word sequence appears as a contiguous, word-aligned run within the longer one — "spring" within "spring boot", but never "java" within "javascript" (not a separate word there). */
function isWordAlignedContainment(shorter: string[], longer: string[]): boolean {
  if (shorter.length === 0 || shorter.length > longer.length) return false;

  for (let start = 0; start <= longer.length - shorter.length; start++) {
    if (shorter.every((word, offset) => longer[start + offset] === word)) return true;
  }

  return false;
}

function tokensMatch(a: string, b: string): boolean {
  const canonA = canonicalize(a);
  const canonB = canonicalize(b);

  if (!canonA || !canonB) return false;
  if (canonA === canonB) return true;

  const wordsA = words(canonA);
  const wordsB = words(canonB);
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];

  return isWordAlignedContainment(shorter, longer);
}

/** Same family group, but not already a full match (tokensMatch already false by the time this is called) — e.g. "spring cloud" and "spring boot" share the "spring" family without either containing the other. */
function sameFamily(a: string, b: string): boolean {
  const canonA = canonicalize(a);
  const canonB = canonicalize(b);
  if (!canonA || !canonB) return false;

  return FAMILY_GROUPS.some((group) => group.includes(canonA) && group.includes(canonB));
}

/** Whether `term` (a short skill/keyword token) appears anywhere within `text` (free-form prose). */
export function textContainsTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeToken(term);
  if (!normalizedTerm) return false;

  return normalizeToken(text).includes(normalizedTerm);
}

// ---------------------------------------------------------------------------
// Degree-level equivalence (Milestone 15, §11 — "do not penalize
// equivalent or higher qualifications"). Plain keyword matching alone
// treats "M.Tech Computer Science" and "Bachelor's in Computer Science"
// as completely unrelated strings — a resume with a HIGHER degree than
// required would incorrectly show that requirement as missing. This is
// a small, explicit level classifier (never a fuzzy semantic guess) —
// unrecognized phrasing on either side simply falls through to plain
// keyword matching rather than guessing.
// ---------------------------------------------------------------------------

const DEGREE_LEVEL_PATTERNS: { pattern: RegExp; level: number }[] = [
  { pattern: /\b(ph\.?d\.?|doctorate|doctoral)\b/, level: 3 },
  { pattern: /\b(m\.?tech|m\.?e\.?|m\.?s\.?|master'?s?|mba|m\.?a\.?|msc|m\.?ca)\b/, level: 2 },
  { pattern: /\b(b\.?tech|b\.?e\.?|b\.?s\.?|bachelor'?s?|bba|b\.?a\.?|bsc|b\.?ca)\b/, level: 1 },
];

const DEGREE_LEVEL_WORDS = /\b(ph\.?d\.?|doctorate|doctoral|m\.?tech|m\.?e\.?|m\.?s\.?|master'?s?|mba|m\.?a\.?|msc|m\.?ca|b\.?tech|b\.?e\.?|b\.?s\.?|bachelor'?s?|bba|b\.?a\.?|bsc|b\.?ca|degree|in|of|or|related|field)\b/g;

function degreeLevel(text: string): number {
  const lower = text.toLowerCase();
  return DEGREE_LEVEL_PATTERNS.find(({ pattern }) => pattern.test(lower))?.level ?? 0;
}

function degreeFieldWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(DEGREE_LEVEL_WORDS, " ")
    .split(/[\s,/-]+/)
    .filter((word) => word.length > 3);
}

/**
 * Whether `resumeDegree` satisfies `jdRequirement` because it's the SAME
 * OR HIGHER degree level (Bachelor's < Master's < Doctorate) in a
 * reasonably overlapping field — e.g. "M.Tech Computer Science" satisfies
 * "Bachelor's in Computer Science". Returns false (never a guess) when
 * either side's degree level can't be confidently classified, letting
 * the caller fall back to plain keyword matching.
 */
export function isEquivalentOrHigherDegree(resumeDegree: string, jdRequirement: string): boolean {
  const resumeLevel = degreeLevel(resumeDegree);
  const jdLevel = degreeLevel(jdRequirement);
  if (resumeLevel === 0 || jdLevel === 0 || resumeLevel < jdLevel) return false;

  const jdFieldWords = degreeFieldWords(jdRequirement);
  if (jdFieldWords.length === 0) return true; // JD only specified a level, no field

  const resumeFieldWords = new Set(degreeFieldWords(resumeDegree));
  return jdFieldWords.some((word) => resumeFieldWords.has(word));
}

/**
 * matchKeywords(), specialized for education requirements: a JD
 * requirement plain keyword matching would call "missing" is promoted
 * to "matched" when the resume has an equivalent-or-higher degree in a
 * reasonably overlapping field, phrased however differently (§11).
 * Never demotes an already-confirmed keyword match.
 */
export function matchEducationRequirements(resumeDegrees: string[], jdRequirements: string[]): KeywordMatchResult {
  const base = matchKeywords(resumeDegrees, jdRequirements);
  const stillMissing = base.missing.filter((requirement) => !resumeDegrees.some((degree) => isEquivalentOrHigherDegree(degree, requirement)));
  const promoted = base.missing.filter((requirement) => !stillMissing.includes(requirement));

  return { matched: [...base.matched, ...promoted], partial: base.partial, missing: stillMissing, additional: base.additional };
}

/**
 * Phase 13 Milestone 16 — extracted from jd-matcher.ts's matchEducation()
 * (previously an inline, private heuristic) so both that function and
 * the new Education/Certification proposal builder
 * (resume-versions/dynamic/optimization-review.ts) share one
 * implementation instead of two copies of the same "same vendor/area"
 * check. Same-first-word heuristic, unchanged behavior: flags a missing
 * JD certification as a "near miss" when the resume has a DIFFERENT but
 * related certification (e.g. JD wants "AWS Certified Solutions
 * Architect", resume has "AWS Certified Developer - Associate") — never
 * treated as a match, only ever surfaced as an informational note
 * alongside the gap (§3 — never fabricate a substitute certification).
 */
export function findRelatedCertification(jdCert: string, resumeCertNames: string[]): string | null {
  const jdFirstWord = jdCert.toLowerCase().split(" ")[0] ?? "";
  if (jdFirstWord.length <= 3) return null;

  return resumeCertNames.find((resumeCert) => (resumeCert.toLowerCase().split(" ")[0] ?? "") === jdFirstWord) ?? null;
}

/** The per-item counterpart to matchKeywords()'s aggregate matched/missing lists — which SPECIFIC item (if any) in `items` is a confirmed match for `term`, via the exact same exact/normalized/synonym-boundary logic matchKeywords() itself uses (never a second matching algorithm). */
function findExactMatch(items: string[], term: string): string | null {
  return items.find((item) => tokensMatch(item, term)) ?? null;
}

// ---------------------------------------------------------------------------
// Phase 13 Milestone 17 — per-requirement classification. matchKeywords()/
// matchEducationRequirements() answer "how many requirements does the
// resume satisfy" (aggregate lists, used for scoring/credit); the UI and
// the Education/Certification proposal builder need the complementary
// per-item view: "for THIS SPECIFIC requirement, which resume entry (if
// any) satisfies or relates to it, and how confidently." Both classifiers
// below are built on the exact same underlying decision functions
// (tokensMatch via findExactMatch, isEquivalentOrHigherDegree,
// findRelatedCertification) — no new matching algorithm, no duplicated
// decision logic, just a different aggregation shape for a different
// consumer.
// ---------------------------------------------------------------------------

export type EducationRequirementStatus = "matched" | "equivalent_or_higher" | "missing";

export interface EducationRequirementMatch {
  requirement: string;
  status: EducationRequirementStatus;
  /** The specific resume degree that satisfies (exactly or as an equivalent/higher qualification) this requirement — null when missing. Never fabricated: always a degree string that already exists in the resume. */
  resumeEvidence: string | null;
}

/**
 * One row per JD education requirement. Deliberately collapses "same
 * level" and "strictly higher level" into a single "equivalent_or_higher"
 * status rather than inventing a finer distinction the underlying
 * isEquivalentOrHigherDegree() classifier doesn't itself compute — that
 * function only ever answers "same or higher, in an overlapping field:
 * yes/no", so a fourth, more granular status would have to guess.
 */
export function classifyEducationRequirements(resumeDegrees: string[], jdRequirements: string[]): EducationRequirementMatch[] {
  return jdRequirements.map((requirement) => {
    const exact = findExactMatch(resumeDegrees, requirement);
    if (exact) return { requirement, status: "matched" as const, resumeEvidence: exact };

    const equivalent = resumeDegrees.find((degree) => isEquivalentOrHigherDegree(degree, requirement)) ?? null;
    if (equivalent) return { requirement, status: "equivalent_or_higher" as const, resumeEvidence: equivalent };

    return { requirement, status: "missing" as const, resumeEvidence: null };
  });
}

export type CertificationRequirementStatus = "matched" | "related" | "missing";

export interface CertificationRequirementMatch {
  requirement: string;
  status: CertificationRequirementStatus;
  /** The specific resume certification that satisfies or relates to this requirement — null when missing. For "related", this is a genuinely DIFFERENT certification the candidate holds (same vendor/area) — never the JD's own requirement text pretending to be resume evidence. */
  resumeEvidence: string | null;
}

export function classifyCertificationRequirements(resumeCertNames: string[], jdRequirements: string[]): CertificationRequirementMatch[] {
  return jdRequirements.map((requirement) => {
    const exact = findExactMatch(resumeCertNames, requirement);
    if (exact) return { requirement, status: "matched" as const, resumeEvidence: exact };

    const related = findRelatedCertification(requirement, resumeCertNames);
    if (related) return { requirement, status: "related" as const, resumeEvidence: related };

    return { requirement, status: "missing" as const, resumeEvidence: null };
  });
}

export interface PartialMatch {
  jdSkill: string;
  resumeSkill: string;
  reason: string;
}

export interface KeywordMatchResult {
  matched: string[];
  /** JD skills that are the same technology FAMILY as something on the resume, without being a confident full match — worth partial credit, not full credit, not zero. */
  partial: PartialMatch[];
  missing: string[];
  additional: string[];
}

/** A partial match earns half credit toward any matched.length/total-style percentage — full credit would overstate an unverified family relation, zero credit would ignore genuinely relevant adjacent experience. */
export const PARTIAL_MATCH_CREDIT = 0.5;

/** The one place "how many of these requirements does the resume satisfy" is computed as a single number — every score that previously used raw `matched.length` now goes through this, so partial credit is applied uniformly everywhere it matters (jd-matcher's overallMatch, ats-engine's per-category scores). */
export function matchCredit(result: Pick<KeywordMatchResult, "matched" | "partial">): number {
  return result.matched.length + result.partial.length * PARTIAL_MATCH_CREDIT;
}

/**
 * `matched`/`partial`/`missing` are relative to `jdSkills` (does the
 * resume cover each thing the JD asks for, fully, partially, or not at
 * all); `additional` is what the resume has that the JD didn't ask for.
 */
export function matchKeywords(resumeSkills: string[], jdSkills: string[]): KeywordMatchResult {
  const matched: string[] = [];
  const partial: PartialMatch[] = [];
  const missing: string[] = [];

  for (const jdSkill of jdSkills) {
    const fullMatch = resumeSkills.find((resumeSkill) => tokensMatch(resumeSkill, jdSkill));
    if (fullMatch) {
      matched.push(jdSkill);
      continue;
    }

    const familyMatch = resumeSkills.find((resumeSkill) => sameFamily(resumeSkill, jdSkill));
    if (familyMatch) {
      partial.push({
        jdSkill,
        resumeSkill: familyMatch,
        reason: `Your resume shows "${familyMatch}", in the same technology family as "${jdSkill}" — related, but not confirmed as the same specific skill.`,
      });
      continue;
    }

    missing.push(jdSkill);
  }

  // Deduped case-insensitively: callers often pass overlapping lists (e.g.
  // a Resume's `skills` and `technicalSkills` largely overlap by design —
  // resume/resume-parser.ts's own prompt describes technicalSkills as "the
  // same skills re-classified"), which would otherwise surface the same
  // token twice in "additional".
  const seen = new Set<string>();
  const additional: string[] = [];

  for (const resumeSkill of resumeSkills) {
    const alreadyCounted = jdSkills.some((jdSkill) => tokensMatch(resumeSkill, jdSkill) || sameFamily(resumeSkill, jdSkill));
    if (alreadyCounted) continue;

    const key = resumeSkill.trim().toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    additional.push(resumeSkill.trim());
  }

  return { matched, partial, missing, additional };
}
