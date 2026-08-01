import { DEFAULT_CATEGORY } from "./interview-types";

export const KNOWN_CATEGORIES = [
  "Java",
  "Spring Boot",
  "Hibernate",
  "JPA",
  "Angular",
  "React",
  "Node.js",
  "Docker",
  "Kubernetes",
  "Kafka",
  "AWS",
  "Azure",
  "MongoDB",
  "SQL",
  "System Design",
  "DevOps",
  "Cloud",
  "AI",
  "Machine Learning",
  "Microservices",
  "Behavioral",
  "Coding",
] as const;

// Explicit topic -> category overrides, per spec ("If topic is Spring
// Security, category should become Spring Boot"; "If topic is HashMap,
// category should become Java"). Keys are normalized (lowercase, trimmed)
// topic names. Checked before the keyword fallback below.
const TOPIC_OVERRIDES: Record<string, (typeof KNOWN_CATEGORIES)[number]> = {
  "spring security": "Spring Boot",
  "spring ioc": "Spring Boot",
  rest: "Spring Boot",
  hashmap: "Java",
  collections: "Java",
  "exception handling": "Java",
  streams: "Java",
  multithreading: "Java",
  "angular signals": "Angular",
  rxjs: "Angular",
  // JPA is its own category name (for a section literally titled "JPA"
  // with no more specific topic), but as a *topic* it maps to Hibernate —
  // JPA is the spec, Hibernate is the implementation interview questions
  // about it are really testing.
  jpa: "Hibernate",
  "docker networking": "Docker",
  "react hooks": "React",
  "mongo aggregation": "MongoDB",
  "consumer groups": "Kafka",
  "aws lambda": "AWS",
  // The broader Angular topic vocabulary added alongside KNOWN_TOPICS
  // (topic-detector.ts) — several of these names are generic enough
  // ("Components", "Testing", "Observables", ...) that the keyword-scoring
  // fallback below can tie with unrelated categories (e.g. "generic"/
  // "exception"/"stream" are also Java keywords) and lose the tie to
  // whichever category happens to come first in KNOWN_CATEGORIES. An
  // explicit override makes the (overwhelmingly common) case deterministic
  // instead of leaving it to keyword luck.
  components: "Angular",
  modules: "Angular",
  services: "Angular",
  templates: "Angular",
  "data binding": "Angular",
  "event binding": "Angular",
  "two-way binding": "Angular",
  interpolation: "Angular",
  "component communication": "Angular",
  "input/output": "Angular",
  viewchild: "Angular",
  contentchild: "Angular",
  "content projection": "Angular",
  "angular cli": "Angular",
  httpclient: "Angular",
  interceptors: "Angular",
  guards: "Angular",
  resolvers: "Angular",
  "lazy loading": "Angular",
  "zone.js": "Angular",
  "angular universal": "Angular",
  "angular material": "Angular",
  testing: "Angular",
  "state management": "Angular",
  observables: "Angular",
  subjects: "Angular",
  decorators: "Angular",
  "custom directives": "Angular",
  "custom pipes": "Angular",
  validators: "Angular",
  "angular security": "Angular",
  "angular performance": "Angular",
  "change detection strategy": "Angular",
  ivy: "Angular",
  "aot/jit": "Angular",
  "angular animations": "Angular",
  "angular i18n": "Angular",
  accessibility: "Angular",
};

