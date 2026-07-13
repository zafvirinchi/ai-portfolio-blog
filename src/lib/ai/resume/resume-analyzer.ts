import { openai } from "../openai";
import { Resume, ResumeAnalysis, RESUME_ANALYSIS_JSON_SCHEMA, resumeAnalysisSchema } from "./resume-schema";

const ANALYSIS_MODEL = "gpt-4o-mini";

function summarizeResumeForPrompt(resume: Resume): string {
  const lines: string[] = [];

  lines.push(`Name: ${resume.contact.name ?? "Unknown"}`);
  lines.push(`Years of experience: ${resume.yearsOfExperience ?? "Unknown"}`);

  if (resume.summary) {
    lines.push(`Existing summary: ${resume.summary}`);
  }

  lines.push(`Skills: ${resume.skills.join(", ") || "None listed"}`);
  lines.push(`Technical skills: ${resume.technicalSkills.join(", ") || "None listed"}`);
  lines.push(`Soft skills: ${resume.softSkills.join(", ") || "None listed"}`);

  if (resume.workExperience.length > 0) {
    lines.push("Work experience:");
    for (const job of resume.workExperience) {
      const period = [job.startDate, job.isCurrent ? "Present" : job.endDate]
        .filter(Boolean)
        .join(" - ");
      lines.push(`  - ${job.title} at ${job.company} (${period || "dates unknown"})`);
      for (const bullet of job.description) {
        lines.push(`      * ${bullet}`);
      }
    }
  }

  if (resume.education.length > 0) {
    lines.push("Education:");
    for (const edu of resume.education) {
      lines.push(`  - ${edu.degree}, ${edu.institution}`);
    }
  }

  if (resume.certifications.length > 0) {
    lines.push(`Certifications: ${resume.certifications.map((c) => c.name).join(", ")}`);
  }

  if (resume.projects.length > 0) {
    lines.push("Projects:");
    for (const project of resume.projects) {
      lines.push(
        `  - ${project.name}${project.technologies.length ? ` (${project.technologies.join(", ")})` : ""}`
      );
    }
  }

  if (resume.achievements.length > 0) {
    lines.push(`Achievements: ${resume.achievements.join("; ")}`);
  }

  return lines.join("\n");
}

function buildAnalysisMessages(resume: Resume) {
  return [
    {
      role: "system" as const,
      content: `You are a senior technical recruiter and career coach reviewing a
candidate's resume. Be specific and professional; base every claim only on
the resume content given to you. "careerLevel" must be your best-judgment
classification into exactly one of: entry-level, mid-level, senior, lead,
principal, based on years of experience, role titles, and scope of
responsibility described. "suitableRoles" should be concrete job titles
(e.g. "Senior Java Developer", "Backend Engineer"). "technologyStack"
should list the candidate's core technologies, deduplicated and normalized
(e.g. "Spring Boot" not "spring-boot, SpringBoot"). "missingSkills" and
"improvementSuggestions" should be actionable, not generic.`,
    },
    {
      role: "user" as const,
      content: `Analyze this resume:\n\n${summarizeResumeForPrompt(resume)}`,
    },
  ];
}

/**
 * Produces a holistic, LLM-generated qualitative analysis of a parsed
 * resume: strengths, weaknesses, career level, suitable roles, etc.
 * This is deliberately the only LLM call in the resume/ package besides
 * extraction (resume-parser.ts) — scoring (resume-score.ts) and skill-gap
 * matching (resume-suggestions.ts) are both deterministic, see those files
 * for why.
 */
export class ResumeAnalyzer {
  async analyze(resume: Resume): Promise<ResumeAnalysis> {
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      temperature: 0.3,
      messages: buildAnalysisMessages(resume),
      response_format: {
        type: "json_schema",
        json_schema: RESUME_ANALYSIS_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Resume analysis LLM returned no content");
    }

    const parsed = resumeAnalysisSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Resume analysis failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}

export const resumeAnalyzer = new ResumeAnalyzer();
