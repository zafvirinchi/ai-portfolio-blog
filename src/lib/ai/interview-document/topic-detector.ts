import { LayoutLine } from "./layout-parser";

// The exact complaint this file exists to fix: generic answer-structure
// labels getting mistaken for real interview topics. Checked first and
// unconditionally — nothing below can override a deny-list hit, however
// title-cased or short the line looks. Normalized (lowercase, trailing
// punctuation/colon stripped) before comparison.
const NON_TOPIC_LABELS = new Set([
  "answer",
  "answers",
  "explanation",
  "explanations",
  "example",
  "examples",
  "advantages",
  "disadvantages",
  "benefit",
  "benefits",
  "note",
  "notes",
  "best practice",
  "best practices",
  "common mistake",
  "common mistakes",
  "summary",
  "key takeaway",
  "key takeaways",
  "key point",
  "key points",
  "key benefit",
  "key benefits",
  "key improvement",
  "key improvements",
  "key driver",
  "key drivers",
  "key tool",
  "key tools",
  "tip",
  "tips",
  "conclusion",
  "overview",
  "introduction",
  "pros",
  "cons",
  "pros and cons",
  "use case",
  "use cases",
  "important",
  "important points",
  "recap",
  "highlight",
  "highlights",
  "limitation",
  "limitations",
  "feature",
  "features",
  "description",
  "details",
  "background",
  "solution",
  "approach",
  "implementation",
  "result",
  "results",
  "output",
  "code",
  "code example",
  "syntax",
  "steps",
  "step",
]);

// Real, known interview topics — a section literally titled one of these
// is an unambiguous, high-confidence topic heading. Deliberately more
// exhaustive on the Angular side per the spec's explicit examples, plus
// the equivalent depth for the other stacks this codebase already covers.
const KNOWN_TOPICS: { canonical: string; match: RegExp }[] = [
  // Angular
  { canonical: "Signals", match: /^signals?$/i },
  { canonical: "Standalone Components", match: /^standalone components?$/i },
  { canonical: "Dependency Injection", match: /^dependency injection$/i },
  { canonical: "Routing", match: /^(routing|router)$/i },
  { canonical: "RxJS", match: /^rxjs$/i },
  { canonical: "Forms", match: /^(forms?|reactive forms?|template[- ]driven forms?)$/i },
  { canonical: "Change Detection", match: /^change detection$/i },
  { canonical: "Lifecycle", match: /^(lifecycle|lifecycle hooks?)$/i },
  { canonical: "Directives", match: /^directives?$/i },
  { canonical: "Pipes", match: /^pipes?$/i },
  { canonical: "Angular Signals", match: /^angular signals?$/i },
  { canonical: "Angular", match: /^angular$/i },
  // Java / Spring
  { canonical: "Collections", match: /^collections?$/i },
  { canonical: "Exception Handling", match: /^exceptions?( handling)?$/i },
  { canonical: "Streams", match: /^streams?( api)?$/i },
  { canonical: "Multithreading", match: /^(multi[- ]?threading|concurrency)$/i },
  { canonical: "Spring Security", match: /^spring security$/i },
  { canonical: "Spring IOC", match: /^spring (ioc|inversion of control)( container)?$/i },
  { canonical: "REST", match: /^rest(ful)?( api)?s?$/i },
  { canonical: "Microservices", match: /^micro[- ]?services?$/i },
  { canonical: "HashMap", match: /^hashmap$/i },
  { canonical: "Java", match: /^java( core)?$/i },
  { canonical: "Spring Boot", match: /^spring( boot)?$/i },
  { canonical: "Hibernate", match: /^hibernate$/i },
  { canonical: "JPA", match: /^jpa$/i },
  // Other stacks
  { canonical: "React", match: /^react(\.js)?$/i },
  { canonical: "React Hooks", match: /^react hooks?$/i },
  { canonical: "Node.js", match: /^node(\.js)?$/i },
  { canonical: "Kafka", match: /^(apache )?kafka$/i },
  { canonical: "Consumer Groups", match: /^consumer groups?$/i },
  { canonical: "Docker", match: /^docker$/i },
  { canonical: "Docker Networking", match: /^docker networking$/i },
  { canonical: "Kubernetes", match: /^(kubernetes|k8s)$/i },
  { canonical: "AWS", match: /^(aws|amazon web services)$/i },
  { canonical: "AWS Lambda", match: /^aws lambda$/i },
  { canonical: "Azure", match: /^azure$/i },
  { canonical: "MongoDB", match: /^mongo(db)?$/i },
  { canonical: "Mongo Aggregation", match: /^mongo(db)? aggregation$/i },
  { canonical: "SQL", match: /^(sql|databases?)$/i },
  { canonical: "System Design", match: /^system design$/i },
  { canonical: "DevOps", match: /^dev[- ]?ops$/i },
  { canonical: "Cloud", match: /^cloud( computing)?$/i },
  { canonical: "AI", match: /^(ai|artificial intelligence)$/i },
  { canonical: "Machine Learning", match: /^(machine learning|ml)$/i },
];

