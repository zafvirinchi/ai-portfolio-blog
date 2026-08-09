import { SkillGap } from "../resume/resume-schema";
import { LearningPlan, WeaknessAnalysis } from "./prep-schema";

// Deterministic — buckets already-computed weakness/skill-gap data
// (resume/resume-suggestions.ts's SkillGap, read-only) across 4
// timeframes by priority. No LLM call: this is the same "reuse proven
// recommendation data, don't regenerate it" philosophy every deterministic
// section in this arc follows.

const TIMEFRAMES = [7, 15, 30, 60] as const;

// Cumulative item counts per timeframe — shorter windows get fewer,
// higher-priority items; 60-day gets everything available.
const TOPIC_COUNTS = [3, 6, Infinity, Infinity];
const COURSE_COUNTS = [1, 2, Infinity, Infinity];
const PROJECT_COUNTS = [0, 1, 2, Infinity];

const FOCUS_BY_TIMEFRAME: Record<(typeof TIMEFRAMES)[number], string[]> = {
  7: ["Close the biggest gaps first"],
  15: ["Build breadth across weak areas"],
  30: ["Apply learning through a real project"],
  60: ["Full depth and mock-interview-ready polish"],
};

function boundedSlice<T>(items: T[], count: number): T[] {
  return items.slice(0, Number.isFinite(count) ? count : items.length);
}

function practiceNotesFor(days: (typeof TIMEFRAMES)[number], skillGap: SkillGap): string[] {
  switch (days) {
    case 7:
      return ["Review your resume's own bullet points out loud — be ready to expand on every one."];
    case 15:
      return ["Do 2-3 mock technical questions per weak topic you've identified."];
    case 30:
      return [
        "Complete at least one hands-on project touching your top missing skills.",
        ...(skillGap.recommendedCertifications.length > 0
          ? [`Consider starting: ${skillGap.recommendedCertifications[0]}`]
          : []),
      ];
    case 60:
      return [
        "Do a full mock interview covering technical, HR, and system design.",
        "Revisit the cheat sheet the day before your interview.",
      ];
  }
}

export function buildLearningRoadmap(weaknesses: WeaknessAnalysis, skillGap: SkillGap): LearningPlan[] {
  const topics = weaknesses.conceptsToLearn.length > 0 ? weaknesses.conceptsToLearn : weaknesses.knowledgeGaps;

  return TIMEFRAMES.map((days, index) => {
    const planTopics = boundedSlice(topics, TOPIC_COUNTS[index]);

    return {
      days,
      focus: FOCUS_BY_TIMEFRAME[days],
      topics: planTopics,
      projects: boundedSlice(skillGap.recommendedProjects, PROJECT_COUNTS[index]),
      courses: boundedSlice(skillGap.recommendedCourses, COURSE_COUNTS[index]),
      documentation: planTopics.map((topic) => `Official documentation for ${topic}`),
      interviewPracticeNotes: practiceNotesFor(days, skillGap),
    };
  });
}
