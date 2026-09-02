import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 26 Org/Workspace Auth Closure — regression test for a genuine
// defect: GET had NO authorization check at all, unlike POST in this
// same file. Proves workspaceService.list() is never called for an
// unauthenticated caller or one whose session belongs to a different org.
const getTenantContextMock = vi.fn();
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: (...args: unknown[]) => getTenantContextMock(...args),
}));

const listWorkspacesMock = vi.fn();
vi.mock("@/lib/saas/workspace-service", () => ({
  workspaceService: { list: (...args: unknown[]) => listWorkspacesMock(...args) },
}));

import { GET } from "./route";

const fakeParams = { params: Promise.resolve({ orgId: "org-1" }) };

beforeEach(() => {
  getTenantContextMock.mockReset();
  listWorkspacesMock.mockReset();
});

describe("GET /api/saas/organizations/[orgId]/workspaces", () => {
  it("PROVES the workspace list is never fetched for an unauthenticated caller", async () => {
    getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(listWorkspacesMock).not.toHaveBeenCalled();
  });

  it("PROVES the workspace list is never fetched for a caller from a different organization", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-OTHER", role: "Owner", permissions: [] });

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(listWorkspacesMock).not.toHaveBeenCalled();
  });

  it("returns the workspace list for a real member", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-1", role: "Owner", permissions: [] });
    listWorkspacesMock.mockResolvedValue([{ id: "ws-1", organization_id: "org-1", name: "Engineering" }]);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(200);
    expect(listWorkspacesMock).toHaveBeenCalledWith("org-1");
  });
});
