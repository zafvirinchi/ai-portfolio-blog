import { ragKnowledge } from "../knowledge/rag.service";
import { resumeRequestContext, resumeService } from "../resume";
import { ResumeRecord } from "../resume/resume-types";
import { ToolResponse, AITool } from "./types";
import { RagToolResult } from "@/types/tool-result";

// Renders the in-memory analysis of an uploaded resume into a text block
// suitable for prompt context — mirrors the shape `buildContext()`
// (lib/ai/context.ts) produces for RAG chunks, since the result is fed
// through the exact same generation step (PortfolioChain).
function buildResumeContext(record: ResumeRecord): string {
  const { resume, analysis, atsScore, skillGap } = record;

  const lines: string[] = [
    "SPECIAL MODE — RESUME ANALYSIS: The user has uploaded their own resume " +
      "for analysis below. For this question, answer as a resume-analysis " +
      "assistant for THIS candidate (not about Zafrul). This data is real " +
      "and provided — never say the information is unavailable.",
    "",
    `Uploaded resume: ${record.filename} (candidate: ${resume.contact.name ?? "unknown"})`,
    `Years of experience: ${resume.yearsOfExperience ?? "unknown"}`,
    `Career level: ${analysis.careerLevel}`,
    `Suitable roles: ${analysis.suitableRoles.join(", ") || "none identified"}`,
    `Technology stack: ${analysis.technologyStack.join(", ") || "none identified"}`,
    "",
    `ATS overall score: ${atsScore.overall}/100`,
    `ATS breakdown — formatting: ${atsScore.formatting}, keyword: ${atsScore.keyword}, experience: ${atsScore.experience}, skills: ${atsScore.skills}, education: ${atsScore.education}, certification: ${atsScore.certification}`,
    `ATS explanation: ${atsScore.explanation}`,
    "",
    `Key strengths: ${analysis.keyStrengths.join("; ") || "none identified"}`,
    `Weaknesses: ${analysis.weaknesses.join("; ") || "none identified"}`,
    `Missing skills (general): ${analysis.missingSkills.join(", ") || "none identified"}`,
    `Improvement suggestions: ${analysis.improvementSuggestions.join("; ") || "none"}`,
    "",
    `Missing Java skills: ${skillGap.missingJavaSkills.join(", ") || "none"}`,
    `Missing Spring skills: ${skillGap.missingSpringSkills.join(", ") || "none"}`,
    `Missing Cloud skills: ${skillGap.missingCloudSkills.join(", ") || "none"}`,
    `Missing DevOps skills: ${skillGap.missingDevOpsSkills.join(", ") || "none"}`,
    `Missing AI skills: ${skillGap.missingAiSkills.join(", ") || "none"}`,
    `Missing Database skills: ${skillGap.missingDatabaseSkills.join(", ") || "none"}`,
    `Recommended courses: ${skillGap.recommendedCourses.join("; ") || "none"}`,
    `Recommended certifications: ${skillGap.recommendedCertifications.join("; ") || "none"}`,
    `Recommended projects: ${skillGap.recommendedProjects.join("; ") || "none"}`,
  ];

  return lines.join("\n");
}

export class ResumeTool implements AITool {
  name = "resume-tool";

  description = "Questions about an uploaded resume's ATS score, skill gaps, or analysis, or Zafrul's own resume/CV";

  keywords = [
    "resume",
    "cv",
    "ats",
    "ats score",
    "skill gap",
    "skills gap",
    "missing skills",
    "career level",
    "suitable role",
  ];

  priority = 100;

  async execute(question: string): Promise<ToolResponse<RagToolResult>> {
    const activeResumeId = resumeRequestContext.getStore()?.resumeId;
    const record = activeResumeId ? resumeService.get(activeResumeId) : undefined;

    if (record) {
      return {
        success: true,
        tool: this.name,
        result: {
          context: buildResumeContext(record),
          chunks: [],
        },
      };
    }

    // No uploaded resume in context for this request — preserve the
    // pre-existing behavior for "resume" intent questions about Zafrul's
    // own resume/CV (a "resume" rag_documents entry, searched like any
    // other knowledge-base question).
    const fallback = await ragKnowledge.search(question);

    return {
      success: true,
      tool: this.name,
      result: {
        context: fallback.context,
        chunks: fallback.chunks,
      },
    };
  }
}

export const resumeTool = new ResumeTool();
