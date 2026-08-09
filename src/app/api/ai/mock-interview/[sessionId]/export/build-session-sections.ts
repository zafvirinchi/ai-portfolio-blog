import type { TranscriptTurn } from "@/lib/ai/mock-interview/session-schema";
import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";

// Shared "session -> structured sections" formatter — every export format
// (Markdown/PDF/DOCX) renders from this same object, same pattern every
// export route in this arc uses (see interview-prep's build-prep-sections.ts).

export interface TranscriptSection {
  question: string;
  type: string;
  difficulty: string;
  answerText: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  betterAnswer: string;
}

export interface CategoryScoreSection {
  label: string;
  score: number;
}

export interface SessionExportSections {
  candidateName: string;
  targetRole: string;
  interviewType: string;
  overallScore: number;
  interviewReadiness: number;
  categoryScores: CategoryScoreSection[];
  transcript: TranscriptSection[];
  strengths: string[];
  weaknesses: string[];
  topImprovements: string[];
  questionsMissed: string[];
  learningRoadmap: { days: number; topics: string[] }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  communication: "Communication",
  problemSolving: "Problem Solving",
  architecture: "Architecture",
  leadership: "Leadership",
  confidence: "Confidence",
  coding: "Coding",
  behavioral: "Behavioral",
};

function turnToSection(turn: TranscriptTurn): TranscriptSection {
  return {
    question: turn.question.text,
    type: turn.question.type,
    difficulty: turn.question.difficulty,
    answerText: turn.answerText,
    score: turn.evaluation.overallScore,
    strengths: turn.evaluation.strengths,
    weaknesses: turn.evaluation.weaknesses,
    betterAnswer: turn.evaluation.betterAnswer,
  };
}

export function buildSessionExportSections(
  session: SessionRecord,
  jobTitle: string | null,
  companyName: string | null,
  candidateName: string
): SessionExportSections {
  const targetRole = [jobTitle, companyName].filter(Boolean).join(" at ") || "this role";
  const report = session.report;

  return {
    candidateName,
    targetRole,
    interviewType: session.interviewType,
    overallScore: report?.overallScore ?? 0,
    interviewReadiness: report?.interviewReadiness ?? 0,
    categoryScores: report
      ? Object.entries(report.categoryScores).map(([key, score]) => ({ label: CATEGORY_LABELS[key] ?? key, score }))
      : [],
    transcript: session.transcript.map(turnToSection),
    strengths: report?.strengths ?? [],
    weaknesses: report?.weaknesses ?? [],
    topImprovements: report?.topImprovements ?? [],
    questionsMissed: report?.questionsMissed ?? [],
    learningRoadmap: report?.learningRoadmap.map((plan) => ({ days: plan.days, topics: plan.topics })) ?? [],
  };
}

export function renderSessionMarkdown(sections: SessionExportSections): string {
  const lines: string[] = [
    `# Mock Interview Report — ${sections.candidateName}`,
    `*${sections.interviewType} interview for: ${sections.targetRole}*`,
    "",
    `## Overall Score: ${sections.overallScore}/100`,
    `## Interview Readiness: ${sections.interviewReadiness}/100`,
    "",
  ];

  if (sections.categoryScores.length > 0) {
    lines.push("## Category Scores", "", ...sections.categoryScores.map(({ label, score }) => `- ${label}: ${score}/100`), "");
  }

  if (sections.transcript.length > 0) {
    lines.push("## Transcript", "");

    sections.transcript.forEach((turn, index) => {
      lines.push(
        `### Q${index + 1} [${turn.type} / ${turn.difficulty}] — Score: ${turn.score}/100`,
        `**Question:** ${turn.question}`,
        "",
        `**Your answer:** ${turn.answerText || "(skipped)"}`,
        "",
        `**A stronger answer:** ${turn.betterAnswer}`,
        ""
      );
    });
  }

  if (sections.strengths.length > 0) {
    lines.push("## Strengths", "", ...sections.strengths.map((item) => `- ${item}`), "");
  }

  if (sections.weaknesses.length > 0) {
    lines.push("## Weaknesses", "", ...sections.weaknesses.map((item) => `- ${item}`), "");
  }

  if (sections.topImprovements.length > 0) {
    lines.push("## Top Improvements", "", ...sections.topImprovements.map((item) => `- ${item}`), "");
  }

  if (sections.questionsMissed.length > 0) {
    lines.push("## Questions Missed", "", ...sections.questionsMissed.map((item) => `- ${item}`), "");
  }

  if (sections.learningRoadmap.length > 0) {
    lines.push("## Learning Roadmap");

    for (const plan of sections.learningRoadmap) {
      lines.push("", `### ${plan.days}-Day Plan`, ...plan.topics.map((topic) => `- ${topic}`));
    }
  }

  return lines.join("\n");
}
