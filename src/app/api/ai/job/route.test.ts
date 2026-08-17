import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 18 Milestone 5, Step 13 — the first route-handler test in this
// repo (see vitest.config.mts's own header comment for why the "@"
// alias exists now). Mocks entitlement-service.ts's real client-
// construction imports (persona-service -> supabase-server, and
// supabase/admin, which constructs a real Supabase client at MODULE
// TOP LEVEL and throws immediately without real env vars) rather than
// importActual-ing them — same reasoning persona-service.test.ts's own
// header comment gives for mocking supabase-server.ts. FakeQuotaExceededError
// below is deliberately the SAME class entitlement-response.ts's
// instanceof check will see, since both this test and route.ts resolve
// "@/lib/billing/entitlement-service" to this one mocked module.
const requireQuotaMock = vi.fn();
const recordUsageMock = vi.fn();
const { FakeQuotaExceededError, FakeFeatureNotEntitledError } = vi.hoisted(() => ({
  FakeQuotaExceededError: class extends Error {
    metric: string;
    limit: number;
    used: number;
    period: string;
    constructor(metric: string, limit: number, used: number, period: string) {
      super(`${period} limit reached for ${metric} (${used}/${limit} used).`);
      this.name = "QuotaExceededError";
      this.metric = metric;
      this.limit = limit;
      this.used = used;
      this.period = period;
    }
  },
  FakeFeatureNotEntitledError: class extends Error {
    featureId: string;
    constructor(featureId: string) {
      super(`"${featureId}" isn't included in your current plan.`);
      this.name = "FeatureNotEntitledError";
      this.featureId = featureId;
    }
  },
}));

vi.mock("@/lib/billing/entitlement-service", () => ({
  requireQuota: (...args: unknown[]) => requireQuotaMock(...args),
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
  QuotaExceededError: FakeQuotaExceededError,
  FeatureNotEntitledError: FakeFeatureNotEntitledError,
}));

vi.mock("@/lib/billing/persona-service", () => ({
  getOptionalUserId: (...args: unknown[]) => getOptionalUserIdMock(...args),
  PlatformUnauthorizedError: class extends Error {},
}));
const getOptionalUserIdMock = vi.fn();

const parseFileMock = vi.fn();
vi.mock("@/lib/ai/job/job-service", () => ({
  jobService: { parseFile: (...args: unknown[]) => parseFileMock(...args) },
}));

vi.mock("@/lib/ai/ingestion/document-loader", () => ({
  fromWebFile: vi.fn(async () => ({ filename: "jd.txt", buffer: Buffer.from("x"), mimeType: "text/plain" })),
}));

import { POST } from "./route";

function fakeRequest(): Request {
  const formData = new FormData();
  formData.set("file", new File(["job description text"], "jd.txt", { type: "text/plain" }));
  return new Request("https://example.com/api/ai/job", { method: "POST", body: formData });
}

beforeEach(() => {
  requireQuotaMock.mockReset();
  recordUsageMock.mockReset();
  getOptionalUserIdMock.mockReset();
  parseFileMock.mockReset();
});

describe("POST /api/ai/job — job.analyzer quota enforcement", () => {
  it("never calls jobService.parseFile (the LLM-backed operation) when the caller is anonymous — quota simply isn't checked, existing behavior unchanged", async () => {
    getOptionalUserIdMock.mockResolvedValue(null);
    parseFileMock.mockResolvedValue({ jobId: "j1", filename: "jd.txt", processingTimeMs: 10, jobDescription: {} });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(requireQuotaMock).not.toHaveBeenCalled();
    expect(parseFileMock).toHaveBeenCalledTimes(1);
  });

  it("checks quota for a signed-in user and calls parseFile when allowed", async () => {
    getOptionalUserIdMock.mockResolvedValue("u1");
    requireQuotaMock.mockResolvedValue(undefined);
    parseFileMock.mockResolvedValue({ jobId: "j1", filename: "jd.txt", processingTimeMs: 10, jobDescription: {} });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(requireQuotaMock).toHaveBeenCalledWith("u1", "JD_MATCHES");
    expect(parseFileMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith("u1", "JD_MATCHES");
  });

  it("PROVES the LLM-backed parseFile() is never invoked once quota is exhausted — the check happens strictly before the expensive call", async () => {
    getOptionalUserIdMock.mockResolvedValue("u1");
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("JD_MATCHES", 5, 5, "MONTH"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(parseFileMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("does not record usage when the underlying operation itself fails after quota was allowed", async () => {
    getOptionalUserIdMock.mockResolvedValue("u1");
    requireQuotaMock.mockResolvedValue(undefined);
    parseFileMock.mockRejectedValue(new Error("unsupported file format"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(422);
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});
