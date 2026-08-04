import { EnterpriseResume } from "../resume-schema";
import {
  AchievementFindingType,
  AchievementPattern,
  AtsSectionKey,
  AtsTechnologyCategory,
  FeedbackRule,
  TechnologyDictionaryEntry,
  WeakPhraseRule,
} from "./ats-types";

// Phase 12 Milestone 3. Everything the deterministic ATS engine needs that
// isn't computed at runtime: point weights, status thresholds, the
// technology/keyword dictionary, weak-phrase and achievement-pattern
// tables, and the declarative feedback-rule table. Also hosts a handful of
// small, generic text-scanning helpers (collectExperienceText,
// countWholeWordMatches, ...) that FEEDBACK_RULES' own predicates need and
// that ats-breakdown.ts/ats-score.ts/ats-feedback.ts reuse rather than
// re-implementing "how do we scan a resume's free text" in three places.

// ---------------------------------------------------------------------------
// Section weights (sum to 100 — see the milestone spec's point breakdown)
// ---------------------------------------------------------------------------

export const SECTION_MAX_SCORES: Record<AtsSectionKey, number> = {
  contactInformation: 10,
  professionalSummary: 10,
  experience: 20,
  education: 10,
  projects: 10,
  skills: 15,
  formatting: 10,
  achievements: 5,
  certifications: 5,
  keywordDensity: 5,
};

export const SECTION_LABELS: Record<AtsSectionKey, string> = {
  contactInformation: "Contact Information",
  professionalSummary: "Professional Summary",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  formatting: "Formatting",
  achievements: "Achievements",
  certifications: "Certifications",
  keywordDensity: "Keyword Density",
};

// ---------------------------------------------------------------------------
// Status thresholds
// ---------------------------------------------------------------------------

export const SECTION_STATUS_THRESHOLDS = [
  { min: 90, status: "Excellent" as const },
  { min: 75, status: "Good" as const },
  { min: 55, status: "Average" as const },
  { min: 35, status: "Poor" as const },
  { min: 0, status: "Critical" as const },
];

export const TECH_MENTION_THRESHOLDS = [
  { min: 4, status: "Excellent" as const },
  { min: 3, status: "Good" as const },
  { min: 2, status: "Average" as const },
  { min: 1, status: "Poor" as const },
  { min: 0, status: "Missing" as const },
];

// ---------------------------------------------------------------------------
// Technology dictionary — 11 keyword-density categories. Bounded, curated
// list rather than an exhaustive one: broad enough to give a meaningful
// signal, small enough to stay reviewable and deterministic.
// ---------------------------------------------------------------------------

