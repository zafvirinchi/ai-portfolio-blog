import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 26 Org/Workspace Auth Closure — regression test for a genuine
// defect: GET had NO authorization check at all, unlike PATCH in this
// same file. Proves listRoles() is never called for an unauthenticated
// caller or one whose session belongs to a different org.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

const getTenantContextMock = vi.fn();
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: (...args: unknown[]) => getTenantContextMock(...args),
}));

const listRolesMock = vi.fn();
vi.mock("@/lib/saas/permission-service", () => ({
  listRoles: (...args: unknown[]) => listRolesMock(...args),
  requirePermission: vi.fn(),
  updateRolePermissions: vi.fn(),
}));

import { GET } from "./route";

const fakeParams = { params: Promise.resolve({ orgId: "org-1" }) };

beforeEach(() => {
  getTenantContextMock.mockReset();
  listRolesMock.mockReset();
});

describe("GET /api/saas/organizations/[orgId]/roles", () => {
  it("PROVES roles are never fetched for an unauthenticated caller", async () => {
    getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(listRolesMock).not.toHaveBeenCalled();
  });

  it("PROVES roles are never fetched for a caller from a different organization", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-OTHER", role: "Owner", permissions: [] });

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(listRolesMock).not.toHaveBeenCalled();
  });

  it("returns roles for a real member", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-1", role: "Owner", permissions: [] });
    listRolesMock.mockResolvedValue([{ id: "r1", organization_id: "org-1", role_key: "Owner", permissions: [] }]);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(200);
    expect(listRolesMock).toHaveBeenCalledWith("org-1");
  });
});
