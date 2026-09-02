import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 26 Milestone 1 + Org/Workspace Auth Closure — regression tests for
// three genuine defects:
// 1. GET had NO authorization check at all (unauthenticated cross-tenant
//    workspace-membership exposure).
// 2. POST/DELETE checked only organization membership, never a
//    permission — any member of an org, regardless of role, could add or
//    remove any other member of any workspace in that org (privilege
//    escalation), unlike the identical action at the organization level.
// 3. (Closure audit) None of GET/POST/DELETE verified workspaceId actually
//    belongs to orgId — membershipService trusts workspaceId alone, so a
//    real member of Org A could view/add/remove members of Org B's
//    workspace by supplying Org A's orgId (to pass check #1) alongside a
//    known/guessed Org B workspaceId.
// permission-service.ts (real, unmocked below — its own contextHasPermission()
// is pure and worth exercising for real) imports supabaseAdmin, which
// constructs a real client at import time — mocked per this repo's
// established test pattern.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

const getTenantContextMock = vi.fn();
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: (...args: unknown[]) => getTenantContextMock(...args),
}));

const getWorkspaceMock = vi.fn();
vi.mock("@/lib/saas/workspace-service", () => ({
  workspaceService: { get: (...args: unknown[]) => getWorkspaceMock(...args) },
}));

const listWorkspaceMembersMock = vi.fn();
const addToWorkspaceMock = vi.fn();
const removeFromWorkspaceMock = vi.fn();
vi.mock("@/lib/saas/membership-service", () => ({
  membershipService: {
    listWorkspaceMembers: (...args: unknown[]) => listWorkspaceMembersMock(...args),
    addToWorkspace: (...args: unknown[]) => addToWorkspaceMock(...args),
    removeFromWorkspace: (...args: unknown[]) => removeFromWorkspaceMock(...args),
  },
}));

import { DELETE, GET, POST } from "./route";

const fakeParams = { params: Promise.resolve({ orgId: "org-1", workspaceId: "ws-1" }) };

function memberContext(overrides: Partial<{ userId: string; organizationId: string; permissions: string[] }> = {}) {
  return { userId: "u1", email: "u1@example.com", organizationId: "org-1", role: "HR", permissions: [], ...overrides };
}

