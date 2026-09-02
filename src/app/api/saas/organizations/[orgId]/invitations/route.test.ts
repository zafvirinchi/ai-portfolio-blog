import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 26 Org/Workspace Auth Closure — regression test for the most
// severe defect this closure audit found: GET had NO authorization check
// at all, unlike POST in this same file. OrganizationInvitation includes
// the raw `token` field — the bearer secret
// /api/saas/invitations/[token]/accept accepts from ANY authenticated
// user with no email-match check — so this was a complete, unauthenticated
// organization-infiltration chain: harvest a token via this GET, then
// accept it as anyone. Proves listInvitations() (and therefore every
// token/email it would return) is never called for an unauthenticated
// caller or one whose session belongs to a different org.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

const getTenantContextMock = vi.fn();
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: (...args: unknown[]) => getTenantContextMock(...args),
}));

const listInvitationsMock = vi.fn();
const inviteMock = vi.fn();
vi.mock("@/lib/saas/membership-service", () => ({
  membershipService: {
    listInvitations: (...args: unknown[]) => listInvitationsMock(...args),
    invite: (...args: unknown[]) => inviteMock(...args),
  },
}));

vi.mock("@/lib/saas/permission-service", () => ({
  requirePermission: vi.fn(),
}));

import { GET } from "./route";

const fakeParams = { params: Promise.resolve({ orgId: "org-1" }) };

beforeEach(() => {
  getTenantContextMock.mockReset();
  listInvitationsMock.mockReset();
});

describe("GET /api/saas/organizations/[orgId]/invitations", () => {
  it("PROVES pending invitation tokens/emails are never fetched for an unauthenticated caller", async () => {
    getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(listInvitationsMock).not.toHaveBeenCalled();
  });

  it("PROVES pending invitation tokens/emails are never fetched for a caller from a different organization", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-OTHER", role: "Owner", permissions: [] });

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(403);
    expect(listInvitationsMock).not.toHaveBeenCalled();
  });

  it("returns invitations for a real member of the organization", async () => {
    getTenantContextMock.mockResolvedValue({ userId: "u1", email: "u1@example.com", organizationId: "org-1", role: "Owner", permissions: [] });
    listInvitationsMock.mockResolvedValue([{ id: "inv-1", organization_id: "org-1", email: "invitee@example.com", token: "secret-token", status: "pending" }]);

    const response = await GET(new Request("https://example.com"), fakeParams);

    expect(response.status).toBe(200);
    expect(listInvitationsMock).toHaveBeenCalledWith("org-1");
  });
});
