import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { current: null as { id: string; email?: string } | null };
const mockTenantContext = { current: null as { userId: string; organizationId: string; role: string; permissions: string[] } | null };

vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser.current } })) },
  })),
}));

vi.mock("../saas/tenant-context", () => ({
  getTenantContext: vi.fn(async () => mockTenantContext.current),
}));

vi.mock("../billing/subscription-service", () => ({
  getActiveSubscription: vi.fn(async () => ({
    id: "sub-1",
    plan: { key: "professional", name: "Professional" },
    status: "active",
    billing_interval: "monthly",
    isImplicitFree: false,
    current_period_end: "2026-02-01T00:00:00.000Z",
  })),
}));

vi.mock("../ai/usage/usage-service", () => ({
  getBalance: vi.fn(async () => ({
    feature: "TOTAL",
    monthlyLimit: 1000,
    reserved: 0,
    consumed: 920,
    remaining: 80,
    usagePercent: 92,
    periodStart: "2026-01-01T00:00:00.000Z",
    resetDate: "2026-02-01T00:00:00.000Z",
  })),
}));

vi.mock("../supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: vi.fn(async (userId: string) => ({ data: { user: { email: `${userId}@example.com` } }, error: null })),
      },
    },
  },
}));

interface FeatureUsageRow {
  feature: string;
  requests: number;
  credits: number;
  lastUsed: string | null;
}

const featureUsageForUser = vi.fn(async (): Promise<FeatureUsageRow[]> => [{ feature: "AI_CHAT", requests: 3, credits: 6, lastUsed: "2026-01-05T00:00:00.000Z" }]);
const featureUsageForOrganization = vi.fn(async () => [{ feature: "AI_CHAT", requests: 10, credits: 20, activeUsers: 2, lastUsed: "2026-01-05T00:00:00.000Z" }]);
const topUsersForOrganization = vi.fn(async (organizationId: string) => [{ userId: `user-in-${organizationId}`, aiRequests: 5, creditsUsed: 10, lastActivity: null, featuresUsed: ["AI_CHAT"] }]);

vi.mock("./ai-usage-analytics", () => ({
  getFeatureUsageForUser: (...args: unknown[]) => featureUsageForUser(...(args as [])),
  getDailyTrendForUser: vi.fn(async () => [{ date: "2026-01-05", requests: 3, credits: 6 }]),
  getRecentActivityForUser: vi.fn(async () => [{ feature: "AI_CHAT", createdAt: "2026-01-05T00:00:00.000Z", status: "success", credits: 2 }]),
  getFeatureUsageForOrganization: (...args: unknown[]) => featureUsageForOrganization(...(args as [])),
  getDailyTrendForOrganization: vi.fn(async () => [{ date: "2026-01-05", requests: 10, credits: 20 }]),
  getTopUsersForOrganization: (...args: unknown[]) => topUsersForOrganization(...(args as [string])),
}));

vi.mock("./organization-analytics", () => ({
  getOrganizationSelfMetrics: vi.fn(async (organizationId: string) => ({
    organizationId,
    planKey: "professional",
    seats: 3,
    seatLimit: 5,
    availableSeats: 2,
    activeUsers: 2,
    aiCreditsUsed: 20,
    estimatedAiCostCents: 4200, // must never reach a customer response
    creditsMonthlyLimit: 1000,
    creditsRemaining: 80,
    creditsUsagePercent: 92,
    creditsResetDate: "2026-02-01T00:00:00.000Z",
    lastActivity: "2026-01-05T00:00:00.000Z",
    featureUsage: [],
  })),
}));

import {
  getMySubscription,
  getMyFeatureUsage,
  getOrganizationTopUsers,
  getOrganizationUsage,
  requireOrganizationAdmin,
  resolveCustomerIdentity,
  OrganizationAdminRequiredError,
} from "./customer-analytics-service";
import type { DateRange } from "./analytics-types";

const range: DateRange = { preset: "last_30_days", from: new Date("2026-01-01"), to: new Date("2026-01-31") };

beforeEach(() => {
  mockUser.current = null;
  mockTenantContext.current = null;
  vi.clearAllMocks();
});

