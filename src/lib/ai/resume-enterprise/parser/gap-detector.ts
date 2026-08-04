import { EnterpriseResume } from "../resume-schema";
import { EmploymentGap, TimelineEntry } from "./parser-types";

// Phase 12 Milestone 5. Detects employment gaps between consecutive
// timeline entries. A gap's `reason` is best-effort only — a keyword scan
// against summary/achievements text, attached to every gap found (not
// tied to a specific date range, since nothing in the source text
// connects a mention to one particular gap).

const GAP_REASON_KEYWORDS: { keyword: string; reason: string }[] = [
  { keyword: "sabbatical", reason: "Sabbatical" },
  { keyword: "career break", reason: "Career break" },
  { keyword: "maternity", reason: "Maternity leave" },
  { keyword: "paternity", reason: "Paternity leave" },
  { keyword: "personal reason", reason: "Personal reasons" },
  { keyword: "family", reason: "Family commitments" },
  { keyword: "travel", reason: "Travel" },
  { keyword: "health", reason: "Health reasons" },
  { keyword: "higher stud", reason: "Higher studies" },
];

function findBestEffortReason(resume: EnterpriseResume): string | null {
  const text = [resume.professionalSummary.careerObjective ?? "", resume.professionalSummary.headline ?? "", ...resume.achievements]
    .join(" ")
    .toLowerCase();

  const match = GAP_REASON_KEYWORDS.find((entry) => text.includes(entry.keyword));
  return match?.reason ?? null;
}

function toIndex(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + (month - 1);
}

function fromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function detectEmploymentGaps(
  timeline: TimelineEntry[],
  resume: EnterpriseResume,
  thresholdMonths = 2
): EmploymentGap[] {
  const dated = timeline.filter((entry) => entry.startDate);
  if (dated.length < 2) return [];

  const sorted = [...dated].sort((a, b) => (a.startDate as string).localeCompare(b.startDate as string));
  const reason = findBestEffortReason(resume);
  const gaps: EmploymentGap[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // An ongoing role can't precede a gap.
    if (current.isCurrent) continue;

    const currentEndIndex = current.endDate ? toIndex(current.endDate) : toIndex(current.startDate as string);
    const nextStartIndex = toIndex(next.startDate as string);
    const gapMonths = nextStartIndex - currentEndIndex - 1;

    if (gapMonths >= thresholdMonths) {
      gaps.push({
        startDate: fromIndex(currentEndIndex + 1),
        endDate: fromIndex(nextStartIndex - 1),
        months: gapMonths,
        reason,
      });
    }
  }

  return gaps;
}
