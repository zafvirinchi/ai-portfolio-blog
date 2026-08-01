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
  // Angular — broader real-world section-heading vocabulary
  { canonical: "Components", match: /^components?$/i },
  { canonical: "Modules", match: /^(modules?|ngmodules?)$/i },
  { canonical: "Services", match: /^services?$/i },
  { canonical: "Templates", match: /^templates?$/i },
  { canonical: "Data Binding", match: /^data binding$/i },
  { canonical: "Event Binding", match: /^event binding$/i },
  { canonical: "Two-Way Binding", match: /^two[- ]way binding$/i },
  { canonical: "Interpolation", match: /^interpolation$/i },
  { canonical: "Component Communication", match: /^component communication$/i },
  { canonical: "Input/Output", match: /^(input\s*\/\s*output|@?input\s*(and|&)\s*@?output)$/i },
  { canonical: "ViewChild", match: /^view ?child$/i },
  { canonical: "ContentChild", match: /^content ?child$/i },
  { canonical: "Content Projection", match: /^content projection$/i },
  { canonical: "Angular CLI", match: /^angular cli$/i },
  { canonical: "HttpClient", match: /^http ?client$/i },
  { canonical: "Interceptors", match: /^interceptors?$/i },
  { canonical: "Guards", match: /^(guards?|route guards?)$/i },
  { canonical: "Resolvers", match: /^resolvers?$/i },
  { canonical: "Lazy Loading", match: /^lazy loading$/i },
  { canonical: "Zone.js", match: /^(zone\.?js|ngzone)$/i },
  { canonical: "Angular Universal", match: /^angular universal$/i },
  { canonical: "Angular Material", match: /^angular material$/i },
  { canonical: "Testing", match: /^(testing|unit testing|jasmine|karma)$/i },
  { canonical: "State Management", match: /^(state management|ngrx)$/i },
  { canonical: "Observables", match: /^observables?$/i },
  { canonical: "Subjects", match: /^(subjects?|behaviorsubjects?)$/i },
  { canonical: "Decorators", match: /^decorators?$/i },
  { canonical: "Custom Directives", match: /^custom directives?$/i },
  { canonical: "Custom Pipes", match: /^custom pipes?$/i },
  { canonical: "Validators", match: /^(validators?|form validation)$/i },
  { canonical: "Angular Security", match: /^angular security$/i },
  { canonical: "Angular Performance", match: /^(angular )?performance( optimization)?$/i },
  { canonical: "Change Detection Strategy", match: /^(change detection strategy|onpush)$/i },
  { canonical: "Ivy", match: /^ivy( renderer)?$/i },
  { canonical: "AOT/JIT", match: /^(aot|jit|ahead[- ]of[- ]time|just[- ]in[- ]time)( compilation)?$/i },
  { canonical: "Angular Animations", match: /^animations?$/i },
  { canonical: "Angular i18n", match: /^(i18n|internationalization)$/i },
  { canonical: "Accessibility", match: /^(accessibility|a11y)$/i },
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

export interface DetectedTopic {
  topic: string;
  lineIndex: number;
  confidence: number;
}

/**
 * Scans layout lines for topic/section headings — known vocabulary only
 * (see KNOWN_TOPICS above). Earlier versions also accepted any short,
 * title-cased/all-caps line as a topic via a generic heading heuristic —
 * that guess is exactly what turned arbitrary PDF section labels ("Real-
 * World Scenario", "Quick Recap", ...) into meaningless categories, so it
 * was removed: a line that isn't a recognized topic simply isn't a
 * boundary, and findTopicForLine() falls back to the nearest preceding
 * known topic (or "General") instead of inventing one. The deny-list is
 * still checked first: a line that's obviously an answer-structure label
 * (Answer, Benefits, Key Improvements, ...) is never treated as a topic.
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
