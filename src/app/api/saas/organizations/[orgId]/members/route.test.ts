import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 26 Milestone 1 — regression test for a genuine, unauthenticated,
// cross-tenant PII-exposure defect: this GET route previously had NO
// authorization check at all, so any caller who knew or guessed an orgId
// could read another organization's full roster (user ids, real email
// addresses, roles) via getTeamRoster(). Proves the fix: no session ->
// 403 before getTeamRoster() ever runs; session for a DIFFERENT org -> 403
// before getTeamRoster() runs; matching org -> the roster is returned.
const getTenantContextMock = vi.fn();
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: (...args: unknown[]) => getTenantContextMock(...args),
}));

const getTeamRosterMock = vi.fn();
vi.mock("@/lib/saas/team-service", () => ({
  getTeamRoster: (...args: unknown[]) => getTeamRosterMock(...args),
}));

import { GET } from "./route";

const fakeParams = { params: Promise.resolve({ orgId: "org-1" }) };

beforeEach(() => {
  getTenantContextMock.mockReset();
  getTeamRosterMock.mockReset();
});

describe("GET /api/saas/organizations/[orgId]/members", () => {
  it("PROVES the roster is never fetched for an unauthenticated caller", async () => {
    getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(getTeamRosterMock).not.toHaveBeenCalled();
  });

  it("PROVES the roster is never fetched for a caller whose session belongs to a different organization", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-OTHER", role: "OWNER", permissions: [] });

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(getTeamRosterMock).not.toHaveBeenCalled();
  });

  it("returns the roster for a caller who is a real member of the requested organization", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-1", role: "OWNER", permissions: [] });
    getTeamRosterMock.mockResolvedValue([{ user_id: "u1", email: "u1@example.com" }]);

    const response = await GET(new Request("https://example.com"), fakeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getTeamRosterMock).toHaveBeenCalledWith("org-1");
    expect(body).toEqual([{ user_id: "u1", email: "u1@example.com" }]);
  });
});
