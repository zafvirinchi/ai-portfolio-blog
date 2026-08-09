import { JdMatchResult, JobDescription } from "../job-description/jd-schema";
import { AtsScore, Resume } from "../resume/resume-schema";
import { CheatSheetEntry, ReadinessScore } from "./prep-schema";

// Deterministic — both functions here are pure computations over data
// already produced upstream (resume's own AtsScore, JdMatchResult) or a
// curated static reference table (the cheat sheet). No LLM call: a cheat
// sheet needs to be *correct*, not creative, and a readiness score needs
// to trace to real inputs, same discipline as every other score in this
// codebase.

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeReadinessScore(
  resume: Resume,
  atsScore: AtsScore,
  jdMatch: JdMatchResult,
  kbCoverageRatio: number
): ReadinessScore {
  const totalSkillSignals = jdMatch.matchedSkills.length + jdMatch.missingSkills.length;
  const missingSkillsPenalty =
    totalSkillSignals === 0 ? 100 : clamp(100 - (jdMatch.missingSkills.length / totalSkillSignals) * 100);
  const projectsScore = clamp(Math.min(100, resume.projects.length * 25));
  const knowledgeBaseCoverage = clamp(kbCoverageRatio * 100);

  const overall = clamp(
    atsScore.overall * 0.15 +
      jdMatch.overallMatch * 0.2 +
      missingSkillsPenalty * 0.15 +
      projectsScore * 0.1 +
      jdMatch.experienceScore * 0.15 +
      jdMatch.atsScore * 0.15 +
      knowledgeBaseCoverage * 0.1
  );

  return {
    overall,
    resumeQuality: atsScore.overall,
    jdMatch: jdMatch.overallMatch,
    missingSkillsPenalty,
    projectsScore,
    experienceScore: jdMatch.experienceScore,
    atsScore: jdMatch.atsScore,
    knowledgeBaseCoverage,
  };
}

// Curated, factually-checked reference points — never LLM-generated, so
// there's no risk of a confidently-wrong command/pattern on a one-page
// revision sheet meant to be trusted right before an interview.
const CHEAT_SHEET_LIBRARY: Record<string, string[]> = {
  "Spring Boot": [
    "@RestController, @Service, @Repository, @Autowired for dependency injection",
    "@Transactional for declarative transaction management",
    "application.properties/yml for config; profiles via spring.profiles.active",
    "Spring Boot Actuator exposes /health, /metrics, /info endpoints",
  ],
  Angular: [
    "Components: @Component, @Input/@Output for parent-child data flow",
    "Services + constructor-based DI, providedIn: 'root' for app-wide singletons",
    "RxJS Observables for async data streams; async pipe unsubscribes automatically",
    "Standalone components (Angular 14+) reduce NgModule boilerplate",
  ],
  Java: [
    "Streams API: map/filter/reduce/collect for functional-style collection processing",
    "try-with-resources for AutoCloseable cleanup",
    "Records (Java 16+) for immutable data carriers",
    "ExecutorService for thread-pool-managed concurrency",
  ],
  SQL: [
    "INNER JOIN returns matching rows only; LEFT JOIN keeps all left-table rows",
    "GROUP BY + HAVING for aggregate filtering",
    "Indexes speed reads, slow writes — index columns used in WHERE/JOIN/ORDER BY",
    "Normalize to 3NF by default; denormalize deliberately for read-heavy paths",
  ],
  Kafka: [
    "Topics are partitioned; partition is the ordering-guarantee unit",
    "Consumer groups: each partition is consumed by exactly one group member",
    "At-least-once vs exactly-once delivery — idempotent producers + transactions for the latter",
    "Retention is time/size-based, independent of consumer acknowledgement",
  ],
  Docker: [
    "docker build -t name . / docker run -p host:container name",
    "Multi-stage builds keep the final image small",
    "docker-compose for multi-container local orchestration",
    "Layers are cached — order Dockerfile instructions least-to-most-frequently-changed",
  ],
  Kubernetes: [
    "Pod = smallest deployable unit; Deployment manages ReplicaSets of Pods",
    "Service = stable network identity for a set of Pods (ClusterIP/NodePort/LoadBalancer)",
    "ConfigMap/Secret for externalized configuration",
    "kubectl get/describe/logs/exec for debugging",
  ],
  AWS: [
    "EC2 = compute, S3 = object storage, RDS = managed relational database",
    "IAM roles are preferred over hardcoded credentials for service-to-service auth",
    "Lambda for event-driven serverless compute",
    "CloudWatch for logs/metrics/alarms",
  ],
  AI: [
    "RAG = retrieval-augmented generation: fetch relevant context, then generate grounded on it",
    "Embeddings turn text into vectors for similarity search",
    "Temperature controls generation randomness — 0 for deterministic, higher for creative",
    "Structured outputs (JSON schema) constrain LLM responses to a fixed shape",
  ],
  "Design Patterns": [
    "Singleton: one instance, global access point",
    "Factory: delegate object creation to a method/class",
    "Observer: publish/subscribe state-change notifications",
    "Strategy: swap an algorithm's implementation at runtime via a common interface",
  ],
};

function candidateTechnologyNames(resume: Resume, jd: JobDescription): string[] {
  const raw = [
    ...resume.skills,
    ...resume.technicalSkills,
    ...jd.skills,
    ...jd.programmingLanguages,
    ...jd.frameworks,
    ...jd.cloud,
    ...jd.databases,
  ].map((skill) => skill.toLowerCase());

  return Object.keys(CHEAT_SHEET_LIBRARY).filter((key) => {
    const lowerKey = key.toLowerCase();
    return raw.some((term) => term.includes(lowerKey) || lowerKey.includes(term));
  });
}

export function buildCheatSheet(resume: Resume, jd: JobDescription): CheatSheetEntry[] {
  const matched = candidateTechnologyNames(resume, jd);
  const hasAiSignal = jd.aiSkills.length > 0 || resume.skills.some((skill) => /ai|llm|rag/i.test(skill));

  const keys = Array.from(new Set([...matched, ...(hasAiSignal ? ["AI"] : []), "Design Patterns"]));

  return keys.map((key) => ({ technology: key, points: CHEAT_SHEET_LIBRARY[key] }));
}
