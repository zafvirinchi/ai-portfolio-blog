import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { RewriteRecord } from "../resume-rewriter/rewrite-types";

// Ported from cover-letter/validator.ts — the same checks, proven and
// twice-fixed by real testing in Milestone 6 (including the negative-
// lookbehind possession-claim backstop), adapted here to ground against
// the resume, the optional accepted Resume-Rewrite-Engine output, and
// the optional JD match — whichever are actually present.

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

export const SAFETY_RULES_PROMPT = `CRITICAL SAFETY RULES — never violate these:
- Never invent a company, employer, or organization the candidate didn't
  actually work at. Never invent experience, projects, certifications,
  awards, achievements, education, or dates beyond what the resume
  already states.
- Never invent a technology, tool, framework, or language the candidate
  didn't already use — this includes swapping a DIFFERENT-BUT-SIMILAR
  named technology for one they actually have.
- CRITICAL: if a job description or target role is mentioned, it may
  list skills the candidate does NOT actually have — you may discuss
  what the role/industry values in general terms, but you must NEVER
  claim a JD-only or role-only technology AS THE CANDIDATE'S OWN SKILL
  unless the resume (or accepted rewrite) itself states it. A broader
  parent technology on the resume does NOT justify claiming a more
  specific one from elsewhere.
  WRONG (fabricated — never do this): resume lists "Spring" only, target
  role calls for "Spring Boot, Spring Security" → writing "My expertise
  includes Spring Boot, Spring Security..." as if already possessed.
  RIGHT: only list "Spring" (what the resume actually states); frame any
  more specific aspiration honestly, e.g. "growing my Spring Security
  skills" — never as an existing skill.
- Never invent a certification, or name a different certification than
  the one actually held — the resume's exact certification names are the
  only ones you may ever reference.
- Never invent a metric, number, or percentage that isn't already stated
  in the resume or rewrite output.
- Never invent volunteer work, publications, patents, or licenses — only
  ever reference ones explicitly supplied to you; if none were supplied,
  omit the section rather than inventing content.
- You may express genuine enthusiasm and professional framing, but every
  factual claim about the candidate must trace back to the resume (or
  accepted rewrite output) — never to a job description or target role
  alone.`;

// Deliberately a short, non-exhaustive list — catches the highest-value
// fabrication pattern (a named technology swap), same list every
// validator in this arc has used since Milestone 5.
const KNOWN_TECHNOLOGIES = [
  "Java",
  "Spring Boot",
  "Spring",
  "Angular",
  "React",
  "Node.js",
  "Node",
  "AWS",
  "Azure",
  "GCP",
  "Google Cloud",
  "Docker",
  "Kubernetes",
  "Kafka",
  "RabbitMQ",
  "MySQL",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "GraphQL",
  "TypeScript",
  "JavaScript",
  "Python",
  "C#",
  ".NET",
  "Terraform",
  "Jenkins",
  "GitHub Actions",
  "CI/CD",
  "Microservices",
  "REST",
  "gRPC",
  "LangChain",
  "LangGraph",
  "OpenAI",
  "TensorFlow",
  "PyTorch",
];

const WELL_KNOWN_COMPANIES = ["Google", "Amazon", "Meta", "Facebook", "Apple", "Netflix", "Microsoft"];

function buildResumeCorpus(resume: Resume, rewriteRecord?: RewriteRecord): string {
  const parts: string[] = [
    resume.summary ?? "",
    ...resume.skills,
    ...resume.technicalSkills,
    ...resume.softSkills,
    ...resume.workExperience.flatMap((job) => [job.title, job.company, ...job.description]),
    ...resume.education.map((edu) => `${edu.degree} ${edu.institution}`),
    ...resume.certifications.map((cert) => `${cert.name} ${cert.issuer ?? ""}`),
    ...resume.projects.flatMap((project) => [project.name, project.description ?? "", ...project.technologies]),
    ...resume.achievements,
  ];

  if (rewriteRecord) {
    for (const section of Object.values(rewriteRecord.sections)) {
      if (section) parts.push(...section.current);
    }
  }

  return parts.join(" \n ").toLowerCase();
}

