import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 26 Org/Workspace Auth Closure — regression test for a genuine
// defect: GET had NO authorization check at all, unlike PATCH/DELETE in
// this same file. Proves organizationService.get() is never called for an
// unauthenticated caller or one whose session belongs to a different org.
const getTenantContextMock = vi.fn();
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: (...args: unknown[]) => getTenantContextMock(...args),
}));

const getOrganizationMock = vi.fn();
vi.mock("@/lib/saas/organization-service", () => ({
  organizationService: { get: (...args: unknown[]) => getOrganizationMock(...args) },
}));

import { GET } from "./route";

const fakeParams = { params: Promise.resolve({ orgId: "org-1" }) };

beforeEach(() => {
  getTenantContextMock.mockReset();
  getOrganizationMock.mockReset();
});

describe("GET /api/saas/organizations/[orgId]", () => {
  it("PROVES the organization is never fetched for an unauthenticated caller", async () => {
    getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(getOrganizationMock).not.toHaveBeenCalled();
  });

  it("PROVES the organization is never fetched for a caller from a different organization", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-OTHER", role: "Owner", permissions: [] });

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(getOrganizationMock).not.toHaveBeenCalled();
  });

  it("returns the organization for a real member", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-1", role: "Owner", permissions: [] });
    getOrganizationMock.mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme", status: "active", owner_id: "u1" });

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(200);
    expect(getOrganizationMock).toHaveBeenCalledWith("org-1");
  });
});
