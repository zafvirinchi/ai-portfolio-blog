import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildCacheKey, clearAll, invalidate, withCache } from "./analytics-cache";

beforeEach(() => {
  clearAll();
});

describe("withCache", () => {
  it("calls fn on a cache miss and returns its value", async () => {
    const fn = vi.fn(async () => 42);
    const result = await withCache("key-1", fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not call fn again on a cache hit within the TTL", async () => {
    const fn = vi.fn(async () => 1);
    await withCache("key-2", fn, 10_000);
    await withCache("key-2", fn, 10_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls fn again once the TTL has expired", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn(async () => 1);
      await withCache("key-3", fn, 100);
      vi.advanceTimersByTime(200);
      await withCache("key-3", fn, 100);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats different keys as independent entries", async () => {
    const fnA = vi.fn(async () => "a");
    const fnB = vi.fn(async () => "b");
    await withCache("key-a", fnA);
    await withCache("key-b", fnB);
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });
});

describe("invalidate", () => {
  it("drops only keys matching the given prefix", async () => {
    const fn = vi.fn(async () => 1);
    await withCache("revenue?a=1", fn);
    await withCache("users?a=1", fn);

    invalidate("revenue");

    await withCache("revenue?a=1", fn);
    await withCache("users?a=1", fn);

    expect(fn).toHaveBeenCalledTimes(3); // revenue re-fetched, users still cached
  });
});

describe("buildCacheKey", () => {
  it("produces the same key regardless of parameter insertion order", () => {
    const keyA = buildCacheKey("overview", { from: "2026-01-01", to: "2026-01-31" });
    const keyB = buildCacheKey("overview", { to: "2026-01-31", from: "2026-01-01" });
    expect(keyA).toBe(keyB);
  });

  it("produces different keys for different parameter values", () => {
    const keyA = buildCacheKey("overview", { from: "2026-01-01" });
    const keyB = buildCacheKey("overview", { from: "2026-02-01" });
    expect(keyA).not.toBe(keyB);
  });
});
