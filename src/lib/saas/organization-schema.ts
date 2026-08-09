import { z } from "zod";

// Phase 14 Milestone 1. Snake_case kept verbatim throughout (matching
// this repo's existing src/types/*.ts row-type convention) rather than
// a camelCase mapping layer.

export const ORG_STATUSES = ["active", "suspended", "deleted"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const MEMBER_ROLES = [
  "Owner",
  "Admin",
  "Recruiter",
  "Hiring Manager",
  "HR",
  "Interviewer",
  "Candidate",
  "Viewer",
] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PERMISSIONS = [
  "Manage Users",
  "Manage Billing",
  "Manage Candidates",
  "Manage Jobs",
  "Manage Interviews",
  "Manage Knowledge",
  "Manage Resume Analysis",
  "Manage AI Credits",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const INVITATION_STATUSES = ["pending", "accepted", "rejected", "revoked", "expired"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const WORKSPACE_STATUSES = ["active", "archived"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ["active", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

// The spec's 8 tracked feature-usage event types.
export const ACTIVITY_TYPES = [
  "Resume Uploaded",
  "Candidate Added",
  "Job Created",
  "Knowledge Uploaded",
  "Interview Scheduled",
  "Cover Letter Generated",
  "LinkedIn Optimized",
  "Resume Rewritten",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// Design decision 3 — seeded into each org's own organization_roles rows
// at creation time (organization-service.ts), then independently
// editable per-org thereafter. permission-service.ts's actual runtime
// enforcement reads the DB table, never this constant directly.
export const DEFAULT_ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
  Owner: [...PERMISSIONS],
  Admin: [...PERMISSIONS],
  Recruiter: ["Manage Candidates", "Manage Jobs", "Manage Interviews", "Manage Resume Analysis"],
  "Hiring Manager": ["Manage Candidates", "Manage Jobs", "Manage Interviews"],
  HR: ["Manage Candidates", "Manage Interviews"],
  Interviewer: ["Manage Interviews"],
  Candidate: [],
  Viewer: [],
};

// ---------------------------------------------------------------------------
// API request-body validation schemas.
// ---------------------------------------------------------------------------

export const organizationCreateSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens only"),
});

export const organizationUpdateSchema = z.object({
  name: z.string().min(1),
});

export const workspaceCreateSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().nullable().optional(),
});

export const workspaceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role_key: z.enum(MEMBER_ROLES).default("Viewer"),
});

export const updateMemberRoleSchema = z.object({
  role_key: z.enum(MEMBER_ROLES),
});

export const updateRolePermissionsSchema = z.object({
  role_key: z.enum(MEMBER_ROLES),
  permissions: z.array(z.enum(PERMISSIONS)),
});
