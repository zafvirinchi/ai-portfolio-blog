// Thin delegation to Milestone 1's Organization Module — RBAC continues
// to be sourced entirely from organization_roles/organization_members
// (protected, DO NOT MODIFY). No duplicate role/permission system is
// introduced here; this file exists only to give the auth package a
// same-shaped entry point per the spec's file list.

export { getTenantContext, listMyOrganizations, verifyMembership } from "../saas/tenant-context";
export { hasPermission, contextHasPermission, requirePermission, listRoles } from "../saas/permission-service";
export type { TenantContext, Organization, OrganizationMember } from "../saas/organization-types";
export type { MemberRole, Permission } from "../saas/organization-schema";
export { MEMBER_ROLES, PERMISSIONS } from "../saas/organization-schema";