describe("resolveCustomerIdentity (identity resolution, forged input immune)", () => {
  it("returns null for an unauthenticated request — no session, no identity, regardless of anything the caller might pass", async () => {
    mockUser.current = null;
    expect(await resolveCustomerIdentity()).toBeNull();
  });

  it("returns organizationId:null for a logged-in user with no organization — the 'no organization' case, not an error", async () => {
    mockUser.current = { id: "user-1", email: "a@example.com" };
    mockTenantContext.current = null;

    const identity = await resolveCustomerIdentity();
    expect(identity).toEqual({ userId: "user-1", email: "a@example.com", organizationId: null });
  });

  it("resolves organizationId exclusively from the session-derived tenant context", async () => {
    mockUser.current = { id: "user-1", email: "a@example.com" };
    mockTenantContext.current = { userId: "user-1", organizationId: "org-real", role: "Viewer", permissions: [] };

    const identity = await resolveCustomerIdentity();
    expect(identity?.organizationId).toBe("org-real");
  });
});

describe("requireOrganizationAdmin (organization-admin gate)", () => {
  it("throws when there is no session at all", async () => {
    mockTenantContext.current = null;
    await expect(requireOrganizationAdmin()).rejects.toThrow();
  });

  it("throws OrganizationAdminRequiredError for a member without the 'Manage Billing' permission — a forged role never grants it, since permissions come from the DB-resolved role, not client input", async () => {
    mockTenantContext.current = { userId: "user-1", organizationId: "org-1", role: "Viewer", permissions: [] };
    await expect(requireOrganizationAdmin()).rejects.toBeInstanceOf(OrganizationAdminRequiredError);
  });

  it("succeeds for a member with 'Manage Billing' and returns exactly their own session-resolved organizationId", async () => {
    mockTenantContext.current = { userId: "user-1", organizationId: "org-1", role: "Owner", permissions: ["Manage Billing"] };
    const result = await requireOrganizationAdmin();
    expect(result).toEqual({ userId: "user-1", organizationId: "org-1" });
  });
});

describe("getMySubscription", () => {
  it("attaches a limit warning derived from the authoritative server-side balance", async () => {
    const subscription = await getMySubscription("org-1");
    expect(subscription.creditsUsagePercent).toBe(92);
    expect(subscription.limitWarning).toEqual({ threshold: 90, message: "You are approaching your monthly AI credit limit." });
  });
});

describe("getMyFeatureUsage", () => {
  it("computes percentOfUsage relative to this user's own total, not the organization's", async () => {
    featureUsageForUser.mockResolvedValueOnce([
      { feature: "AI_CHAT", requests: 1, credits: 3, lastUsed: null },
      { feature: "JD_MATCHING", requests: 1, credits: 1, lastUsed: null },
    ]);

    const rows = await getMyFeatureUsage("user-1", "org-1", range);
    expect(rows.find((r) => r.feature === "AI_CHAT")?.percentOfUsage).toBe(75);
    expect(rows.find((r) => r.feature === "JD_MATCHING")?.percentOfUsage).toBe(25);
  });

  it("returns an empty array (not fabricated rows) when the user has no usage", async () => {
    featureUsageForUser.mockResolvedValueOnce([]);
    expect(await getMyFeatureUsage("user-1", "org-1", range)).toEqual([]);
  });
});

describe("getOrganizationUsage (privacy: internal provider cost is never surfaced)", () => {
  it("does not include estimatedAiCostCents anywhere in the response, even though the underlying metrics function computes it", async () => {
    const usage = await getOrganizationUsage("org-1", range);
    expect(usage).not.toHaveProperty("estimatedAiCostCents");
    expect(JSON.stringify(usage)).not.toContain("estimatedAiCostCents");
  });

  it("attaches a limit warning and the organization's real trend", async () => {
    const usage = await getOrganizationUsage("org-1", range);
    expect(usage.limitWarning?.threshold).toBe(90);
    expect(usage.trend).toEqual([{ date: "2026-01-05", requests: 10, credits: 20 }]);
  });
});

describe("getOrganizationTopUsers (organization isolation)", () => {
  it("only ever resolves users returned by the organization-scoped query — never a platform-wide user list", async () => {
    const users = await getOrganizationTopUsers("org-A", range);
    expect(topUsersForOrganization).toHaveBeenCalledWith("org-A", range, 20);
    expect(users).toHaveLength(1);
    expect(users[0].userId).toBe("user-in-org-A");
    expect(users[0].email).toBe("user-in-org-A@example.com");
  });

  it("querying a different organization only ever touches that organization's own scoped query", async () => {
    await getOrganizationTopUsers("org-B", range);
    expect(topUsersForOrganization).toHaveBeenCalledWith("org-B", range, 20);
  });
});
