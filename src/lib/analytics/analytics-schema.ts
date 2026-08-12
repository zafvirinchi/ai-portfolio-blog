import { z } from "zod";

// Phase 14 Milestone 5. Snake_case kept verbatim for row shapes, matching
// every prior milestone's *-schema.ts convention.

export const DATE_RANGE_PRESETS = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "this_month",
  "previous_month",
  "this_year",
  "custom",
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

// A hard ceiling on any resolved range (including "custom") — this is
// the "do not trust arbitrary date ranges that could create abusive
// database queries" guard. 400 days comfortably covers "this_year" for
// any day of the year while still bounding worst-case row scans.
export const MAX_RANGE_DAYS = 400;

export const dateRangeQuerySchema = z
  .object({
    range: z.enum(DATE_RANGE_PRESETS).default("last_30_days"),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .refine((value) => value.range !== "custom" || (value.from && value.to), {
    message: "custom range requires both from and to",
  })
  .refine((value) => !value.from || !value.to || new Date(value.from).getTime() <= new Date(value.to).getTime(), {
    message: "from must be before to",
  })
  .refine(
    (value) => !value.from || !value.to || (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86_400_000 <= MAX_RANGE_DAYS,
    { message: `custom range cannot exceed ${MAX_RANGE_DAYS} days` }
  );

export const ANALYTICS_EXPORT_TABLES = ["revenue", "subscriptions", "ai-usage", "users", "organizations"] as const;
export type AnalyticsExportTable = (typeof ANALYTICS_EXPORT_TABLES)[number];

export const analyticsExportQuerySchema = dateRangeQuerySchema.and(
  z.object({ table: z.enum(ANALYTICS_EXPORT_TABLES) })
);

export const ANOMALY_SEVERITIES = ["info", "warning", "critical"] as const;
export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];

export const ANOMALY_TYPES = [
  "usage_spike",
  "high_credit_consumption",
  "repeated_failures",
  "cost_increase",
  "organization_near_limit",
  "user_high_requests",
] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];

// ---------------------------------------------------------------------------
// Date range resolution — the one place a preset (or validated custom
// from/to) becomes a concrete [from, to) window. Every analytics module
// takes the resolved DateRange, never a raw preset string, so this is
// the only function that needs to know what "this_month" etc. mean.
// ---------------------------------------------------------------------------

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function resolveDateRange(query: { range: DateRangePreset; from?: string; to?: string }): { preset: DateRangePreset; from: Date; to: Date } {
  const now = new Date();

  switch (query.range) {
    case "today":
      return { preset: query.range, from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const yesterday = new Date(now.getTime() - 86_400_000);
      return { preset: query.range, from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case "last_7_days":
      return { preset: query.range, from: startOfDay(new Date(now.getTime() - 6 * 86_400_000)), to: endOfDay(now) };
    case "last_30_days":
      return { preset: query.range, from: startOfDay(new Date(now.getTime() - 29 * 86_400_000)), to: endOfDay(now) };
    case "last_90_days":
      return { preset: query.range, from: startOfDay(new Date(now.getTime() - 89 * 86_400_000)), to: endOfDay(now) };
    case "this_month":
      return { preset: query.range, from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "previous_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { preset: query.range, from, to };
    }
    case "this_year":
      return { preset: query.range, from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    case "custom": {
      // Validated by dateRangeQuerySchema before this ever runs (both
      // present, from <= to, span <= MAX_RANGE_DAYS) — the non-null
      // assertions below are safe given that contract.
      return { preset: "custom", from: new Date(query.from as string), to: new Date(query.to as string) };
    }
  }
}
