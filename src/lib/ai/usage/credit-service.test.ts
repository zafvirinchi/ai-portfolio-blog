import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("../../supabase/admin", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => maybeSingleMock(),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("../../billing/subscription-service", () => ({
  getActiveSubscription: vi.fn(async () => ({ plan: { key: "free" }, isImplicitFree: false })),
}));

import { reserve, commit, release, getBalance } from "./credit-service";
import { InsufficientAiCreditsError, UsageReservationError } from "./usage-errors";

// free plan's MONTHLY_CREDIT_ALLOWANCE is 500 (usage-policy.ts) — asserted
// indirectly through getBalance()'s monthlyLimit below.

beforeEach(() => {
  rpcMock.mockReset();
  maybeSingleMock.mockReset();
});

describe("reserve", () => {
  it("returns the updated pool state when the RPC allows the reservation", async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: true, reserved: 10, consumed: 0, monthly_limit: 500 }], error: null });

    const result = await reserve("org-1", "AI_CHAT", 10);

    expect(result).toEqual({ reserved: 10, consumed: 0, monthlyLimit: 500 });
    expect(rpcMock).toHaveBeenCalledWith(
      "ai_credits_reserve",
      expect.objectContaining({ p_organization_id: "org-1", p_amount: 10, p_monthly_limit: 500 })
    );
  });

  it("throws InsufficientAiCreditsError (never a generic error) when the pool is exhausted", async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: false, reserved: 500, consumed: 0, monthly_limit: 500 }], error: null });

    await expect(reserve("org-1", "RESUME_REWRITE", 10)).rejects.toBeInstanceOf(InsufficientAiCreditsError);
  });

  it("reports currentBalance as the true remaining pool, not the raw row data, on rejection", async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: false, reserved: 480, consumed: 15, monthly_limit: 500 }], error: null });

    try {
      await reserve("org-1", "RESUME_REWRITE", 10);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientAiCreditsError);
      expect((error as InsufficientAiCreditsError).currentBalance).toBe(5);
      expect((error as InsufficientAiCreditsError).requiredCredits).toBe(10);
      expect((error as InsufficientAiCreditsError).upgradeAvailable).toBe(true);
    }
  });

  it("throws UsageReservationError (distinct from InsufficientAiCreditsError) when the RPC itself errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "connection failed" } });

    await expect(reserve("org-1", "AI_CHAT", 10)).rejects.toBeInstanceOf(UsageReservationError);
  });
});

describe("commit and release", () => {
  it("commit never throws when the RPC errors — a logging failure must not break the AI feature it's metering", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(commit("org-1", "AI_CHAT", 10, 7)).resolves.toBeUndefined();
  });

  it("release never throws when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(release("org-1", "AI_CHAT", 10)).resolves.toBeUndefined();
  });

  it("commit passes both the original estimate and the real cost through to the RPC", async () => {
    rpcMock.mockResolvedValue({ data: [{ reserved: 0, consumed: 7 }], error: null });
    await commit("org-1", "AI_CHAT", 10, 7);
    expect(rpcMock).toHaveBeenCalledWith("ai_credits_commit", expect.objectContaining({ p_reserved_amount: 10, p_actual_amount: 7 }));
  });
});

describe("getBalance", () => {
  it("computes remaining and usagePercent from the stored pool row", async () => {
    maybeSingleMock.mockResolvedValue({ data: { reserved: 100, consumed: 150 } });

    const balance = await getBalance("org-1");

    expect(balance.monthlyLimit).toBe(500);
    expect(balance.reserved).toBe(100);
    expect(balance.consumed).toBe(150);
    expect(balance.remaining).toBe(250);
    expect(balance.usagePercent).toBe(50);
  });

  it("treats a missing pool row as a fresh, fully-available balance", async () => {
    maybeSingleMock.mockResolvedValue({ data: null });

    const balance = await getBalance("org-1");

    expect(balance.reserved).toBe(0);
    expect(balance.consumed).toBe(0);
    expect(balance.remaining).toBe(500);
  });
});