export const TECHNOLOGY_DICTIONARY: TechnologyDictionaryEntry[] = [
  // Programming Languages
  { name: "Java", category: "Programming Languages", aliases: [] },
  { name: "Python", category: "Programming Languages", aliases: [] },
  { name: "JavaScript", category: "Programming Languages", aliases: ["js"] },
  { name: "TypeScript", category: "Programming Languages", aliases: ["ts"] },
  { name: "Go", category: "Programming Languages", aliases: ["golang"] },
  { name: "C#", category: "Programming Languages", aliases: [] },
  { name: "C++", category: "Programming Languages", aliases: [] },
  { name: "Ruby", category: "Programming Languages", aliases: [] },
  { name: "PHP", category: "Programming Languages", aliases: [] },
  { name: "Kotlin", category: "Programming Languages", aliases: [] },
  { name: "Swift", category: "Programming Languages", aliases: [] },
  // Frameworks
  { name: "Spring Boot", category: "Frameworks", aliases: ["springboot"] },
  { name: "React", category: "Frameworks", aliases: ["react.js", "reactjs"] },
  { name: "Angular", category: "Frameworks", aliases: [] },
  { name: "Vue.js", category: "Frameworks", aliases: ["vuejs", "vue"] },
  { name: "Express", category: "Frameworks", aliases: ["express.js", "expressjs"] },
  { name: "Django", category: "Frameworks", aliases: [] },
  { name: "Flask", category: "Frameworks", aliases: [] },
  { name: ".NET", category: "Frameworks", aliases: ["dotnet", "asp.net"] },
  { name: "Next.js", category: "Frameworks", aliases: ["nextjs"] },
  // Cloud
  { name: "AWS", category: "Cloud", aliases: ["amazon web services"] },
  { name: "Azure", category: "Cloud", aliases: ["microsoft azure"] },
  { name: "GCP", category: "Cloud", aliases: ["google cloud platform", "google cloud"] },
  { name: "EC2", category: "Cloud", aliases: [] },
  { name: "S3", category: "Cloud", aliases: [] },
  { name: "Lambda", category: "Cloud", aliases: ["aws lambda"] },
  { name: "CloudFormation", category: "Cloud", aliases: [] },
  // Databases
  { name: "MySQL", category: "Databases", aliases: [] },
  { name: "PostgreSQL", category: "Databases", aliases: ["postgres"] },
  { name: "MongoDB", category: "Databases", aliases: ["mongo"] },
  { name: "Redis", category: "Databases", aliases: [] },
  { name: "Oracle", category: "Databases", aliases: [] },
  { name: "DynamoDB", category: "Databases", aliases: [] },
  { name: "Cassandra", category: "Databases", aliases: [] },
  { name: "SQL Server", category: "Databases", aliases: ["mssql"] },
  // DevOps
  { name: "Docker", category: "DevOps", aliases: [] },
  { name: "Kubernetes", category: "DevOps", aliases: ["k8s"] },
  { name: "Jenkins", category: "DevOps", aliases: [] },
  { name: "Terraform", category: "DevOps", aliases: [] },
  { name: "Ansible", category: "DevOps", aliases: [] },
  { name: "CI/CD", category: "DevOps", aliases: ["continuous integration", "continuous deployment"] },
  { name: "GitHub Actions", category: "DevOps", aliases: [] },
  { name: "GitLab CI", category: "DevOps", aliases: [] },
  { name: "Helm", category: "DevOps", aliases: [] },
  // AI
  { name: "Machine Learning", category: "AI", aliases: ["ml"] },
  { name: "TensorFlow", category: "AI", aliases: [] },
  { name: "PyTorch", category: "AI", aliases: [] },
  { name: "LangChain", category: "AI", aliases: [] },
  { name: "OpenAI", category: "AI", aliases: ["gpt", "chatgpt"] },
  { name: "LLM", category: "AI", aliases: ["large language model", "large language models"] },
  { name: "NLP", category: "AI", aliases: ["natural language processing"] },
  { name: "Deep Learning", category: "AI", aliases: [] },
  // Security
  { name: "OAuth", category: "Security", aliases: ["oauth2", "oauth 2.0"] },
  { name: "JWT", category: "Security", aliases: [] },
  { name: "Encryption", category: "Security", aliases: [] },
  { name: "SSL/TLS", category: "Security", aliases: ["ssl", "tls"] },
  { name: "Penetration Testing", category: "Security", aliases: ["pen testing", "pentest"] },
  { name: "OWASP", category: "Security", aliases: [] },
  // Architecture
  { name: "Microservices", category: "Architecture", aliases: [] },
  { name: "Event-Driven Architecture", category: "Architecture", aliases: ["event driven"] },
  { name: "Design Patterns", category: "Architecture", aliases: [] },
  { name: "System Design", category: "Architecture", aliases: [] },
  { name: "Domain-Driven Design", category: "Architecture", aliases: ["ddd"] },
  // Testing
  { name: "JUnit", category: "Testing", aliases: [] },
  { name: "Selenium", category: "Testing", aliases: [] },
  { name: "Cypress", category: "Testing", aliases: [] },
  { name: "Jest", category: "Testing", aliases: [] },
  { name: "TestNG", category: "Testing", aliases: [] },
  { name: "Mockito", category: "Testing", aliases: [] },
  { name: "Postman", category: "Testing", aliases: [] },
  // Frontend
  { name: "HTML", category: "Frontend", aliases: ["html5"] },
  { name: "CSS", category: "Frontend", aliases: ["css3"] },
  { name: "Tailwind CSS", category: "Frontend", aliases: ["tailwind"] },
  { name: "Bootstrap", category: "Frontend", aliases: [] },
  { name: "Redux", category: "Frontend", aliases: [] },
  { name: "SASS", category: "Frontend", aliases: ["scss"] },
  // Backend
  { name: "Node.js", category: "Backend", aliases: ["nodejs", "node"] },
  { name: "Kafka", category: "Backend", aliases: [] },
  { name: "RabbitMQ", category: "Backend", aliases: [] },
  { name: "GraphQL", category: "Backend", aliases: [] },
  { name: "REST API", category: "Backend", aliases: ["rest", "restful"] },
  { name: "gRPC", category: "Backend", aliases: [] },
];

export const TECHNOLOGY_CATEGORIES: AtsTechnologyCategory[] = Array.from(
  new Set(TECHNOLOGY_DICTIONARY.map((entry) => entry.category))
);