function postRequest(body: unknown) {
  return new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function deleteRequest(userId: string) {
  return new Request(`https://example.com?userId=${userId}`, { method: "DELETE" });
}

const wsInOrg1 = { id: "ws-1", organization_id: "org-1", name: "Engineering" };
const wsInOrgOther = { id: "ws-1", organization_id: "org-OTHER", name: "Someone Else's Workspace" };

beforeEach(() => {
  getTenantContextMock.mockReset();
  getWorkspaceMock.mockReset();
  listWorkspaceMembersMock.mockReset();
  addToWorkspaceMock.mockReset();
  removeFromWorkspaceMock.mockReset();
});

describe("GET /api/saas/organizations/[orgId]/workspaces/[workspaceId]/members", () => {
  it("PROVES workspace membership is never fetched for an unauthenticated caller", async () => {
    getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(listWorkspaceMembersMock).not.toHaveBeenCalled();
  });

  it("PROVES workspace membership is never fetched for a caller from a different organization", async () => {
    getTenantContextMock.mockResolvedValue(memberContext({ organizationId: "org-OTHER" }));

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(listWorkspaceMembersMock).not.toHaveBeenCalled();
  });

  it("PROVES a real member of org-1 cannot read a workspace that actually belongs to a different organization", async () => {
    getTenantContextMock.mockResolvedValue(memberContext());
    getWorkspaceMock.mockResolvedValue(wsInOrgOther);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(404);
    expect(listWorkspaceMembersMock).not.toHaveBeenCalled();
  });

  it("returns workspace membership for a real member of the organization whose workspace matches", async () => {
    getTenantContextMock.mockResolvedValue(memberContext());
    getWorkspaceMock.mockResolvedValue(wsInOrg1);
    listWorkspaceMembersMock.mockResolvedValue([{ user_id: "u1", role_key: "HR" }]);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(200);
    expect(listWorkspaceMembersMock).toHaveBeenCalledWith("ws-1");
  });
});

describe("POST /api/saas/organizations/[orgId]/workspaces/[workspaceId]/members", () => {
  it("PROVES a plain member with no 'Manage Users' permission cannot add another user to the workspace", async () => {
    getTenantContextMock.mockResolvedValue(memberContext({ permissions: [] }));

    const response = await POST(postRequest({ userId: "victim", role_key: "HR" }), fakeParams);

    expect(response.status).not.toBe(200);
    expect(addToWorkspaceMock).not.toHaveBeenCalled();
  });

  it("PROVES a manager in org-1 cannot add a member to a workspace that actually belongs to a different organization", async () => {
    getTenantContextMock.mockResolvedValue(memberContext({ permissions: ["Manage Users"] }));
    getWorkspaceMock.mockResolvedValue(wsInOrgOther);

    const response = await POST(postRequest({ userId: "victim", role_key: "HR" }), fakeParams);

    expect(response.status).toBe(404);
    expect(addToWorkspaceMock).not.toHaveBeenCalled();
  });

  it("allows a member with 'Manage Users' permission to add another user to a workspace that really belongs to their org", async () => {
    getTenantContextMock.mockResolvedValue(memberContext({ permissions: ["Manage Users"] }));
    getWorkspaceMock.mockResolvedValue(wsInOrg1);
    addToWorkspaceMock.mockResolvedValue({ id: "wm-1", workspace_id: "ws-1", user_id: "new-user", role_key: "HR" });

    const response = await POST(postRequest({ userId: "new-user", role_key: "HR" }), fakeParams);

    expect(response.status).toBe(200);
    expect(addToWorkspaceMock).toHaveBeenCalledWith("ws-1", "new-user", "HR", expect.anything());
  });
});

describe("DELETE /api/saas/organizations/[orgId]/workspaces/[workspaceId]/members", () => {
  it("PROVES a plain member with no 'Manage Users' permission cannot remove a DIFFERENT member from the workspace", async () => {
    getTenantContextMock.mockResolvedValue(memberContext({ userId: "u1", permissions: [] }));
    getWorkspaceMock.mockResolvedValue(wsInOrg1);

    const response = await DELETE(deleteRequest("someone-else"), fakeParams);

    expect(response.status).toBe(403);
    expect(removeFromWorkspaceMock).not.toHaveBeenCalled();
  });

  it("PROVES a manager in org-1 cannot remove a member from a workspace that actually belongs to a different organization", async () => {
    getTenantContextMock.mockResolvedValue(memberContext({ userId: "u1", permissions: ["Manage Users"] }));
    getWorkspaceMock.mockResolvedValue(wsInOrgOther);

    const response = await DELETE(deleteRequest("someone-else"), fakeParams);

    expect(response.status).toBe(404);
    expect(removeFromWorkspaceMock).not.toHaveBeenCalled();
  });

  it("allows a member with no special permission to remove THEMSELVES from a workspace that really belongs to their org", async () => {
    getTenantContextMock.mockResolvedValue(memberContext({ userId: "u1", permissions: [] }));
    getWorkspaceMock.mockResolvedValue(wsInOrg1);

    const response = await DELETE(deleteRequest("u1"), fakeParams);

    expect(response.status).toBe(200);
    expect(removeFromWorkspaceMock).toHaveBeenCalledWith("ws-1", "u1", expect.anything());
  });

  it("allows a member with 'Manage Users' permission to remove someone else from a workspace that really belongs to their org", async () => {
    getTenantContextMock.mockResolvedValue(memberContext({ userId: "u1", permissions: ["Manage Users"] }));
    getWorkspaceMock.mockResolvedValue(wsInOrg1);

    const response = await DELETE(deleteRequest("someone-else"), fakeParams);

    expect(response.status).toBe(200);
    expect(removeFromWorkspaceMock).toHaveBeenCalledWith("ws-1", "someone-else", expect.anything());
  });
});
