import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 2 — unit tests for the anonymous per-IP rate
// limiter backing the /api/ai/chat and /api/ai/resume fixes (see those
// routes' own Phase 21 M2 comments). Mocks supabaseAdmin directly since
// this module calls it at the top level of every exported function (no
// module-scope client construction to worry about, unlike most of this
// repo's other Supabase-backed services).

type MockRow = { id: string; feature: string; ip_address: string; created_at: string };

function createSupabaseAdminMock(rows: MockRow[]) {
  let nextId = 1;

  return {
    from: (table: string) => {
      if (table !== "anonymous_ai_requests") throw new Error(`unexpected table: ${table}`);

      return {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          const filters: { feature?: string; ip?: string; since?: string } = {};
          const builder = {
            eq: (col: string, value: string) => {
              if (col === "feature") filters.feature = value;
              if (col === "ip_address") filters.ip = value;
              return builder;
            },
            gte: (_col: string, value: string) => {
              filters.since = value;
              return builder;
            },
            order: () => builder,
            limit: (n: number) => {
              const matched = rows
                .filter((r) => (!filters.feature || r.feature === filters.feature) && (!filters.ip || r.ip_address === filters.ip) && (!filters.since || r.created_at >= filters.since))
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .slice(0, n);
              return Promise.resolve({ data: matched, error: null });
            },
            then: (resolve: (v: { count: number | null; error: null }) => void) => {
              if (opts?.head) {
                const matched = rows.filter(
                  (r) => (!filters.feature || r.feature === filters.feature) && (!filters.ip || r.ip_address === filters.ip) && (!filters.since || r.created_at >= filters.since)
                );
                resolve({ count: matched.length, error: null });
              }
            },
          };
          return builder;
        },
        insert: (row: { feature: string; ip_address: string }) => {
          rows.push({ id: String(nextId++), feature: row.feature, ip_address: row.ip_address, created_at: new Date().toISOString() });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const supabaseAdminMockRef: { current: ReturnType<typeof createSupabaseAdminMock> | null } = { current: null };
vi.mock("@/lib/supabase/admin", () => ({
  get supabaseAdmin() {
    return supabaseAdminMockRef.current;
  },
}));

let rows: MockRow[] = [];

beforeEach(() => {
  rows = [];
  supabaseAdminMockRef.current = createSupabaseAdminMock(rows);
});

describe("checkAndRecordAnonymousUsage", () => {
  it("allows a request under the limit and records it", async () => {
    const { checkAndRecordAnonymousUsage } = await import("./anonymous-ai-rate-limiter");

    const result = await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");

    expect(result).toEqual({ allowed: true, usedToday: 1, limit: 3 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: "resume_analyze", ip_address: "1.2.3.4" });
  });

  it("rejects once the daily limit for that feature/IP is reached", async () => {
    const { checkAndRecordAnonymousUsage } = await import("./anonymous-ai-rate-limiter");

    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    const fourth = await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");

    expect(fourth.allowed).toBe(false);
    expect(fourth.usedToday).toBe(3);
    expect(fourth.limit).toBe(3);
    // A rejected attempt is NOT additionally recorded — the count stays
    // at the limit, not beyond it.
    expect(rows).toHaveLength(3);
  });

  it("includes a retryAfterSeconds estimate on rejection, based on the oldest request in the window", async () => {
    const { checkAndRecordAnonymousUsage } = await import("./anonymous-ai-rate-limiter");

    for (let i = 0; i < 3; i++) {
      await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    }
    const rejected = await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");

    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("tracks each feature independently for the same IP — exhausting resume_analyze does not affect ai_chat", async () => {
    const { checkAndRecordAnonymousUsage } = await import("./anonymous-ai-rate-limiter");

    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    const resumeFourth = await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    const chatFirst = await checkAndRecordAnonymousUsage("ai_chat", "1.2.3.4");

    expect(resumeFourth.allowed).toBe(false);
    expect(chatFirst.allowed).toBe(true);
  });

  it("tracks each IP independently for the same feature", async () => {
    const { checkAndRecordAnonymousUsage } = await import("./anonymous-ai-rate-limiter");

    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    const sameIpFourth = await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");
    const differentIp = await checkAndRecordAnonymousUsage("resume_analyze", "5.6.7.8");

    expect(sameIpFourth.allowed).toBe(false);
    expect(differentIp.allowed).toBe(true);
  });

  it("fails CLOSED (throws) on a genuine transient DB error — never silently allows unlimited requests during a real outage", async () => {
    supabaseAdminMockRef.current = {
      from: () => ({
        select: () => ({
          eq: function (this: unknown) {
            return this;
          },
          gte: function (this: unknown) {
            return this;
          },
          then: (resolve: (v: { count: null; error: { message: string } }) => void) => resolve({ count: null, error: { message: "connection refused" } }),
        }),
      }),
    } as unknown as ReturnType<typeof createSupabaseAdminMock>;

    const { checkAndRecordAnonymousUsage } = await import("./anonymous-ai-rate-limiter");

    await expect(checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4")).rejects.toThrow(/rate limit check failed/i);
  });

  it("fails OPEN specifically when the table doesn't exist yet (migration not applied) — does NOT break anonymous functionality before the operator has run it", async () => {
    supabaseAdminMockRef.current = {
      from: () => ({
        select: () => ({
          eq: function (this: unknown) {
            return this;
          },
          gte: function (this: unknown) {
            return this;
          },
          then: (resolve: (v: { count: null; error: { code: string; message: string } }) => void) =>
            resolve({ count: null, error: { code: "PGRST205", message: "Could not find the table 'public.anonymous_ai_requests' in the schema cache" } }),
        }),
      }),
    } as unknown as ReturnType<typeof createSupabaseAdminMock>;

    const { checkAndRecordAnonymousUsage } = await import("./anonymous-ai-rate-limiter");

    const result = await checkAndRecordAnonymousUsage("resume_analyze", "1.2.3.4");

    expect(result.allowed).toBe(true);
  });

  // Section 10 — concurrency. Proves, at the application-logic level,
  // that this check-then-insert implementation is NOT atomic: if two
  // "simultaneous" calls both read the count BEFORE either has written
  // its own row (the real race window under true concurrency), both
  // will independently observe "under the limit" and both will be
  // allowed — even though only one unit of real allowance was intended.
  // This is a genuine, demonstrated limitation, not a claim of atomic
  // enforcement. It mirrors the exact same, already-accepted tradeoff in
  // the pre-existing job-match rate limiter this module's pattern is
  // ported from. Judged acceptable for THIS specific protection because
  // the actual worst case is bounded (at most a handful of extra
  // requests per race window, not unlimited) and the realistic anonymous
  // traffic pattern this guards against — a script hammering the
  // endpoint — will still be capped by the window on every subsequent
  // request once any row exists.
  it("documents (does not claim to prevent) a lost-update race: two concurrent calls reading remaining=1 can both be allowed", async () => {
    // Two rows already exist against a limit of 3 — one slot "remaining".
    rows.push(
      { id: "1", feature: "resume_analyze", ip_address: "9.9.9.9", created_at: new Date().toISOString() },
      { id: "2", feature: "resume_analyze", ip_address: "9.9.9.9", created_at: new Date().toISOString() }
    );

    const { checkAndRecordAnonymousUsage } = await import("./anonymous-ai-rate-limiter");

    // Simulate true concurrency: both calls' count-reads happen against
    // the SAME pre-write snapshot (rows has 2 entries for both), by
    // invoking them via Promise.all rather than sequentially awaiting
    // the first before starting the second.
    const [first, second] = await Promise.all([
      checkAndRecordAnonymousUsage("resume_analyze", "9.9.9.9"),
      checkAndRecordAnonymousUsage("resume_analyze", "9.9.9.9"),
    ]);

    // Demonstrated limitation: with this in-memory mock (which, like a
    // real un-constrained Postgres table, has no synchronization between
    // the two calls' read-then-write), both observe usedToday=2 (< limit
    // 3) and both proceed to insert — landing at 4 total rows against a
    // limit of 3, one over. This is the honest, demonstrated behavior of
    // a plain check-then-insert with no DB-level constraint — not a
    // claim that it's fine, just proof of what it actually does.
    const bothAllowed = first.allowed && second.allowed;
    expect(bothAllowed).toBe(true);
    expect(rows.filter((r) => r.ip_address === "9.9.9.9")).toHaveLength(4);
  });
});

describe("getClientIp", () => {
  it("returns the first entry of X-Forwarded-For", async () => {
    const { getClientIp } = await import("./anonymous-ai-rate-limiter");
    const req = new Request("https://example.com", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });

  it("returns 'unknown' when the header is absent", async () => {
    const { getClientIp } = await import("./anonymous-ai-rate-limiter");
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });
});