// ---------------------------------------------------------------------------
// Weak phrases / strong verbs
// ---------------------------------------------------------------------------

export const STRONG_ACTION_VERBS = [
  "Designed",
  "Architected",
  "Implemented",
  "Optimized",
  "Reduced",
  "Improved",
  "Developed",
  "Led",
  "Created",
  "Delivered",
];

export const WEAK_PHRASES: WeakPhraseRule[] = [
  { phrase: "responsible for", replacements: ["Led", "Developed", "Delivered"] },
  { phrase: "worked on", replacements: ["Developed", "Implemented", "Created"] },
  { phrase: "helped", replacements: ["Led", "Improved", "Delivered"] },
  { phrase: "participated in", replacements: ["Led", "Developed", "Improved"] },
  { phrase: "involved in", replacements: ["Led", "Designed", "Implemented"] },
];

// ---------------------------------------------------------------------------
// Achievement patterns — heuristic, presence-based (not proximity-aware:
// "reduced latency" and an unrelated "%" elsewhere in the same bullet both
// count as a hit for their respective type; good enough for a rule-based
// signal, documented as a known limitation).
// ---------------------------------------------------------------------------

export const ACHIEVEMENT_PATTERNS: AchievementPattern[] = [
  { type: "percentage", pattern: /\d{1,3}\s?%/ },
  { type: "revenue", pattern: /\$\s?[\d][\d,.]*|\brevenue\b/i },
  { type: "performance", pattern: /\b(performance|latency|throughput)\b/i },
  { type: "costSavings", pattern: /\b(cost saving|cost savings|reduced cost|cost reduction)\b/i },
  { type: "userGrowth", pattern: /\b(user growth|active users|user base growth)\b/i },
  { type: "responseTime", pattern: /\bresponse time\b/i },
  { type: "automation", pattern: /\bautomat(e|ed|ing|ion)\b/i },
];

// ---------------------------------------------------------------------------
// Formatting thresholds
// ---------------------------------------------------------------------------

