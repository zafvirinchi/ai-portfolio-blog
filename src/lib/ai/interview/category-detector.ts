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
] as const;

// Explicit topic -> category overrides, per spec ("If topic is Spring
// Security, category should become Spring Boot"; "If topic is HashMap,
// category should become Java"). Keys are normalized (lowercase, trimmed)
// topic names. Checked before the keyword fallback below.
const TOPIC_OVERRIDES: Record<string, (typeof KNOWN_CATEGORIES)[number]> = {
  "spring security": "Spring Boot",
  "spring ioc": "Spring Boot",
  rest: "Spring Boot",
  microservices: "Spring Boot",
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
};

// Keyword fallback for topics not covered by an explicit override or the
// vocabulary topic-detector.ts already recognizes verbatim as a category
// name (e.g. a section literally titled "Docker").
const CATEGORY_KEYWORDS: Record<(typeof KNOWN_CATEGORIES)[number], string[]> = {
  Java: ["java", "jvm", "collection", "generic", "exception", "stream", "thread", "hashmap"],
  "Spring Boot": ["spring", "microservice", "rest api", "controller", "bean", "ioc", "dependency injection"],
  Hibernate: ["hibernate", "orm", "session factory"],
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
  AI: ["artificial intelligence", " ai ", "llm", "openai"],
  "Machine Learning": ["machine learning", "ml model", "neural network", "training data"],
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
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
    const score = keywords.reduce((count, keyword) => (haystack.includes(keyword) ? count + 1 : count), 0);

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
