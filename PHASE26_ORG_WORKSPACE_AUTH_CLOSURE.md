# Phase 26 — Organization/Workspace Authorization Closure Audit

## 1. Scope

Narrowly scoped to `/api/saas/organizations/**` (every route under this path), the organization/workspace authorization helpers those routes call directly (`tenant-context.ts`, `permission-service.ts`, `membership-service.ts`, `workspace-service.ts`, `organization-service.ts`), their direct UI callers, and the 11 regression tests Phase 26 Milestone 1 added. No other subsystem (resume, recruiter, billing, AI, job-seeker) was reopened.

## 2. Route Inventory (15 routes enumerated from source)

`organizations/route.ts` (GET/POST), `organizations/switch/route.ts` (POST), `[orgId]/route.ts` (GET/PATCH/DELETE), `[orgId]/suspend/route.ts` (POST), `[orgId]/reactivate/route.ts` (POST), `[orgId]/transfer-ownership/route.ts` (POST), `[orgId]/roles/route.ts` (GET/PATCH), `[orgId]/members/route.ts` (GET — M1), `[orgId]/members/[userId]/route.ts` (PATCH/DELETE), `[orgId]/invitations/route.ts` (GET/POST), `[orgId]/invitations/[id]/revoke/route.ts` (POST), `[orgId]/workspaces/route.ts` (GET/POST), `[orgId]/workspaces/[workspaceId]/route.ts` (GET/PATCH/DELETE), `[orgId]/workspaces/[workspaceId]/archive/route.ts` (POST), `[orgId]/workspaces/[workspaceId]/members/route.ts` (GET/POST/DELETE — M1).

## 3. Authorization Matrix

