import { DetectedTopic } from "./interview-types";

// Explicit topic vocabulary from the spec, plus the category names
// themselves (a section literally titled "Java" or "Docker" is a topic
// heading too), each with a normalized matcher. These match at high
// confidence since they're unambiguous.
const KNOWN_TOPICS: { canonical: string; match: RegExp }[] = [
  { canonical: "Collections", match: /^collections?$/i },
  { canonical: "Exception Handling", match: /^exceptions?( handling)?$/i },
  { canonical: "Streams", match: /^streams?( api)?$/i },
  { canonical: "Multithreading", match: /^(multi[- ]?threading|concurrency)$/i },
  { canonical: "Spring Security", match: /^spring security$/i },
  { canonical: "Spring IOC", match: /^spring (ioc|inversion of control)( container)?$/i },
  { canonical: "REST", match: /^rest(ful)?( api)?s?$/i },
  { canonical: "Microservices", match: /^micro[- ]?services?$/i },
  { canonical: "Kafka", match: /^(apache )?kafka$/i },
  { canonical: "Docker", match: /^docker$/i },
  { canonical: "Angular Signals", match: /^angular signals?$/i },
  { canonical: "RxJS", match: /^rxjs$/i },
  { canonical: "HashMap", match: /^hashmap$/i },
  { canonical: "Java", match: /^java( core)?$/i },
  { canonical: "Spring Boot", match: /^spring( boot)?$/i },
  { canonical: "Hibernate", match: /^hibernate$/i },
  { canonical: "JPA", match: /^jpa$/i },
  { canonical: "Angular", match: /^angular$/i },
  { canonical: "React", match: /^react(\.js)?$/i },
  { canonical: "Node.js", match: /^node(\.js)?$/i },
  { canonical: "Kubernetes", match: /^(kubernetes|k8s)$/i },
  { canonical: "AWS", match: /^(aws|amazon web services)$/i },
  { canonical: "Azure", match: /^azure$/i },
  { canonical: "MongoDB", match: /^mongo(db)?$/i },
  { canonical: "SQL", match: /^(sql|databases?)$/i },
  { canonical: "System Design", match: /^system design$/i },
  { canonical: "DevOps", match: /^dev[- ]?ops$/i },
  { canonical: "Cloud", match: /^cloud( computing)?$/i },
  { canonical: "AI", match: /^(ai|artificial intelligence)$/i },
  { canonical: "Machine Learning", match: /^(machine learning|ml)$/i },
  { canonical: "Docker Networking", match: /^docker networking$/i },
  { canonical: "React Hooks", match: /^react hooks?$/i },
  { canonical: "Mongo Aggregation", match: /^mongo(db)? aggregation$/i },
  { canonical: "Consumer Groups", match: /^consumer groups?$/i },
  { canonical: "AWS Lambda", match: /^aws lambda$/i },
];

// Clear Heading / Heading inferred, per the Part 2 confidence calibration.
const KNOWN_TOPIC_CONFIDENCE = 0.98;
const HEURISTIC_TOPIC_CONFIDENCE = 0.85;

// Front-matter noise that should never become a topic or a question — the
// spec's explicit ignore list, plus page numbers.
const IGNORE_PATTERNS: RegExp[] = [
  /^table of contents$/i,
  /^preface$/i,
  /^acknowledge?ments?$/i,
  /^copyright/i,
  /^index$/i,
  /^page\s+\d+(\s+of\s+\d+)?$/i,
  /^\d+$/, // a bare page number
];

export function isIgnorableLine(rawLine: string): boolean {
  const line = rawLine.trim().replace(/[.:]+$/, "");
  if (!line) return false;

  return IGNORE_PATTERNS.some((pattern) => pattern.test(line));
}

// A heading candidate: short, no trailing "?", not a numbered/bulleted
// question prefix, and title-cased or fully capitalized — ordinary prose
// sentences don't look like this.
function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length > 50 || trimmed.endsWith("?")) {
    return false;
  }

  if (/^\s*(question\s*:|q\s*:|q\d+\s*[:.)]?)/i.test(trimmed)) {
    return false;
  }

  const words = trimmed.replace(/[.:]+$/, "").split(/\s+/);
  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const isTitleCase = words.every((word) => /^[A-Z0-9][\w.'-]*$/.test(word));

  return isAllCaps || isTitleCase;
}

function matchKnownTopic(line: string): string | undefined {
  const normalized = line.trim().replace(/[.:]+$/, "");

  return KNOWN_TOPICS.find((entry) => entry.match.test(normalized))?.canonical;
}

/**
 * Scans every line for topic/section headings — the explicit vocabulary
 * first (high confidence), falling back to a generic heading heuristic
 * (short, title-cased/all-caps line) for documents with topics outside
 * that list. Ignore-list lines (Table of Contents, page numbers, etc.)
 * are recognized but never returned as topics.
 */
export function detectTopics(lines: string[]): DetectedTopic[] {
  const topics: DetectedTopic[] = [];

  lines.forEach((line, lineIndex) => {
    if (isIgnorableLine(line)) {
      return;
    }

    const known = matchKnownTopic(line);

    if (known) {
      topics.push({ topic: known, lineIndex, confidence: KNOWN_TOPIC_CONFIDENCE });
      return;
    }

    if (looksLikeHeading(line)) {
      topics.push({
        topic: line.trim().replace(/[.:]+$/, ""),
        lineIndex,
        confidence: HEURISTIC_TOPIC_CONFIDENCE,
      });
    }
  });

  return topics;
}
