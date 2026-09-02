import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 26 Org/Workspace Auth Closure — regression tests for two genuine
// defects:
// 1. GET had NO authorization check at all, unlike PATCH/DELETE.
// 2. None of GET/PATCH/DELETE verified workspaceId actually belongs to
//    orgId — workspaceService.update()/delete() (workspace-service.ts)
//    filter ONLY by workspace_id, trusting their caller entirely. A real
//    member of Org A could rename/delete Org B's workspace by supplying
//    Org A's orgId (to pass the tenant check) alongside a known/guessed
//    Org B workspaceId.
const getTenantContextMock = vi.fn();
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: (...args: unknown[]) => getTenantContextMock(...args),
}));

const getWorkspaceMock = vi.fn();
const updateWorkspaceMock = vi.fn();
const deleteWorkspaceMock = vi.fn();
vi.mock("@/lib/saas/workspace-service", () => ({
  workspaceService: {
    get: (...args: unknown[]) => getWorkspaceMock(...args),
    update: (...args: unknown[]) => updateWorkspaceMock(...args),
    delete: (...args: unknown[]) => deleteWorkspaceMock(...args),
  },
}));

import { DELETE, GET, PATCH } from "./route";

const fakeParams = { params: Promise.resolve({ orgId: "org-1", workspaceId: "ws-1" }) };
const memberContext = { userId: "u1", email: "u1@example.com", organizationId: "org-1", role: "Owner", permissions: [] };
const wsInOrg1 = { id: "ws-1", organization_id: "org-1", name: "Engineering" };
const wsInOrgOther = { id: "ws-1", organization_id: "org-OTHER", name: "Someone Else's Workspace" };

function patchRequest(body: unknown) {
  return new Request("https://example.com", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  getTenantContextMock.mockReset();
  getWorkspaceMock.mockReset();
  updateWorkspaceMock.mockReset();
  deleteWorkspaceMock.mockReset();
});

describe("GET /api/saas/organizations/[orgId]/workspaces/[workspaceId]", () => {
  it("PROVES the workspace is never fetched for an unauthenticated caller", async () => {
    getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(getWorkspaceMock).not.toHaveBeenCalled();
  });

  it("PROVES a real member of org-1 cannot read a workspace that actually belongs to a different organization", async () => {
    getTenantContextMock.mockResolvedValue(memberContext);
    getWorkspaceMock.mockResolvedValue(wsInOrgOther);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(404);
  });

  it("returns the workspace for a real member whose workspace matches", async () => {
    getTenantContextMock.mockResolvedValue(memberContext);
    getWorkspaceMock.mockResolvedValue(wsInOrg1);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/saas/organizations/[orgId]/workspaces/[workspaceId]", () => {
  it("PROVES a real member of org-1 cannot rename a workspace that actually belongs to a different organization", async () => {
    getTenantContextMock.mockResolvedValue(memberContext);
    getWorkspaceMock.mockResolvedValue(wsInOrgOther);

    const response = await PATCH(patchRequest({ name: "Hijacked" }), fakeParams);

    expect(response.status).toBe(404);
    expect(updateWorkspaceMock).not.toHaveBeenCalled();
  });

  it("allows renaming a workspace that really belongs to the caller's org", async () => {
    getTenantContextMock.mockResolvedValue(memberContext);
    getWorkspaceMock.mockResolvedValue(wsInOrg1);
    updateWorkspaceMock.mockResolvedValue({ ...wsInOrg1, name: "Renamed" });

    const response = await PATCH(patchRequest({ name: "Renamed" }), fakeParams);

    expect(response.status).toBe(200);
    expect(updateWorkspaceMock).toHaveBeenCalledWith("ws-1", { name: "Renamed" }, expect.anything());
  });
});

describe("DELETE /api/saas/organizations/[orgId]/workspaces/[workspaceId]", () => {
  it("PROVES a real member of org-1 cannot delete a workspace that actually belongs to a different organization", async () => {
    getTenantContextMock.mockResolvedValue(memberContext);
    getWorkspaceMock.mockResolvedValue(wsInOrgOther);

    const response = await DELETE(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(404);
    expect(deleteWorkspaceMock).not.toHaveBeenCalled();
  });

  it("allows deleting a workspace that really belongs to the caller's org", async () => {
    getTenantContextMock.mockResolvedValue(memberContext);
    getWorkspaceMock.mockResolvedValue(wsInOrg1);

    const response = await DELETE(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(200);
    expect(deleteWorkspaceMock).toHaveBeenCalledWith("ws-1", expect.anything());
  });
});