// Keyword fallback for topics not covered by an explicit override or the
// vocabulary topic-detector.ts already recognizes verbatim as a category
// name (e.g. a section literally titled "Docker").
const CATEGORY_KEYWORDS: Record<(typeof KNOWN_CATEGORIES)[number], string[]> = {
  Java: ["java", "jvm", "collection", "generic", "exception", "stream", "thread", "hashmap"],
  "Spring Boot": ["spring", "microservice", "rest api", "controller", "bean", "ioc", "dependency injection"],
  Hibernate: ["hibernate", "session factory", "object-relational mapping"],
  JPA: ["jpa", "entitymanager", "persistence"],
  Angular: ["angular", "rxjs", "typescript", "directive", "signal"],
  React: ["react", "jsx", "hook", "redux"],
  "Node.js": ["node.js", "nodejs", "express", "npm"],
  Docker: ["docker", "container", "dockerfile"],
  Kubernetes: ["kubernetes", "k8s", "pod", "helm"],
  Kafka: ["kafka", "topic", "broker", "consumer group"],
  AWS: ["aws", "ec2", "s3", "lambda", "amazon web services"],
  Azure: ["azure"],
  MongoDB: ["mongodb", "mongo", "nosql document"],
  SQL: ["sql", "database", "query", "join", "index"],
  "System Design": ["system design", "scalability", "load balanc", "architecture"],
  DevOps: ["devops", "ci/cd", "pipeline", "jenkins"],
  Cloud: ["cloud", "saas", "paas", "iaas"],
  AI: ["artificial intelligence", "ai", "llm", "openai"],
  "Machine Learning": ["machine learning", "ml model", "neural network", "training data"],
  Microservices: ["microservice", "service discovery", "api gateway", "circuit breaker", "saga pattern", "service mesh"],
  Behavioral: [
    "tell me about a time",
    "describe a situation",
    "strength and weakness",
    "conflict with",
    "teamwork",
    "leadership",
    "challenge you faced",
    "why do you want",
    "greatest achievement",
  ],
  Coding: [
    "write a function",
    "write a program",
    "algorithm",
    "data structure",
    "time complexity",
    "space complexity",
    "leetcode",
    "coding question",
  ],
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// A plain `haystack.includes(keyword)` false-positives badly on short,
// single-word keywords: "java" matches inside "javascript", the (now
// removed) "orm" keyword matched inside "perform"/"platform"/"information".
// Single-word keywords are matched on a word boundary instead; multi-word
// phrases ("session factory", "rest api", ...) keep plain substring
// matching since a phrase is specific enough not to collide.
const keywordPatternCache = new Map<string, RegExp>();

function containsKeyword(haystack: string, keyword: string): boolean {
  const trimmed = keyword.trim();

  if (trimmed.includes(" ")) {
    return haystack.includes(trimmed);
  }

  let pattern = keywordPatternCache.get(trimmed);

  if (!pattern) {
    pattern = new RegExp(`\\b${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    keywordPatternCache.set(trimmed, pattern);
  }

  return pattern.test(haystack);
}

export interface CategoryDetectionResult {
  category: string;
  confidence: number;
}

// Deterministic vs. inferred vs. no-signal — reusing the same confidence
// language as topic/question detection (a deterministic override or exact
// name match is as certain as an explicitly-marked question; a keyword
// match is "inferred"; falling all the way through to DEFAULT_CATEGORY is
// the Ambiguous case).
const CATEGORY_CONFIDENCE = {
  DETERMINISTIC: 0.97,
  KEYWORD_MATCH: 0.85,
  FALLBACK: 0.5,
} as const;

/**
 * Classifies a question into one of the known categories. The topic
 * (already detected by topic-detector.ts) is the primary signal — an
 * explicit override wins outright — falling back to keyword matching
 * against the topic + question + answer text combined, and finally to
 * DEFAULT_CATEGORY when nothing matches (e.g. a behavioral question with
 * no technical topic).
 */
export function detectCategory(topic: string, supportingText: string): CategoryDetectionResult {
  const normalizedTopic = normalize(topic);

  if (TOPIC_OVERRIDES[normalizedTopic]) {
    return { category: TOPIC_OVERRIDES[normalizedTopic], confidence: CATEGORY_CONFIDENCE.DETERMINISTIC };
  }

  const exactCategoryMatch = KNOWN_CATEGORIES.find((category) => normalize(category) === normalizedTopic);

  if (exactCategoryMatch) {
    return { category: exactCategoryMatch, confidence: CATEGORY_CONFIDENCE.DETERMINISTIC };
  }

  const haystack = normalize(`${topic} ${supportingText}`);

  let bestCategory: string | undefined;
  let bestScore = 0;

  for (const category of KNOWN_CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category];
    const score = keywords.reduce((count, keyword) => (containsKeyword(haystack, keyword) ? count + 1 : count), 0);

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (bestCategory) {
    return { category: bestCategory, confidence: CATEGORY_CONFIDENCE.KEYWORD_MATCH };
  }

  return { category: DEFAULT_CATEGORY, confidence: CATEGORY_CONFIDENCE.FALLBACK };
}