export const FORMATTING_THRESHOLDS = {
  largeParagraphCharLimit: 400,
  veryShortResumeWordCount: 150,
  veryLongResumeWordCount: 1200,
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[+]?[\d\s().-]{7,20}$/;

// A broad, well-rounded resume typically names ~15-20 recognizable
// technologies across categories — used as the target for the Keyword
// Density *section score* (ats-score.ts). Deliberately NOT "100% of the
// 80+ entry dictionary": that dictionary spans 11 unrelated domains
// (Frontend, Security, Testing, ...) on purpose so computeKeywordDensity's
// per-category breakdown (ats-breakdown.ts) stays informative even for a
// narrowly-specialized resume — but scoring against full dictionary
// coverage would make "Excellent" nearly unreachable for any real,
// domain-focused candidate.
export const KEYWORD_DENSITY_SCORE_TARGET = 18;

// ---------------------------------------------------------------------------
// Shared text-scanning helpers
// ---------------------------------------------------------------------------

export function collectExperienceText(resume: EnterpriseResume): string[] {
  return resume.companyHistory.flatMap((company) => [
    ...company.responsibilities,
    ...company.achievements,
  ]);
}

export function collectProjectText(resume: EnterpriseResume): string[] {
  return resume.projects.flatMap((project) => [
    ...(project.description ? [project.description] : []),
    ...project.responsibilities,
    ...project.achievements,
  ]);
}

export function collectAllFreeText(resume: EnterpriseResume): string[] {
  const summaryText = [
    resume.professionalSummary.headline,
    resume.professionalSummary.currentDesignation,
    resume.professionalSummary.careerObjective,
  ].filter((value): value is string => Boolean(value));

  return [
    ...summaryText,
    ...collectExperienceText(resume),
    ...collectProjectText(resume),
    ...resume.achievements,
  ];
}

export function collectSkillTokens(resume: EnterpriseResume): string[] {
  return resume.skills.flatMap((group) => group.skills);
}

export function collectProjectTechTokens(resume: EnterpriseResume): string[] {
  return resume.projects.flatMap((project) => project.technologies);
}

function isAlphanumeric(char: string | undefined): boolean {
  return char !== undefined && /[a-z0-9]/i.test(char);
}

/**
 * Case-insensitive "whole term" match count that also works for terms
 * ending/starting in symbols (C++, C#, CI/CD) — JS regex `\b` doesn't
 * reliably bound symbol-terminated terms, so this checks alphanumeric
 * boundaries manually instead of relying on `\b`.
 */
export function countWholeWordMatches(haystack: string, term: string): number {
  const lowerHaystack = haystack.toLowerCase();
  const lowerTerm = term.toLowerCase();
  if (!lowerTerm) return 0;

  const needsBoundaryBefore = isAlphanumeric(lowerTerm[0]);
  const needsBoundaryAfter = isAlphanumeric(lowerTerm[lowerTerm.length - 1]);

  let count = 0;
  let fromIndex = 0;

  for (;;) {
    const index = lowerHaystack.indexOf(lowerTerm, fromIndex);
    if (index === -1) break;

    const before = lowerHaystack[index - 1];
    const after = lowerHaystack[index + lowerTerm.length];
    const boundaryOk =
      (!needsBoundaryBefore || !isAlphanumeric(before)) &&
      (!needsBoundaryAfter || !isAlphanumeric(after));

    if (boundaryOk) count++;
    fromIndex = index + lowerTerm.length;
  }

  return count;
}

/** Counts mentions of a dictionary entry (name + aliases) across one or more text sources. */
export function countTechnologyMentions(texts: string[], entry: TechnologyDictionaryEntry): number {
  const terms = [entry.name, ...entry.aliases];
  return texts.reduce(
    (sum, text) => sum + terms.reduce((termSum, term) => termSum + countWholeWordMatches(text, term), 0),
    0
  );
}

export function wordCount(texts: string[]): number {
  return texts.reduce((sum, text) => sum + text.trim().split(/\s+/).filter(Boolean).length, 0);
}

export function findWeakPhraseOccurrences(texts: string[]): { phrase: string; occurrences: number }[] {
  return WEAK_PHRASES.map((rule) => ({
    phrase: rule.phrase,
    occurrences: texts.reduce((sum, text) => sum + countWholeWordMatches(text, rule.phrase), 0),
  })).filter((entry) => entry.occurrences > 0);
}

export function countWeakPhraseHits(texts: string[]): number {
  return findWeakPhraseOccurrences(texts).reduce((sum, entry) => sum + entry.occurrences, 0);
}

export function findAchievementMatches(
  texts: string[]
): { type: AchievementFindingType; snippet: string }[] {
  const matches: { type: AchievementFindingType; snippet: string }[] = [];

  for (const text of texts) {
    for (const { type, pattern } of ACHIEVEMENT_PATTERNS) {
      if (pattern.test(text)) {
        matches.push({ type, snippet: text.trim() });
      }
    }
  }

  return matches;
}

export function hasAchievementSignal(texts: string[]): boolean {
  return findAchievementMatches(texts).length > 0;
}

function startsWithStrongVerb(text: string): boolean {
  const firstWord = text.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "").toLowerCase();
  return STRONG_ACTION_VERBS.some((verb) => verb.toLowerCase() === firstWord);
}

export function totalSkillCount(resume: EnterpriseResume): number {
  return collectSkillTokens(resume).length;
}

export function skillsContainCategory(resume: EnterpriseResume, category: AtsTechnologyCategory): boolean {
  const tokens = [...collectSkillTokens(resume), ...collectProjectTechTokens(resume)];
  const dictionaryEntries = TECHNOLOGY_DICTIONARY.filter((entry) => entry.category === category);

  return dictionaryEntries.some((entry) => countTechnologyMentions(tokens, entry) > 0);
}

// ---------------------------------------------------------------------------
// Feedback rules — declarative table backing every message in the spec.
// Each rule's `appliesTo` is a pure function of the resume (never of
// engine-computed state), so this table has no dependency on
// ats-breakdown.ts/ats-score.ts and stays a leaf module.
// ---------------------------------------------------------------------------

