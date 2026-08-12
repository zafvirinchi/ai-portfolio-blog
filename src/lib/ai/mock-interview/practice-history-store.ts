// Phase 17 Milestone 6 — a client-only, browser-localStorage breadcrumb
// list of PAST session IDs this browser has completed, nothing more. Not
// a new backend store, not a new source of truth, not a database
// migration: sessionService (server, in-memory, 2h TTL) remains the ONLY
// authoritative source for every score/readiness/coverage value. This
// file only ever remembers WHICH opaque sessionIds to ask the server
// about later — the exact same bearer token every other mock-interview
// route already trusts a client to hold and present back.
//
// Why this exists at all: sessionService has no list()/getAll() method
// (audited — see the milestone's final report, §1), and the Mock
// Interview page only ever keeps ONE `session` in React state at a time
// (overwritten on restart). Without SOME place to remember prior
// sessionIds across a restart/reload, "practice history" genuinely
// cannot be retrieved at all under the existing architecture — this is
// the documented, deliberately minimal answer to that gap: a capped,
// TTL-pruned list of ids, never scores or content.

export interface PracticeHistoryEntry {
  sessionId: string;
  prepId: string | null;
  resumeId: string;
  jdMatchId: string;
  completedAt: string;
}

const STORAGE_KEY = "mockInterviewPracticeHistory:v1";
const MAX_ENTRIES = 10;
// Mirrors session-service.ts's own SESSION_TTL_MS (2h) — no point
// remembering an id the server has already forgotten.
const ENTRY_TTL_MS = 2 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): PracticeHistoryEntry[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed.filter(
      (entry): entry is PracticeHistoryEntry =>
        entry &&
        typeof entry.sessionId === "string" &&
        typeof entry.resumeId === "string" &&
        typeof entry.jdMatchId === "string" &&
        typeof entry.completedAt === "string" &&
        now - new Date(entry.completedAt).getTime() < ENTRY_TTL_MS
    );
  } catch {
    // Corrupt/unavailable localStorage is never fatal — just means no history.
    return [];
  }
}

function writeAll(entries: PracticeHistoryEntry[]): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Storage full/disabled — history just won't persist; not fatal.
  }
}

export function recordCompletedSession(entry: Omit<PracticeHistoryEntry, "completedAt">): void {
  const existing = readAll().filter((e) => e.sessionId !== entry.sessionId);
  writeAll([...existing, { ...entry, completedAt: new Date().toISOString() }]);
}

/** Chronological (oldest first), pruned to unexpired entries matching the given resume/JD context — the same context-compatibility rule the progress API route re-verifies server-side. */
export function getRecentSessionIds(context: { resumeId: string; jdMatchId: string }): string[] {
  return readAll()
    .filter((entry) => entry.resumeId === context.resumeId && entry.jdMatchId === context.jdMatchId)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .map((entry) => entry.sessionId);
}
