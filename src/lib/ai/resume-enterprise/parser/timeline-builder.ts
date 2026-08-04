import { ResumeCompany } from "../resume-schema";
import { computeDurationMonths, normalizeDate } from "./date-normalizer";
import { CareerProgressionResult, CareerStatistics, EmploymentGap, TimelineEntry } from "./parser-types";

// Phase 12 Milestone 5. Reconstructs a chronological career timeline from
// companyHistory and derives the summary career statistics from it.

export function buildTimeline(companyHistory: ResumeCompany[], referenceDate: Date = new Date()): TimelineEntry[] {
  const entries: TimelineEntry[] = companyHistory.map((company) => {
    const start = normalizeDate(company.startDate);
    const end = normalizeDate(company.endDate);

    return {
      startDate: start.normalized,
      endDate: end.isCurrent ? null : end.normalized,
      rawStartDate: start.raw,
      rawEndDate: end.raw,
      durationMonths: computeDurationMonths(start, end, referenceDate),
      isCurrent: end.isCurrent,
      title: company.designation,
      company: company.companyName,
      location: company.location,
      employmentType: company.employmentType,
      industry: null,
    };
  });

  return entries
    .slice()
    .sort((a, b) => (a.startDate ?? "9999-99").localeCompare(b.startDate ?? "9999-99"));
}

function toIndex(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + (month - 1);
}

/** Sums timeline duration without double-counting overlapping/concurrent roles. */
function overlapAwareTotalMonths(timeline: TimelineEntry[], referenceDate: Date): number {
  const referenceIndex = referenceDate.getFullYear() * 12 + referenceDate.getMonth();

  const intervals = timeline
    .filter((entry) => entry.startDate)
    .map((entry) => {
      const startIdx = toIndex(entry.startDate as string);
      const endIdx = entry.isCurrent ? referenceIndex : entry.endDate ? toIndex(entry.endDate) : startIdx;
      return { start: startIdx, end: Math.max(startIdx, endIdx) };
    })
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let mergedStart: number | null = null;
  let mergedEnd: number | null = null;

  for (const interval of intervals) {
    if (mergedStart === null || interval.start > (mergedEnd as number) + 1) {
      if (mergedStart !== null) total += (mergedEnd as number) - mergedStart + 1;
      mergedStart = interval.start;
      mergedEnd = interval.end;
    } else {
      mergedEnd = Math.max(mergedEnd as number, interval.end);
    }
  }

  if (mergedStart !== null) total += (mergedEnd as number) - mergedStart + 1;

  return total;
}

export function computeCareerStatistics(
  timeline: TimelineEntry[],
  gaps: EmploymentGap[],
  progression: CareerProgressionResult,
  referenceDate: Date = new Date()
): CareerStatistics {
  const durations = timeline.map((entry) => entry.durationMonths).filter((value): value is number => value !== null);

  const totalExperienceMonths = overlapAwareTotalMonths(timeline, referenceDate);
  const averageTenureMonths = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;
  const longestTenureMonths = durations.length ? Math.max(...durations) : 0;
  const shortestTenureMonths = durations.length ? Math.min(...durations) : 0;

  const gapMonths = gaps.map((gap) => gap.months);
  const employmentGapCount = gaps.length;
  const largestEmploymentGapMonths = gapMonths.length ? Math.max(...gapMonths) : 0;
  const averageEmploymentGapMonths = gapMonths.length
    ? Math.round(gapMonths.reduce((sum, value) => sum + value, 0) / gapMonths.length)
    : 0;

  // Stability is penalized by short average tenure (frequent job-hopping)
  // and by frequent employment gaps — a simple, inspectable heuristic
  // rather than a black-box score.
  let careerStabilityScore = 100;
  if (averageTenureMonths > 0) {
    if (averageTenureMonths < 12) careerStabilityScore -= 30;
    else if (averageTenureMonths < 24) careerStabilityScore -= 10;
  }
  careerStabilityScore -= Math.min(40, employmentGapCount * 10);
  careerStabilityScore = Math.max(0, Math.min(100, careerStabilityScore));

  return {
    totalExperienceMonths,
    // "Relevant" requires a target role/JD to compare against, which is
    // explicitly out of scope for this milestone — mirrors total rather
    // than silently inventing a relevance judgment. See the milestone doc.
    relevantExperienceMonths: totalExperienceMonths,
    averageTenureMonths,
    longestTenureMonths,
    shortestTenureMonths,
    careerStabilityScore,
    careerProgressionScore: progression.careerProgressionScore,
    promotionCount: progression.promotionHistory.length,
    employmentGapCount,
    largestEmploymentGapMonths,
    averageEmploymentGapMonths,
  };
}