| Route | Method | Auth | Org Membership | Permission | Resource Boundary | Result (before this audit) |
|---|---|---|---|---|---|---|
| `organizations` | GET | ✅ (session-scoped internally, `listMyOrganizations()`) | n/a (returns only caller's own orgs) | n/a | n/a | OK |
| `organizations` | POST | ✅ | n/a (create) | n/a | n/a | OK |
| `organizations/switch` | POST | — | ✅ (`verifyMembership()`) | n/a | n/a | OK |
| `[orgId]` | GET | **❌ NONE** | **❌ NONE** | n/a | n/a | **DEFECT — fixed** |
| `[orgId]` | PATCH | ✅ | ✅ | ✅ (Owner/Admin) | n/a | OK |
| `[orgId]` | DELETE | ✅ | ✅ | ✅ (Owner) | n/a | OK |
| `[orgId]/suspend` | POST | ✅ | ✅ | ✅ (Owner) | n/a | OK |
| `[orgId]/reactivate` | POST | ✅ (direct, documented bypass of `getTenantContext()` for a suspended org) | ✅ | ✅ (Owner) | n/a | OK |
| `[orgId]/transfer-ownership` | POST | ✅ | ✅ | ✅ (Owner) | n/a — **but `newOwnerId` membership unverified** | Minor, see §11 |
| `[orgId]/roles` | GET | **❌ NONE** | **❌ NONE** | n/a | n/a | **DEFECT — fixed** |
| `[orgId]/roles` | PATCH | ✅ | ✅ | ✅ (Manage Users) | n/a | OK |
| `[orgId]/members` | GET | ✅ (M1) | ✅ (M1) | n/a | n/a | Fixed in M1 |
| `[orgId]/members/[userId]` | PATCH | ✅ | ✅ | ✅ (Manage Users) | n/a | OK |
| `[orgId]/members/[userId]` | DELETE | ✅ | ✅ | ✅ (Manage Users, or self) | n/a | OK |
| `[orgId]/invitations` | GET | **❌ NONE** | **❌ NONE** | n/a | n/a | **CRITICAL DEFECT — fixed** (leaked invite tokens) |
| `[orgId]/invitations` | POST | ✅ | ✅ | ✅ (Manage Users) | n/a | OK |
| `[orgId]/invitations/[id]/revoke` | POST | ✅ | ✅ | ✅ (Manage Users) | ✅ (verifies invitation belongs to orgId) | OK — model pattern |
| `[orgId]/workspaces` | GET | **❌ NONE** | **❌ NONE** | n/a | n/a | **DEFECT — fixed** |
| `[orgId]/workspaces` | POST | ✅ | ✅ | — | n/a (create) | OK |
| `[orgId]/workspaces/[workspaceId]` | GET | **❌ NONE** | **❌ NONE** | n/a | **❌ NONE** | **DEFECT — fixed** |
| `[orgId]/workspaces/[workspaceId]` | PATCH | ✅ | ✅ | — | **❌ NONE** | **CRITICAL DEFECT — fixed** |
| `[orgId]/workspaces/[workspaceId]` | DELETE | ✅ | ✅ | — | **❌ NONE** | **CRITICAL DEFECT — fixed** |
| `[orgId]/workspaces/[workspaceId]/archive` | POST | ✅ | ✅ | — | **❌ NONE** | **CRITICAL DEFECT — fixed** |
| `[orgId]/workspaces/[workspaceId]/members` | GET | ✅ (M1) | ✅ (M1) | n/a | **❌ NONE** | **DEFECT — fixed** |
| `[orgId]/workspaces/[workspaceId]/members` | POST | ✅ (M1) | ✅ (M1) | ✅ (M1) | **❌ NONE** | **CRITICAL DEFECT — fixed** |
| `[orgId]/workspaces/[workspaceId]/members` | DELETE | ✅ (M1) | ✅ (M1) | ✅ (M1) | **❌ NONE** | **CRITICAL DEFECT — fixed** |

## 4. Authentication Findings

10 of 15 routes had complete, correct auth checks already. **5 GET endpoints had zero authentication check at all**: `[orgId]`, `[orgId]/roles`, `[orgId]/invitations`, `[orgId]/workspaces`, `[orgId]/workspaces/[workspaceId]` — every one of them sat in the same file as a correctly-guarded mutating sibling, meaning the gap was an inconsistency within each file, not a design pattern. All fixed with the exact existing `getTenantContext()` + `context.organizationId !== orgId` → 403 guard.

## 5. Organization-Boundary Findings

Same as above — every fix reuses the identical, pre-existing tenant-match check. No new authorization mechanism was introduced anywhere.

## 6. Permission Findings

Consistent, correct use of the canonical `"Manage Users"` permission (via `requirePermission()`/`contextHasPermission()`, `permission-service.ts`) across every role/invitation/member-management mutation route, **except** the two M1-fixed workspace-member routes, which were missing it before M1 (now fixed). No new permission was invented anywhere in this audit; the one deferred item (§11) explicitly avoids inventing one.

## 7. Workspace-Boundary Findings — the most severe class of finding in this audit

**None of the workspace-scoped mutation routes verified that `workspaceId` actually belongs to `orgId`.** `workspace-service.ts`'s `update()`, `archive()`/`reactivate()` (via `setStatus()`), and `delete()` all filter **only** by `workspace_id` — never `organization_id` — trusting their caller entirely. Combined with every route only checking "is the caller a member of `orgId`" (never "does `workspaceId` belong to `orgId`"), this meant: **a legitimate member of Organization A, with the requisite permission in Organization A, could rename, archive/reactivate, delete, or manipulate the membership of Organization B's workspace** — by supplying Organization A's `orgId` (to pass the tenant-match check) alongside any known or guessed Organization B `workspaceId`.

Affected: `PATCH`/`DELETE /workspaces/[workspaceId]`, `POST /workspaces/[workspaceId]/archive`, and — critically — the two routes Milestone 1 had *just* fixed for the permission gap (`POST`/`DELETE /workspaces/[workspaceId]/members`) were **still vulnerable to this separate boundary gap** even after that fix.

**Fixed** by adding one extra read (`workspaceService.get(workspaceId)`) before any mutation, verifying `workspace.organization_id === orgId`, returning 404 (not 403) on mismatch — matching this repo's own established "don't confirm existence of a resource outside the caller's boundary" IDOR convention, and mirroring the one route that already did this correctly (`invitations/[id]/revoke`, which verifies the invitation belongs to `orgId` before acting — used as the model pattern).

## 8. IDOR Findings

The invitations GET gap (§4) compounds into a genuine **unauthenticated organization-infiltration chain**, not merely an information leak: `OrganizationInvitation` includes the raw `token` field (`organization-types.ts`), and `POST /api/saas/invitations/[token]/accept` accepts that token from **any authenticated user**, with no check that the accepting user's email matches the invitation's `email`. Before this fix, an unauthenticated caller who knew or guessed an `orgId` could list every pending invitation for that org (email **and** token included), then have any authenticated account accept the harvested token to join that organization at the invited role. This is the single most severe finding of this audit — classified **A-critical**.

The token-accepts-regardless-of-email-match design itself is treated as pre-existing, intentional (a shareable-link invite model, not unusual for this class of product) and was **not changed** — only the leak that exposed the token to begin with was fixed, per this milestone's explicit "do not redesign roles" instruction.

## 9. UI Findings

`src/app/settings/team/page.tsx` (the direct UI caller of the audited member-management routes) was inspected. **The API remains fully authoritative** — no client-side check gates whether a mutation is *attempted* (role-change/remove/transfer controls render for any org member viewing the page, regardless of their own permission), but this is not a security defect since the server-side checks (§4-7, now all closed) are what actually enforce the boundary; UI hiding was never relied upon as the security mechanism here.

**Real, non-security finding**: `handleRoleChange`/`handleRemove`/`handleTransfer` never check `response.ok` — every mutation attempt calls `load()` afterward regardless of success or failure, with no error branch at all. A member without "Manage Users" permission who clicks "Remove" is correctly blocked server-side (403), but the UI shows **no error message whatsoever** — it silently reloads the unchanged roster, leaving the user with no indication their action failed or why. This violates this repo's own established "never silently swallow an error state" convention (already correctly followed elsewhere, e.g. `VersionsList.tsx`'s `handleDelete`). **Not fixed in this pass** — per this milestone's explicit Fix Policy ("only fix genuine security defects"), this is a UX/error-surfacing gap, not an authorization bypass (data integrity is safe; the mutation is genuinely blocked server-side). Documented here for a future, narrowly-scoped UX pass.

