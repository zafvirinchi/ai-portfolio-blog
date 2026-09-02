import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 26 Org/Workspace Auth Closure — regression test for a genuine
// defect: this route checked only that the caller belongs to orgId,
// never that workspaceId actually belongs to orgId. A real member of
// Org A could archive/reactivate Org B's workspace by supplying Org A's
// orgId (to pass the tenant check) alongside a known/guessed Org B
// workspaceId.
const getTenantContextMock = vi.fn();
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: (...args: unknown[]) => getTenantContextMock(...args),
}));

const getWorkspaceMock = vi.fn();
const archiveMock = vi.fn();
const reactivateMock = vi.fn();
vi.mock("@/lib/saas/workspace-service", () => ({
  workspaceService: {
    get: (...args: unknown[]) => getWorkspaceMock(...args),
    archive: (...args: unknown[]) => archiveMock(...args),
    reactivate: (...args: unknown[]) => reactivateMock(...args),
  },
}));

import { POST } from "./route";

const fakeParams = { params: Promise.resolve({ orgId: "org-1", workspaceId: "ws-1" }) };
const memberContext = { userId: "u1", email: "u1@example.com", organizationId: "org-1", role: "Owner", permissions: [] };
const wsInOrg1 = { id: "ws-1", organization_id: "org-1", name: "Engineering" };
const wsInOrgOther = { id: "ws-1", organization_id: "org-OTHER", name: "Someone Else's Workspace" };

function postRequest(body: unknown = {}) {
  return new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  getTenantContextMock.mockReset();
  getWorkspaceMock.mockReset();
  archiveMock.mockReset();
  reactivateMock.mockReset();
});

describe("POST /api/saas/organizations/[orgId]/workspaces/[workspaceId]/archive", () => {
  it("PROVES a real member of org-1 cannot archive a workspace that actually belongs to a different organization", async () => {
    getTenantContextMock.mockResolvedValue(memberContext);
    getWorkspaceMock.mockResolvedValue(wsInOrgOther);

    const response = await POST(postRequest(), fakeParams);

    expect(response.status).toBe(404);
    expect(archiveMock).not.toHaveBeenCalled();
    expect(reactivateMock).not.toHaveBeenCalled();
  });

  it("allows archiving a workspace that really belongs to the caller's org", async () => {
    getTenantContextMock.mockResolvedValue(memberContext);
    getWorkspaceMock.mockResolvedValue(wsInOrg1);
    archiveMock.mockResolvedValue({ ...wsInOrg1, status: "archived" });

    const response = await POST(postRequest(), fakeParams);

    expect(response.status).toBe(200);
    expect(archiveMock).toHaveBeenCalledWith("ws-1", expect.anything());
  });
});