const IGNORE_PATTERNS: RegExp[] = [
  /^table of contents$/i,
  /^preface$/i,
  /^acknowledge?ments?$/i,
  /^copyright/i,
  /^index$/i,
  /^page\s+\d+(\s+of\s+\d+)?$/i,
  /^\d+$/,
];

const KNOWN_TOPIC_CONFIDENCE = 0.98;
const HEURISTIC_TOPIC_CONFIDENCE = 0.85;
const MAX_HEURISTIC_HEADING_LENGTH = 40;
const MAX_HEURISTIC_HEADING_WORDS = 5;

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[.:]+$/, "");
}

function matchKnownTopic(text: string): string | undefined {
  const normalized = normalizeLabel(text);
  return KNOWN_TOPICS.find((entry) => entry.match.test(normalized))?.canonical;
}

/**
 * Strict check for whether a line is a *real, known* topic heading — the
 * only kind of heading treated as a hard boundary that can end an answer
 * mid-flow (answer-detector.ts) or split the document into sections
 * (detectTopics below). Deliberately does NOT include the generic
 * "short/title-cased line" heuristic — that guess is exactly what
 * previously turned "Answer", "Key Points", "3. Use DevTools" into fake
 * topics that shredded real answers apart.
 */
export function isKnownTopicHeading(
  line: Pick<LayoutLine, "content" | "hasQuestionMarker" | "isListItem">
): boolean {
  if (line.hasQuestionMarker || line.isListItem) return false;
  if (line.content.endsWith("?")) return false;

  return matchKnownTopic(line.content) !== undefined;
}

function isIgnorable(text: string): boolean {
  const normalized = normalizeLabel(text);
  return IGNORE_PATTERNS.some((pattern) => pattern.test(normalized));
}

// A heading candidate for the (much more conservative) heuristic path:
// short, no trailing "?", no explicit marker, not a deny-listed label, and
// title-cased or fully capitalized.
function looksLikeGenuineHeading(text: string): boolean {
  const trimmed = text.trim();

  if (!trimmed || trimmed.length > MAX_HEURISTIC_HEADING_LENGTH || trimmed.endsWith("?")) {
    return false;
  }

  const normalized = normalizeLabel(trimmed);

  if (NON_TOPIC_LABELS.has(normalized) || isIgnorable(trimmed)) {
    return false;
  }

  const words = trimmed.replace(/[.:]+$/, "").split(/\s+/);

  if (words.length > MAX_HEURISTIC_HEADING_WORDS) {
    return false;
  }

  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const isTitleCase = words.every((word) => /^[A-Z0-9][\w.'-]*$/.test(word));

  return isAllCaps || isTitleCase;
}

export interface DetectedTopic {
  topic: string;
  lineIndex: number;
  confidence: number;
}

/**
 * Scans layout lines for topic/section headings — known vocabulary first
 * (high confidence, and the only kind treated as a hard boundary
 * elsewhere), falling back to a narrow heuristic for documents whose
 * topics fall outside that list. The deny-list is checked before either
 * path: a line that's obviously an answer-structure label (Answer,
 * Benefits, Key Improvements, ...) is never returned as a topic, no matter
 * how heading-like it looks.
 */
export function detectTopics(lines: LayoutLine[]): DetectedTopic[] {
  const topics: DetectedTopic[] = [];

  for (const line of lines) {
    if (line.hasQuestionMarker || line.isListItem || line.content.endsWith("?") || isIgnorable(line.content)) {
      continue;
    }

    const normalized = normalizeLabel(line.content);

    if (NON_TOPIC_LABELS.has(normalized)) {
      continue;
    }

    const known = matchKnownTopic(line.content);

    if (known) {
      topics.push({ topic: known, lineIndex: line.lineIndex, confidence: KNOWN_TOPIC_CONFIDENCE });
      continue;
    }

    if (looksLikeGenuineHeading(line.content)) {
      topics.push({
        topic: line.content.trim().replace(/[.:]+$/, ""),
        lineIndex: line.lineIndex,
        confidence: HEURISTIC_TOPIC_CONFIDENCE,
      });
    }
  }

  return topics;
}

/** Nearest preceding topic for a given line index, or undefined if none precedes it. */
export function findTopicForLine(topics: DetectedTopic[], lineIndex: number): DetectedTopic | undefined {
  let current: DetectedTopic | undefined;

  for (const topic of topics) {
    if (topic.lineIndex > lineIndex) break;
    current = topic;
  }

  return current;
}
