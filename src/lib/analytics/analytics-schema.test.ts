import { describe, expect, it } from "vitest";

import { dateRangeQuerySchema, MAX_RANGE_DAYS, resolveDateRange } from "./analytics-schema";

describe("resolveDateRange", () => {
  it("resolves 'today' to the start and end of the current calendar day", () => {
    const range = resolveDateRange({ range: "today" });
    const now = new Date();

    expect(range.from.getDate()).toBe(now.getDate());
    expect(range.from.getHours()).toBe(0);
    expect(range.to.getHours()).toBe(23);
  });

  it("resolves 'last_7_days' to a 7-day-inclusive span ending today", () => {
    const range = resolveDateRange({ range: "last_7_days" });
    const spanDays = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000);
    expect(spanDays).toBeGreaterThanOrEqual(6);
    expect(spanDays).toBeLessThan(8);
  });

  it("resolves 'this_month' to the 1st of the current month through now", () => {
    const range = resolveDateRange({ range: "this_month" });
    expect(range.from.getDate()).toBe(1);
  });

  it("resolves 'previous_month' to the full previous calendar month, not touching the current month", () => {
    const now = new Date();
    const range = resolveDateRange({ range: "previous_month" });

    expect(range.from.getDate()).toBe(1);
    expect(range.from.getMonth()).toBe(range.to.getMonth());
    expect(range.to.getTime()).toBeLessThan(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
  });

  it("resolves 'custom' to the exact provided from/to", () => {
    const range = resolveDateRange({ range: "custom", from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T23:59:59.999Z" });
    expect(range.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });
});

describe("dateRangeQuerySchema", () => {
  it("defaults to last_30_days when no range is given", () => {
    const parsed = dateRangeQuerySchema.parse({});
    expect(parsed.range).toBe("last_30_days");
  });

  it("rejects a custom range missing from/to", () => {
    expect(() => dateRangeQuerySchema.parse({ range: "custom" })).toThrow();
  });

  it("rejects from > to", () => {
    expect(() =>
      dateRangeQuerySchema.parse({ range: "custom", from: "2026-02-01T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z" })
    ).toThrow();
  });

  it("rejects a custom range wider than MAX_RANGE_DAYS — the 'don't allow abusive queries' guard", () => {
    const from = new Date("2020-01-01T00:00:00.000Z");
    const to = new Date(from.getTime() + (MAX_RANGE_DAYS + 10) * 86_400_000);
    expect(() => dateRangeQuerySchema.parse({ range: "custom", from: from.toISOString(), to: to.toISOString() })).toThrow();
  });

  it("accepts a custom range within MAX_RANGE_DAYS", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date(from.getTime() + 30 * 86_400_000);
    expect(() => dateRangeQuerySchema.parse({ range: "custom", from: from.toISOString(), to: to.toISOString() })).not.toThrow();
  });

  it("rejects an unknown preset", () => {
    expect(() => dateRangeQuerySchema.parse({ range: "last_century" })).toThrow();
  });
});
