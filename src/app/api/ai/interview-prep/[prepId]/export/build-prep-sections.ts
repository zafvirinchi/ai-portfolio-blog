import type { JobDescription } from "@/lib/ai/job-description/jd-schema";
import type { InterviewPreparationReport, StarAnswer, TechnicalAnswer } from "@/lib/ai/interview-prep/prep-schema";

// Shared "report -> structured sections" formatter — every export format
// (Markdown/PDF/DOCX) renders from this same object, so they can never
// drift from each other. Same pattern every export route in this arc uses.

export interface QaSection {
  question: string;
  answerText: string;
}

export interface PrepExportSections {
  candidateName: string;
  targetRole: string;
  readinessScore: number;
  technicalQuestions: QaSection[];
  hrQuestions: QaSection[];
  projectQuestions: QaSection[];
  systemDesignQuestions: QaSection[];
  codingRecommendations: string[];
  weakAreas: string[];
  learningRoadmap: { days: number; topics: string[] }[];
  cheatSheet: { technology: string; points: string[] }[];
}

function isTechnicalAnswer(answer: TechnicalAnswer | StarAnswer): answer is TechnicalAnswer {
  return "architecture" in answer;
}

function formatIdealAnswer(answer: TechnicalAnswer | StarAnswer): string {
  if (isTechnicalAnswer(answer)) {
    return [
      `Architecture: ${answer.architecture}`,
      `Trade-offs: ${answer.tradeoffs}`,
      `Best Practices: ${answer.bestPractices}`,
      `Performance: ${answer.performance}`,
      `Security: ${answer.security}`,
    ].join("\n");
  }

  return [
    `Situation: ${answer.situation}`,
    `Task: ${answer.task}`,
    `Action: ${answer.action}`,
    `Result: ${answer.result}`,
  ].join("\n");
}

export function buildPrepExportSections(
  report: InterviewPreparationReport,
  jobDescription: JobDescription,
  candidateName: string
): PrepExportSections {
  const targetRole = [jobDescription.jobTitle, jobDescription.companyName].filter(Boolean).join(" at ") || "this role";

  return {
    candidateName,
    targetRole,
    readinessScore: report.readinessScore.overall,
    technicalQuestions: report.technicalQuestions.map((item) => ({
      question: item.question,
      answerText: "idealAnswer" in item ? formatIdealAnswer(item.idealAnswer) : item.answer,
    })),
    hrQuestions: report.hrQuestions.map((item) => ({
      question: item.question,
      answerText: formatIdealAnswer(item.idealAnswer),
    })),
    projectQuestions: report.projectQuestions.map((item) => ({
      question: `[${item.projectName}] ${item.question}`,
      answerText: formatIdealAnswer(item.idealAnswer),
    })),
    systemDesignQuestions: report.systemDesignQuestions.map((item) => ({
      question: `[${item.difficulty}] ${item.question}`,
      answerText: formatIdealAnswer(item.idealAnswer),
    })),
    codingRecommendations: report.codingRecommendations.map(
      (item) => `${item.topic} (${item.difficulty}) — ${item.practiceNote}`
    ),
    weakAreas: report.weaknessAnalysis.weakAreas,
    learningRoadmap: report.learningRoadmap.map((plan) => ({ days: plan.days, topics: plan.topics })),
    cheatSheet: report.cheatSheet.map((entry) => ({ technology: entry.technology, points: entry.points })),
  };
}

export function renderPrepMarkdown(sections: PrepExportSections): string {
  const lines: string[] = [
    `# Interview Preparation — ${sections.candidateName}`,
    `*For: ${sections.targetRole}*`,
    "",
    `## Readiness Score: ${sections.readinessScore}/100`,
    "",
  ];

  const renderQaList = (title: string, items: QaSection[]) => {
    if (items.length === 0) return;
    lines.push(`## ${title}`, "");
    for (const item of items) {
      lines.push(`**Q: ${item.question}**`, "", item.answerText, "");
    }
  };

  renderQaList("Technical Questions", sections.technicalQuestions);
  renderQaList("HR Questions", sections.hrQuestions);
  renderQaList("Project Questions", sections.projectQuestions);
  renderQaList("System Design Questions", sections.systemDesignQuestions);

  if (sections.codingRecommendations.length > 0) {
    lines.push("## Coding Practice", "", ...sections.codingRecommendations.map((item) => `- ${item}`), "");
  }

  if (sections.weakAreas.length > 0) {
    lines.push("## Weak Areas", "", ...sections.weakAreas.map((item) => `- ${item}`), "");
  }

  if (sections.learningRoadmap.length > 0) {
    lines.push("## Learning Roadmap");
    for (const plan of sections.learningRoadmap) {
      lines.push("", `### ${plan.days}-Day Plan`, ...plan.topics.map((topic) => `- ${topic}`));
    }
    lines.push("");
  }

  if (sections.cheatSheet.length > 0) {
    lines.push("## Cheat Sheet");
    for (const entry of sections.cheatSheet) {
      lines.push("", `### ${entry.technology}`, ...entry.points.map((point) => `- ${point}`));
    }
  }

  return lines.join("\n");
}
