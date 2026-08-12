import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRecentSessionIds, PracticeHistoryEntry, recordCompletedSession } from "./practice-history-store";

// Phase 17 Milestone 7 — production-readiness audit finding: this
// client-only, localStorage-backed breadcrumb store (M6) had no
// dedicated tests. No jsdom/happy-dom dependency exists in this repo
// (vitest.config.mts runs environment: "node" everywhere), so a minimal,
// dependency-free fake Storage is stubbed onto `window` per test via
// vi.stubGlobal — enough to exercise the REAL read/write/prune logic
// (not just the "no window" no-op fallback path).

const STORAGE_KEY = "mockInterviewPracticeHistory:v1";

class FakeStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("window", { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const CONTEXT = { resumeId: "r1", jdMatchId: "j1" };

describe("practice-history-store — no window (SSR / non-browser)", () => {
  it("never throws and returns an empty list when window doesn't exist", () => {
    vi.unstubAllGlobals(); // simulate SSR — no window global at all
    expect(() => recordCompletedSession({ sessionId: "s1", prepId: "p1", ...CONTEXT })).not.toThrow();
    expect(getRecentSessionIds(CONTEXT)).toEqual([]);
  });
});

describe("practice-history-store — basic roundtrip", () => {
  it("returns an empty list before anything is recorded", () => {
    expect(getRecentSessionIds(CONTEXT)).toEqual([]);
  });

  it("returns a recorded session's id for the matching context", () => {
    recordCompletedSession({ sessionId: "s1", prepId: "p1", ...CONTEXT });
    expect(getRecentSessionIds(CONTEXT)).toEqual(["s1"]);
  });

  it("returns ids in chronological order (oldest first)", () => {
    recordCompletedSession({ sessionId: "s1", prepId: "p1", ...CONTEXT });
    recordCompletedSession({ sessionId: "s2", prepId: "p1", ...CONTEXT });
    recordCompletedSession({ sessionId: "s3", prepId: "p1", ...CONTEXT });
    expect(getRecentSessionIds(CONTEXT)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("practice-history-store — context filtering (never compares unrelated sessions)", () => {
  it("excludes sessions recorded under a different resumeId/jdMatchId", () => {
    recordCompletedSession({ sessionId: "s1", prepId: "p1", resumeId: "r1", jdMatchId: "j1" });
    recordCompletedSession({ sessionId: "s2", prepId: "p2", resumeId: "r2", jdMatchId: "j2" });
    expect(getRecentSessionIds({ resumeId: "r1", jdMatchId: "j1" })).toEqual(["s1"]);
    expect(getRecentSessionIds({ resumeId: "r2", jdMatchId: "j2" })).toEqual(["s2"]);
  });
});

describe("practice-history-store — duplicate session ids", () => {
  it("replaces (never duplicates) an entry re-recorded under the same sessionId", () => {
    recordCompletedSession({ sessionId: "s1", prepId: "p1", ...CONTEXT });
    recordCompletedSession({ sessionId: "s1", prepId: "p1", ...CONTEXT });
    expect(getRecentSessionIds(CONTEXT)).toEqual(["s1"]);
  });
});

describe("practice-history-store — capped entry count", () => {
  it("keeps only the most recent MAX_ENTRIES (10) sessions", () => {
    for (let i = 0; i < 15; i++) {
      recordCompletedSession({ sessionId: `s${i}`, prepId: "p1", ...CONTEXT });
    }
    const ids = getRecentSessionIds(CONTEXT);
    expect(ids).toHaveLength(10);
    expect(ids).toEqual(["s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13", "s14"]);
  });
});

describe("practice-history-store — TTL pruning (expired sessions removed gracefully)", () => {
  it("excludes an entry older than the 2h TTL, without throwing", () => {
    const stale: PracticeHistoryEntry = { sessionId: "old", prepId: "p1", ...CONTEXT, completedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() };
    storage.setItem(STORAGE_KEY, JSON.stringify([stale]));
    expect(getRecentSessionIds(CONTEXT)).toEqual([]);
  });

  it("keeps an entry within the TTL window", () => {
    const fresh: PracticeHistoryEntry = { sessionId: "fresh", prepId: "p1", ...CONTEXT, completedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() };
    storage.setItem(STORAGE_KEY, JSON.stringify([fresh]));
    expect(getRecentSessionIds(CONTEXT)).toEqual(["fresh"]);
  });
});

describe("practice-history-store — malformed/corrupted localStorage data", () => {
  it("returns an empty list (never throws) for invalid JSON", () => {
    storage.setItem(STORAGE_KEY, "{not valid json[[[");
    expect(() => getRecentSessionIds(CONTEXT)).not.toThrow();
    expect(getRecentSessionIds(CONTEXT)).toEqual([]);
  });

  it("returns an empty list for valid JSON that isn't an array", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(getRecentSessionIds(CONTEXT)).toEqual([]);
  });

  it("silently drops individual entries missing required fields, keeping valid ones", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { sessionId: "s1", resumeId: "r1", jdMatchId: "j1", completedAt: new Date().toISOString() },
        { sessionId: "s2" /* missing resumeId/jdMatchId/completedAt */ },
        "not even an object",
        null,
      ])
    );
    expect(getRecentSessionIds(CONTEXT)).toEqual(["s1"]);
  });

  it("recovers cleanly on the next write after corrupted data was present", () => {
    storage.setItem(STORAGE_KEY, "garbage");
    recordCompletedSession({ sessionId: "s1", prepId: "p1", ...CONTEXT });
    expect(getRecentSessionIds(CONTEXT)).toEqual(["s1"]);
  });
});