function buildJdCorpus(jd: JobDescription): string {
  const parts: string[] = [
    jd.jobTitle ?? "",
    jd.companyName ?? "",
    jd.domain ?? "",
    ...jd.responsibilities,
    ...jd.skills,
    ...jd.mandatorySkills,
    ...jd.goodToHaveSkills,
    ...jd.softSkills,
    ...jd.certifications,
    ...jd.cloud,
    ...jd.frameworks,
    ...jd.programmingLanguages,
    ...jd.tools,
    ...jd.databases,
    ...jd.aiSkills,
    ...jd.security,
    ...jd.educationRequired,
  ];

  return parts.join(" \n ").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  const pattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(term.toLowerCase())}([^a-z0-9+#.]|$)`, "i");
  return pattern.test(haystack);
}

function extractNumbers(text: string): string[] {
  return Array.from(text.matchAll(/\b\d+(?:\.\d+)?\s?(?:%|x|k|m|\+)?\b/gi)).map((match) => match[0].trim().toLowerCase());
}

function extractYears(text: string): string[] {
  return Array.from(text.matchAll(/\b(19|20)\d{2}\b/g)).map((match) => match[0]);
}

export function validateLinkedinContent(
  resume: Resume,
  generatedText: string,
  rewriteRecord?: RewriteRecord,
  jd?: JobDescription
): ValidationResult {
  const violations: string[] = [];
  const resumeCorpus = buildResumeCorpus(resume, rewriteRecord);
  const jdCorpus = jd ? buildJdCorpus(jd) : "";
  const realCompanies = resume.workExperience.map((job) => job.company.toLowerCase());
  const realCertifications = resume.certifications.map((cert) => cert.name.toLowerCase());

  for (const company of WELL_KNOWN_COMPANIES) {
    if (containsWholeTerm(generatedText, company) && !realCompanies.some((real) => real.includes(company.toLowerCase()))) {
      violations.push(`Mentions "${company}", which isn't one of the candidate's real employers.`);
    }
  }

  const certMentions = generatedText.match(/[A-Z][A-Za-z0-9 .-]*\bCertifi(?:ed|cation)\b[A-Za-z0-9 .-]*/g) ?? [];
  for (const mention of certMentions) {
    const normalized = mention.trim().toLowerCase();
    const matchesReal = realCertifications.some((real) => real.includes(normalized) || normalized.includes(real));
    if (!matchesReal) {
      violations.push(`Mentions a certification ("${mention.trim()}") that doesn't match any of the candidate's real certifications.`);
    }
  }

  for (const tech of KNOWN_TECHNOLOGIES) {
    if (containsWholeTerm(generatedText, tech) && !containsWholeTerm(resumeCorpus, tech) && !containsWholeTerm(jdCorpus, tech)) {
      violations.push(`Mentions "${tech}", which doesn't appear in the candidate's resume or the target role context.`);
    }
  }

  // Possession-claim backstop — the exact fix Milestone 6's real testing
  // required twice to get right: "my skills/expertise" naming a
  // JD-only-grounded technology is a fabrication UNLESS that phrase is
  // itself governed by an aspirational verb ("expand my skills in X"),
  // in which case it's honest growth framing, not a possession claim.
  const aspirationalVerbs = "deepen|expand|grow|develop|build|strengthen|broaden|learn|improve|advance";
  const claimMarkerPattern = new RegExp(
    `\\b(?<!(?:${aspirationalVerbs})\\s)my (?:technical )?(?:expertise|skills?|experience|background)\\b|\\bi (?:have|bring|possess|am proficient|am skilled|am experienced)\\b`,
    "i"
  );

  for (const tech of KNOWN_TECHNOLOGIES) {
    if (containsWholeTerm(resumeCorpus, tech)) continue; // grounded in the resume/rewrite output — not a fabrication regardless of phrasing

    const techPattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(tech.toLowerCase())}([^a-z0-9+#.]|$)`, "gi");
    let techMatch: RegExpExecArray | null;

    while ((techMatch = techPattern.exec(generatedText)) !== null) {
      const techIndex = techMatch.index;
      const window = generatedText.slice(Math.max(0, techIndex - 80), techIndex);

      if (claimMarkerPattern.test(window)) {
        const context = generatedText.slice(Math.max(0, techIndex - 40), techIndex + tech.length + 20).trim();
        violations.push(
          `Claims "${tech}" as the candidate's own skill ("...${context}..."), but it only appears in the target role context, not the resume.`
        );
      }
    }
  }

  const groundedNumbers = new Set([...extractNumbers(resumeCorpus), ...extractNumbers(jdCorpus)]);
  for (const number of extractNumbers(generatedText)) {
    if (!groundedNumbers.has(number)) {
      violations.push(`Introduces a number ("${number}") that isn't grounded in the candidate's resume or rewrite output.`);
    }
  }

  for (const year of extractYears(generatedText)) {
    if (!resumeCorpus.includes(year) && !jdCorpus.includes(year)) {
      violations.push(`Introduces a date ("${year}") that doesn't appear in the resume or target role context.`);
    }
  }

  return { valid: violations.length === 0, violations };
}
