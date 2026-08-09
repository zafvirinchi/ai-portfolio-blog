import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();

vi.mock("../../supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      upsert: (...args: unknown[]) => upsertMock(...args),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => ({ data: [], error: null }) }),
          gte: () => ({ order: () => ({ data: [], error: null }) }),
        }),
      }),
    }),
  },
}));

const creditReserveMock = vi.fn();
const creditCommitMock = vi.fn();
const creditReleaseMock = vi.fn();

vi.mock("./credit-service", () => ({
  reserve: (...args: unknown[]) => creditReserveMock(...args),
  commit: (...args: unknown[]) => creditCommitMock(...args),
  release: (...args: unknown[]) => creditReleaseMock(...args),
  getBalance: vi.fn(async () => ({ feature: "TOTAL", monthlyLimit: 500, reserved: 0, consumed: 0, remaining: 500, usagePercent: 0, periodStart: "", resetDate: "" })),
}));

import { reserve, commit, release, record } from "./usage-service";
import type { UsageContext } from "./usage-types";

const baseContext: UsageContext = {
  userId: "user-1",
  organizationId: "org-1",
  subscriptionId: null,
  feature: "AI_CHAT",
  operation: "LLM_CALL",
  requestId: "req-1",
};

beforeEach(() => {
  upsertMock.mockReset().mockResolvedValue({ data: null, error: null });
  creditReserveMock.mockReset().mockResolvedValue({ reserved: 1, consumed: 0, monthlyLimit: 500 });
  creditCommitMock.mockReset().mockResolvedValue(undefined);
  creditReleaseMock.mockReset().mockResolvedValue(undefined);
});

describe("reserve", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.AI_USAGE_ENFORCEMENT;

  afterEach(() => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = originalNodeEnv;
    process.env.AI_USAGE_ENFORCEMENT = originalFlag;
  });

  it("is a pure no-op (zero-cost handle, no pool mutation) when there is no organization", async () => {
    const handle = await reserve({ ...baseContext, organizationId: null });

    expect(handle).toEqual({ requestId: "req-1", estimatedCredits: 0 });
    expect(creditReserveMock).not.toHaveBeenCalled();
  });

  it("is a pure no-op when enforcement is disabled (dev/local override)", async () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    process.env.AI_USAGE_ENFORCEMENT = "false";

    const handle = await reserve(baseContext);

    expect(handle.estimatedCredits).toBe(0);
    expect(creditReserveMock).not.toHaveBeenCalled();
  });

  it("reserves the feature's estimated cost against the org pool and records a 'reserved' row", async () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    delete process.env.AI_USAGE_ENFORCEMENT;

    const handle = await reserve(baseContext);

    expect(creditReserveMock).toHaveBeenCalledWith("org-1", "AI_CHAT", handle.estimatedCredits);
    expect(upsertMock).toHaveBeenCalledTimes(2); // usage_tracking + credit_transactions
  });
});

describe("commit", () => {
  it("converts the reservation into real consumption via credit-service", async () => {
    await commit(baseContext, { requestId: "req-1", estimatedCredits: 5 }, { credits: 3, inputTokens: 100, outputTokens: 50 });
    expect(creditCommitMock).toHaveBeenCalledWith("org-1", "AI_CHAT", 5, 3);
  });

  it("skips the credit-service call for zero-cost (no-op reservation) handles but still records the row", async () => {
    await commit(baseContext, { requestId: "req-1", estimatedCredits: 0 }, { credits: 0 });
    expect(creditCommitMock).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalled();
  });
});

describe("release", () => {
  it("returns the reservation via credit-service and records a 'released'/failed row", async () => {
    await release(baseContext, { requestId: "req-1", estimatedCredits: 5 }, "PROVIDER_ERROR");
    expect(creditReleaseMock).toHaveBeenCalledWith("org-1", "AI_CHAT", 5);
    expect(upsertMock).toHaveBeenCalled();
  });
});

describe("record (idempotency)", () => {
  it("upserts by request_id on both ledgers so re-processing the same request never double-charges", async () => {
    await record(baseContext, { status: "success", transactionStatus: "committed", estimatedCredits: 5, actualCredits: 3 });

    for (const call of upsertMock.mock.calls) {
      expect(call[1]).toEqual({ onConflict: "request_id" });
      expect((call[0] as { request_id: string }).request_id).toBe("req-1");
    }
  });

  it("never throws even when the underlying write fails", async () => {
    upsertMock.mockRejectedValue(new Error("db down"));
    await expect(record(baseContext, { status: "failed", transactionStatus: "failed", estimatedCredits: 5, actualCredits: 0 })).resolves.toBeUndefined();
  });

  it("is a no-op when there is no organization to attribute usage to", async () => {
    await record({ ...baseContext, organizationId: null }, { status: "success", transactionStatus: "committed", estimatedCredits: 1, actualCredits: 1 });
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