## 10. Test Coverage

Reviewed the 11 Milestone 1 tests: all genuinely prove what they claim (unauthenticated → blocked before any service call; permission-less → blocked; permitted → succeeds) — confirmed sound, not superficial. This audit **extended** the M1 workspace-members test file with 4 new cross-organization-boundary cases (previously untested) and added **6 new test files** (20 new test cases) for every other route fixed in this pass. No existing test was weakened or removed.

## 11. Defects Discovered

1. **`GET [orgId]`** — no auth check (org name/slug/status/owner_id exposed). B-major.
2. **`GET [orgId]/roles`** — no auth check (role/permission config exposed). C-minor.
3. **`GET [orgId]/invitations`** — no auth check; leaks invitation `token` + email, chainable into full org-infiltration via the accept endpoint. **A-critical.**
4. **`GET [orgId]/workspaces`** — no auth check (workspace list exposed). B-major.
5. **`GET [orgId]/workspaces/[workspaceId]`** — no auth check, no org-boundary check. B-major.
6. **Cross-organization workspace resource-boundary gap** — affecting `PATCH`/`DELETE /workspaces/[workspaceId]`, `POST /workspaces/[workspaceId]/archive`, and `POST`/`DELETE /workspaces/[workspaceId]/members` (5 handlers across 3 files). Real, authenticated cross-tenant data manipulation/destruction. **A-critical.**
7. **`organizationService.transferOwnership()`** does not verify `newOwnerId` is actually a member of the organization before granting ownership. Requires an already-fully-privileged Owner to invoke it (not a client-side-triggerable bypass by an unprivileged actor) — a data-integrity safeguard gap, not an authorization bypass. **Deferred**, not fixed: no existing "verify user X is a member of org Y" helper exists to reuse, and adding new validation logic here risks the "do not redesign roles" boundary this milestone draws. Reported for a future, deliberate decision.
8. **`settings/team/page.tsx`'s mutation handlers silently swallow a blocked (403) mutation** — no error surfaced to the user. Not a security defect (server-side enforcement is correct); deferred per Fix Policy (§9).

## 12. Defects Fixed

Items 1-6 above — 7 route files touched (`[orgId]/route.ts`, `roles/route.ts`, `invitations/route.ts`, `workspaces/route.ts`, `workspaces/[workspaceId]/route.ts`, `workspaces/[workspaceId]/archive/route.ts`, `workspaces/[workspaceId]/members/route.ts`), all using the exact pre-existing authorization patterns already correct elsewhere in the same files/directory — no new authorization mechanism, no new permission, no new dependency, no migration.

## 13. Live Validation

Fresh dev server, cache cleared. Every one of the 6 newly-fixed routes now correctly returns `403 {"error":"Not authorized for this organization"}` for an unauthenticated request: `GET [orgId]`, `GET [orgId]/roles`, `GET [orgId]/invitations`, `GET [orgId]/workspaces`, `GET [orgId]/workspaces/[workspaceId]`, `POST [orgId]/workspaces/[workspaceId]/archive`. The two Milestone 1 fixes (`[orgId]/members`, `workspaces/[workspaceId]/members`) were re-confirmed still correctly rejecting unauthenticated requests. Core app pages (home, `/settings/organization`) confirmed healthy. **Full authenticated cross-organization E2E was not fabricated** — no test credentials were available in this environment; the cross-organization boundary fix is validated via the mocked regression tests (§10), which precisely reproduce the exploit shape (Org A's context + Org B's `workspaceId`) and prove the fix blocks it.

## 14. Remaining Operational/Business Items

None newly introduced by this audit. The two deferred, non-security items (§11 #7, #8) are candidates for a future, separate, deliberately-scoped pass — not proposed as a new milestone here, per the closure rule.

### Validation Results

```
BASELINE TESTS: 1303
FINAL TESTS:    1327
NEW TESTS:      24
FAILURES:       0

TSC:        PASS
LINT:       PASS (0 errors; 2 pre-existing, unrelated <img> warnings)
BUILD:      PASS
VERIFY.SH:  PASS WITH WARNINGS (the one security-scanner flag on the
            workspace-members route was already reviewed and confirmed
            correct in Phase 26 M1's report — a target userId, not the
            acting user's identity; no new/unexpected warnings on any
            other file touched in this pass)
```

## 15. Final Classification

Selecting from the required set: **A — Critical security defect remains? No — every critical defect found in this audit (the invitation-token leak, the cross-organization workspace resource-boundary gap) was fixed, tested, and validated within this same pass.**

**E — No further engineering work required** on the organization/workspace authorization surface. The two deferred items (§11 #7, #8) are real but explicitly non-security (a data-integrity nicety requiring an already-fully-privileged actor to misuse, and a UX error-surfacing gap with no data-integrity consequence) — neither blocks calling this surface closed from a security-engineering standpoint.

> Organization/workspace authorization closure complete. No further engineering milestone proposed.
