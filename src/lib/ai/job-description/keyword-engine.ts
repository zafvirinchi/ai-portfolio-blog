// Deterministic keyword/synonym matching between a resume's skill list and
// a job description's skill list. Implements the spec's three worked
// examples directly: "Spring Boot" (JD) matches resume's "Spring" via
// substring containment; "Java 17" (JD) matches resume's "Java" via
// trailing-version stripping; "Angular 18" (JD) matches resume's "Angular"
// the same way.

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
  postgres: "postgresql",
  mongo: "mongodb",
  gcp: "google cloud platform",
  aws: "amazon web services",
  cicd: "ci/cd",
  ml: "machine learning",
  ai: "artificial intelligence",
};

function normalizeToken(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/\s+\d+(\.\d+)*\+?$/, "") // strip trailing version: "java 17" -> "java", "angular 18" -> "angular"
    .replace(/[^a-z0-9+#./ ]/g, "")
    .trim();
}

function canonicalize(token: string): string {
  const normalized = normalizeToken(token);
  return SYNONYM_MAP[normalized] ?? normalized;
}

function tokensMatch(a: string, b: string): boolean {
  const canonA = canonicalize(a);
  const canonB = canonicalize(b);

  if (!canonA || !canonB) return false;
  if (canonA === canonB) return true;
  if (canonA.length < 2 || canonB.length < 2) return false;

  return canonA.includes(canonB) || canonB.includes(canonA);
}

/** Whether `term` (a short skill/keyword token) appears anywhere within `text` (free-form prose). */
export function textContainsTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeToken(term);
  if (!normalizedTerm) return false;

  return normalizeToken(text).includes(normalizedTerm);
}

export interface KeywordMatchResult {
  matched: string[];
  missing: string[];
  additional: string[];
}

/**
 * `matched`/`missing` are relative to `jdSkills` (does the resume cover
 * each thing the JD asks for); `additional` is what the resume has that
 * the JD didn't ask for.
 */
export function matchKeywords(resumeSkills: string[], jdSkills: string[]): KeywordMatchResult {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const jdSkill of jdSkills) {
    const hasMatch = resumeSkills.some((resumeSkill) => tokensMatch(resumeSkill, jdSkill));
    if (hasMatch) matched.push(jdSkill);
    else missing.push(jdSkill);
  }

  // Deduped case-insensitively: callers often pass overlapping lists (e.g.
  // a Resume's `skills` and `technicalSkills` largely overlap by design —
  // resume/resume-parser.ts's own prompt describes technicalSkills as "the
  // same skills re-classified"), which would otherwise surface the same
  // token twice in "additional".
  const seen = new Set<string>();
  const additional: string[] = [];

  for (const resumeSkill of resumeSkills) {
    if (jdSkills.some((jdSkill) => tokensMatch(resumeSkill, jdSkill))) continue;

    const key = resumeSkill.trim().toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    additional.push(resumeSkill.trim());
  }

  return { matched, missing, additional };
}
