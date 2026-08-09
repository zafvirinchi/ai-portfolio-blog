import { Resume } from "../resume/resume-schema";
import { CANDIDATE_TAGS, CandidateTag } from "./candidate-schema";

// Deterministic, no LLM call. Maps real resume signal onto the fixed
// 12-tag palette. "Visa" and "Immediate Joiner" are never auto-
// suggested — no resume field supports either, so they're always
// recruiter-manual-only (a stated no-fabrication boundary, see plan).
// Used to pre-populate tags at import time; always recruiter-editable
// after via updateTags().

function corpusOf(resume: Resume): string {
  return [
    resume.skills.join(" "),
    resume.technicalSkills.join(" "),
    resume.achievements.join(" "),
    resume.workExperience.flatMap((job) => job.description).join(" "),
    resume.contact.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function hasWholeWord(corpus: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(corpus);
}

function hasAny(corpus: string, terms: string[]): boolean {
  return terms.some((term) => hasWholeWord(corpus, term));
}

const LEADERSHIP_VERBS = ["led", "managed", "mentored", "supervised", "directed", "coordinated", "spearheaded", "founded"];

export function suggestTags(resume: Resume): CandidateTag[] {
  const corpus = corpusOf(resume);
  const tags = new Set<CandidateTag>();

  // \bjava\b already can't match inside "javascript" (word-boundary semantics
  // require a non-word char on both sides) — no extra guard needed, and an
  // earlier version's redundant "&& !hasWholeWord(corpus, 'javascript')"
  // check was a real bug: it suppressed the Java tag whenever JavaScript was
  // ALSO listed as a separate, genuinely real skill on the same resume.
  if (hasWholeWord(corpus, "java")) tags.add("Java");
  if (hasAny(corpus, ["spring", "spring boot", "spring security"])) tags.add("Spring");
  if (hasWholeWord(corpus, "angular")) tags.add("Angular");

  if (hasAny(corpus, ["ai", "machine learning", "tensorflow", "pytorch", "llm", "nlp", "deep learning"])) tags.add("AI");
  if (hasAny(corpus, ["aws", "azure", "gcp", "google cloud", "cloud"])) tags.add("Cloud");
  if (hasAny(corpus, ["docker", "kubernetes", "jenkins", "terraform", "ansible", "ci/cd", "devops"])) tags.add("DevOps");

  if (hasAny(corpus, ["react", "vue", "angular", "css", "html", "frontend"])) tags.add("Frontend");
  if (hasAny(corpus, ["node", "django", "spring", "backend", "express", "flask", ".net"])) tags.add("Backend");

  if (LEADERSHIP_VERBS.some((verb) => hasWholeWord(corpus, verb))) tags.add("Leadership");
  if (hasWholeWord(corpus, "remote")) tags.add("Remote");

  return CANDIDATE_TAGS.filter((tag) => tags.has(tag));
}
