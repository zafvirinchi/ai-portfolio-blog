import {
  CareerLevelTransition,
  CareerProgressionResult,
  PromotionEvent,
  SENIORITY_LEVEL_NAMES,
  SeniorityLevelName,
  TimelineEntry,
} from "./parser-types";

// Phase 12 Milestone 5. Detects career progression (Junior -> Engineer ->
// Senior -> Lead -> Architect -> Executive) via keyword matching against
// each timeline entry's title, in chronological order. Keyword-based, not
// semantic — a title that matches none of the keywords is treated as
// "unknown level" and skipped rather than guessed.

// Checked in order — first match wins, so "Senior Software Engineer"
// matches Senior (not Engineer) because Senior is listed first.
const LEVEL_KEYWORDS: { level: SeniorityLevelName; keywords: string[] }[] = [
  { level: "Executive", keywords: ["vice president", "vp ", " vp", "chief", "cto", "ceo", "coo", "cxo", "head of", "svp"] },
  { level: "Architect", keywords: ["architect", "director", "principal"] },
  { level: "Lead", keywords: ["lead", "manager", "staff engineer"] },
  { level: "Senior", keywords: ["senior", "sr.", "sr "] },
  { level: "Engineer", keywords: ["engineer", "developer", "analyst", "consultant", "specialist"] },
  { level: "Junior", keywords: ["junior", "jr.", "associate", "trainee"] },
  { level: "Intern", keywords: ["intern"] },
];

function levelIndex(level: SeniorityLevelName): number {
  return SENIORITY_LEVEL_NAMES.indexOf(level);
}

function detectLevel(title: string | null): SeniorityLevelName | null {
  if (!title) return null;
  const lower = ` ${title.toLowerCase()} `;

  for (const entry of LEVEL_KEYWORDS) {
    if (entry.keywords.some((keyword) => lower.includes(keyword))) {
      return entry.level;
    }
  }

  return null;
}

export function analyzeCareerProgression(timeline: TimelineEntry[]): CareerProgressionResult {
  const sorted = [...timeline].sort((a, b) => (a.startDate ?? "0000-00").localeCompare(b.startDate ?? "0000-00"));

  const careerGrowth: CareerLevelTransition[] = [];
  const promotionHistory: PromotionEvent[] = [];
  let leadershipGrowth = false;
  let previousLevel: SeniorityLevelName | null = null;

  for (const entry of sorted) {
    const level = detectLevel(entry.title);
    if (!level) continue;

    if (levelIndex(level) >= levelIndex("Lead")) {
      leadershipGrowth = true;
    }

    if (previousLevel && levelIndex(level) > levelIndex(previousLevel)) {
      const levelChange = levelIndex(level) - levelIndex(previousLevel);

      careerGrowth.push({
        from: previousLevel,
        to: level,
        date: entry.startDate,
        title: entry.title ?? "",
        company: entry.company,
      });

      promotionHistory.push({
        title: entry.title ?? "",
        company: entry.company,
        date: entry.startDate,
        levelChange,
      });
    }

    previousLevel = level;
  }

  const roleCount = sorted.filter((entry) => entry.title).length;
  const careerProgressionScore =
    roleCount === 0
      ? 0
      : Math.min(100, Math.round((promotionHistory.length / roleCount) * 60) + (leadershipGrowth ? 40 : 0));

  return { careerGrowth, promotionHistory, leadershipGrowth, careerProgressionScore };
}