export const FEEDBACK_RULES: FeedbackRule[] = [
  {
    id: "missing-linkedin",
    section: "contactInformation",
    priority: "Medium",
    impact: 2,
    quickFix: true,
    message: "Missing LinkedIn profile — add your LinkedIn URL so recruiters and ATS parsers can find it.",
    appliesTo: (resume) => !resume.personalInfo.linkedin,
  },
  {
    id: "no-github",
    section: "contactInformation",
    priority: "Low",
    impact: 2,
    quickFix: true,
    message: "No GitHub profile listed — add it if you have public code recruiters can review.",
    appliesTo: (resume) => !resume.personalInfo.github,
  },
  {
    id: "no-portfolio",
    section: "contactInformation",
    priority: "Low",
    impact: 2,
    quickFix: true,
    message: "No portfolio or personal website listed.",
    appliesTo: (resume) => !resume.personalInfo.portfolio,
  },
  {
    id: "missing-location",
    section: "contactInformation",
    priority: "Low",
    impact: 2,
    quickFix: true,
    message: "Missing location — add your city/region.",
    appliesTo: (resume) => !resume.personalInfo.location,
  },
  {
    id: "email-invalid",
    section: "contactInformation",
    priority: "Medium",
    impact: 5,
    quickFix: true,
    message: "Email format looks invalid.",
    appliesTo: (resume) =>
      Boolean(resume.personalInfo.email) && !EMAIL_REGEX.test(resume.personalInfo.email as string),
  },
  {
    id: "phone-format-invalid",
    section: "contactInformation",
    priority: "Medium",
    impact: 5,
    quickFix: true,
    message: "Phone number format looks invalid.",
    appliesTo: (resume) =>
      Boolean(resume.personalInfo.phone) && !PHONE_REGEX.test(resume.personalInfo.phone as string),
  },
  {
    id: "summary-too-short",
    section: "professionalSummary",
    priority: "High",
    impact: 5,
    quickFix: false,
    message:
      "Professional summary is missing or too short — aim for 2-4 sentences highlighting your experience and impact.",
    appliesTo: (resume) =>
      !resume.professionalSummary.careerObjective ||
      resume.professionalSummary.careerObjective.trim().length < 60,
  },
  {
    id: "no-quantified-achievements",
    section: "experience",
    priority: "High",
    impact: 8,
    quickFix: false,
    message: "No quantified achievements found in work experience — add measurable results (%, $, time saved).",
    appliesTo: (resume) => resume.companyHistory.length > 0 && !hasAchievementSignal(collectExperienceText(resume)),
  },
  {
    id: "weak-experience-descriptions",
    section: "experience",
    priority: "High",
    impact: 8,
    quickFix: false,
    message: "Experience descriptions are weak — bullets read like task lists rather than accomplishments.",
    appliesTo: (resume) => countWeakPhraseHits(collectExperienceText(resume)) >= 2,
  },
  {
    id: "no-action-verbs",
    section: "experience",
    priority: "Medium",
    impact: 5,
    quickFix: false,
    message: "Experience bullets don't start with strong action verbs.",
    appliesTo: (resume) => {
      const bullets = collectExperienceText(resume);
      return bullets.length > 0 && !bullets.some(startsWithStrongVerb);
    },
  },
  {
    id: "bullet-points-too-long",
    section: "experience",
    priority: "Low",
    impact: 2,
    quickFix: false,
    message: "Some bullet points are too long — break large paragraphs into concise, scannable bullets.",
    appliesTo: (resume) =>
      collectExperienceText(resume).some((text) => text.length > FORMATTING_THRESHOLDS.largeParagraphCharLimit),
  },
  {
    id: "education-incomplete",
    section: "education",
    priority: "Low",
    impact: 2,
    quickFix: false,
    message: "One or more education entries are missing key details (degree, institute, or dates).",
    appliesTo: (resume) =>
      resume.education.length > 0 &&
      resume.education.some((entry) => !entry.degree || !entry.institute || (!entry.startYear && !entry.endYear)),
  },
  {
    id: "projects-lack-measurable-impact",
    section: "projects",
    priority: "Medium",
    impact: 5,
    quickFix: false,
    message: "Projects lack measurable impact — quantify outcomes where possible (performance gains, users served, etc.).",
    appliesTo: (resume) => resume.projects.length > 0 && !hasAchievementSignal(collectProjectText(resume)),
  },
  {
    id: "too-few-technical-skills",
    section: "skills",
    priority: "High",
    impact: 8,
    quickFix: false,
    message: "Too few technical skills listed — ATS systems weight keyword breadth heavily.",
    appliesTo: (resume) => totalSkillCount(resume) < 8,
  },
  {
    id: "missing-cloud-technologies",
    section: "skills",
    priority: "Medium",
    impact: 5,
    quickFix: false,
    message: "No cloud technologies detected (AWS, Azure, GCP, etc.) — most modern roles expect at least one.",
    appliesTo: (resume) => !skillsContainCategory(resume, "Cloud"),
  },
  {
    id: "no-ai-skills",
    section: "skills",
    priority: "Low",
    impact: 2,
    quickFix: false,
    message: "No AI/ML skills detected — consider adding if relevant to your target roles.",
    appliesTo: (resume) => !skillsContainCategory(resume, "AI"),
  },
  {
    id: "missing-certifications",
    section: "certifications",
    priority: "Medium",
    impact: 5,
    quickFix: true,
    message: "No certifications listed — relevant certifications can strengthen ATS keyword matches.",
    appliesTo: (resume) => resume.certifications.length === 0,
  },
];
