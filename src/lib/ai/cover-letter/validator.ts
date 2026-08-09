import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";

// Deterministic anti-fabrication validator — mirrors
// resume-rewriter/rewrite-validator.ts's proven shape, extended for
// cover-letter-specific risk: a letter legitimately references BOTH the
// resume (candidate facts) and the JD (company/role facts), so grounding
// checks here accept either source, unlike the resume-only rewriter.

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
- CRITICAL: the job description will list required skills the candidate
  may NOT actually have — you may discuss what the job description
  requires (e.g. "the role's emphasis on X..."), but you must NEVER
  claim a JD-required technology AS THE CANDIDATE'S OWN SKILL unless the
  resume itself states it. A broader/parent technology on the resume
  does NOT justify claiming a more specific one from the JD.
  WRONG (fabricated — never do this): resume lists "Spring" only, JD
  asks for "Spring Boot, Spring Security" → writing "My technical
  expertise includes Spring Boot, Spring Security..." as if the
  candidate already has them.
  RIGHT: only list "Spring" (what the resume actually states); if you
  want to reference the JD's more specific requirement, frame it
  honestly as growth interest, e.g. "I'm eager to deepen my Spring
  Security expertise" — never as an existing skill.
- Never invent a certification, or name a different certification than
  the one actually held — the resume's exact certification names are the
  only ones you may ever reference.
- Never invent a metric, number, or percentage about the CANDIDATE that
  isn't already stated in the resume.
- Never invent a fact about the TARGET COMPANY that isn't explicitly
  given to you in the supplied talking points (which come directly from
  the job description) — no funding rounds, no founding year, no awards,
  no recent news, no headcount figures, no specific product names beyond
  what the job description itself states.
- You may express genuine enthusiasm and professional framing, but every
  factual claim about the CANDIDATE must trace back to the resume —
  never to the job description alone.`;

// Deliberately a short, non-exhaustive list — catches the highest-value
// fabrication pattern (a named technology swap), not every conceivable
// invented technology. Same list as resume-rewriter/rewrite-validator.ts.
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

function buildResumeCorpus(resume: Resume): string {
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

/**
 * `generatedText` may be any cover-letter-shaped prose (a letter
 * variant's fullText, an email body, a LinkedIn message) — validated
 * against BOTH the resume (candidate facts) and the JD (company/role
 * facts), since a real cover letter legitimately draws on either.
 */
export function validateCoverContent(resume: Resume, jd: JobDescription, companyName: string, generatedText: string): ValidationResult {
  const violations: string[] = [];
  const resumeCorpus = buildResumeCorpus(resume);
  const jdCorpus = buildJdCorpus(jd);
  const realCompanies = resume.workExperience.map((job) => job.company.toLowerCase());
  const realCertifications = resume.certifications.map((cert) => cert.name.toLowerCase());
  const targetCompanyLower = companyName.trim().toLowerCase();

  for (const company of WELL_KNOWN_COMPANIES) {
    if (
      company.toLowerCase() !== targetCompanyLower &&
      containsWholeTerm(generatedText, company) &&
      !realCompanies.some((real) => real.includes(company.toLowerCase()))
    ) {
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
      violations.push(`Mentions "${tech}", which doesn't appear in the candidate's resume or the job description.`);
    }
  }

  // Narrower, higher-precision backstop for the specific over-claiming
  // pattern real testing found: a sentence explicitly claiming "my
  // skills/expertise" that names a technology ONLY grounded in the JD
  // (not the resume) — e.g. resume says "Spring", JD requires "Spring
  // Boot, Spring Security", and the letter writes "My technical
  // expertise includes ... Spring Boot, Spring Security" as if the
  // candidate already has them. This is stricter than the general check
  // above (which allows JD-only grounding for legitimately discussing
  // the role's requirements) — a first-person possession claim may only
  // ever be grounded in the resume.
  // "my skills/expertise/experience/background" is a possession claim —
  // UNLESS it's itself the object of an aspirational verb ("expand my
  // skills", "deepen my knowledge"), in which case the whole phrase is
  // aspirational, not a claim. Real testing found the earlier version of
  // this check (comparing marker distances) still misfired on "I am
  // motivated to expand my skills in PostgreSQL" — "expand" sits directly
  // in front of "my skills," so a negative lookbehind excludes it
  // precisely, rather than approximating via nearest-marker distance.
  const aspirationalVerbs = "deepen|expand|grow|develop|build|strengthen|broaden|learn|improve|advance";
  const claimMarkerPattern = new RegExp(
    `\\b(?<!(?:${aspirationalVerbs})\\s)my (?:technical )?(?:expertise|skills?|experience|background)\\b|\\bi (?:have|bring|possess|am proficient|am skilled|am experienced)\\b`,
    "i"
  );

  for (const tech of KNOWN_TECHNOLOGIES) {
    if (containsWholeTerm(resumeCorpus, tech)) continue; // grounded in the resume — not a fabrication regardless of phrasing

    const techPattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(tech.toLowerCase())}([^a-z0-9+#.]|$)`, "gi");
    let techMatch: RegExpExecArray | null;

    while ((techMatch = techPattern.exec(generatedText)) !== null) {
      const techIndex = techMatch.index;
      const window = generatedText.slice(Math.max(0, techIndex - 80), techIndex);

      if (claimMarkerPattern.test(window)) {
        const context = generatedText.slice(Math.max(0, techIndex - 40), techIndex + tech.length + 20).trim();
        violations.push(
          `Claims "${tech}" as the candidate's own skill ("...${context}..."), but it only appears in the job description, not the resume.`
        );
      }
    }
  }

  const groundedNumbers = new Set([...extractNumbers(resumeCorpus), ...extractNumbers(jdCorpus)]);
  for (const number of extractNumbers(generatedText)) {
    if (!groundedNumbers.has(number)) {
      violations.push(`Introduces a number ("${number}") that isn't grounded in the candidate's resume or the job description.`);
    }
  }

  for (const year of extractYears(generatedText)) {
    if (!resumeCorpus.includes(year) && !jdCorpus.includes(year)) {
      violations.push(`Introduces a date ("${year}") that doesn't appear in the resume or job description.`);
    }
  }

  return { valid: violations.length === 0, violations };
}
