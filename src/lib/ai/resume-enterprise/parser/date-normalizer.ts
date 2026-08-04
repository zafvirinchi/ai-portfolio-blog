import { NormalizedDate } from "./parser-types";

// Phase 12 Milestone 5. Normalizes every resume date format into YYYY-MM,
// always retaining the raw source value. Note: by the time this runs,
// Milestone 2's resume-normalizer.ts has usually already collapsed
// "Present"/"Current"/"Till Date"/etc. into the literal string "Present"
// on companyHistory[].endDate — this module handles that plus every other
// raw format independently, so it's correct even given unnormalized input.

const PRESENT_ALIASES = new Set([
  "present",
  "current",
  "currently working",
  "ongoing",
  "till date",
  "till now",
  "to date",
  "now",
]);

const MONTH_NAMES: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

export function normalizeDate(raw: string | null): NormalizedDate {
  if (!raw || !raw.trim()) {
    return { normalized: null, raw, isCurrent: false, isApproximate: false };
  }

  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (PRESENT_ALIASES.has(lower)) {
    return { normalized: null, raw: trimmed, isCurrent: true, isApproximate: false };
  }

  // "Jan 2022" / "January 2022"
  const monthYearMatch = lower.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (monthYearMatch) {
    const month = MONTH_NAMES[monthYearMatch[1]];
    if (month) {
      return { normalized: `${monthYearMatch[2]}-${month}`, raw: trimmed, isCurrent: false, isApproximate: false };
    }
  }

  // "01/2022" or "1/2022"
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    return { normalized: `${slashMatch[2]}-${month}`, raw: trimmed, isCurrent: false, isApproximate: false };
  }

  // "2022-01"
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    const month = isoMatch[2].padStart(2, "0");
    return { normalized: `${isoMatch[1]}-${month}`, raw: trimmed, isCurrent: false, isApproximate: false };
  }

  // "2022" — year only, no month information given, so the month is
  // approximated to January and flagged `isApproximate`.
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    return { normalized: `${yearMatch[1]}-01`, raw: trimmed, isCurrent: false, isApproximate: true };
  }

  return { normalized: null, raw: trimmed, isCurrent: false, isApproximate: false };
}

function parseYearMonth(value: string): { year: number; month: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

/**
 * Inclusive month count between two normalized dates. `referenceDate` is
 * the one intentionally time-dependent input in the whole parser package:
 * an ongoing ("Present") role's duration depends on when this runs, the
 * same way "Present" always means "as of now" on a real resume. Injectable
 * so tests can pin it for deterministic output.
 */
export function computeDurationMonths(
  start: NormalizedDate,
  end: NormalizedDate,
  referenceDate: Date = new Date()
): number | null {
  const startParts = start.normalized ? parseYearMonth(start.normalized) : null;
  if (!startParts) return null;

  const endParts = end.isCurrent
    ? { year: referenceDate.getFullYear(), month: referenceDate.getMonth() + 1 }
    : end.normalized
      ? parseYearMonth(end.normalized)
      : null;

  if (!endParts) return null;

  const months = (endParts.year - startParts.year) * 12 + (endParts.month - startParts.month) + 1;
  return Math.max(0, months);
}
