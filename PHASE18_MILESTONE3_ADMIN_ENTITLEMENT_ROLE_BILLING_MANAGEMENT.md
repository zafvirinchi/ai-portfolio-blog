# Phase 18 — Milestone 3: Admin Entitlement, Role & Billing Management

## 1. Audit findings

Before writing any code: `/admin/layout.tsx`, `/admin/billing/page.tsx`, `/admin/saas/page.tsx`, `/admin/usage/page.tsx`, `AdminSidebar.tsx`, every Phase 14 `supabase/migrations/*.sql` file, `src/lib/saas/audit-service.ts`, `src/lib/saas/organization-types.ts`, and all of Phase 18 M1/M2's `entitlement-service.ts`, `persona-service.ts`, `platform-schema.ts`, `platform-plan-registry.ts`, `entitlement-overrides-service.ts`, `usage-event-service.ts`, `platform-subscription-service.ts`, `platform-billing-service.ts` were read in full.

**Finding 1 — a real, significant, pre-existing gap: `/admin/layout.tsx` has no actual admin-role check.** It only verifies `if (!user) redirect("/admin/login")` — any authenticated Supabase user (including a self-registered one via the public `/signup` page) can reach every existing `/admin/*` page. This was first documented in Phase 17 M7's own audit and is re-confirmed here. **Deliberately not fixed globally** — see §16.

**Finding 2 — no bootstrap mechanism for ADMIN exists anywhere.** `resolvePlatformRoles()` (M1) defaults every user to `["JOB_SEEKER"]` unless `app_metadata.platform_roles` explicitly includes `"ADMIN"`, and nothing in this codebase has ever called `setPlatformRoles()` to grant it to anyone. This milestone's own `isAdmin()`-gated control plane is therefore unreachable by anyone until a one-time manual bootstrap step is performed (documented in §16) — genuinely, not hypothetically: no user currently holds ADMIN.

**Finding 3 — `/admin/billing` and `/admin/saas` already exist but are entirely organization-scoped** (`subscriptions`, `payments`, `credit_transactions`, `organizations`, `workspaces`, `activity_logs`, `audit_logs` — all Phase 14 org tables). Neither is a suitable home or reusable implementation for individual-platform-user administration; both are left completely untouched.

**Finding 4 — `audit_logs` (Phase 14) is safely reusable for this milestone's audit trail, no new table needed.** Its `organization_id` column has always been nullable, and `audit-service.ts`'s `record()` function already accepts an explicit `organizationId: null` + `userId` pair without requiring `getTenantContext()`. Only a read-side gap existed (`list()` requires a non-null `organizationId`) — filled additively with one new function, `listByObject()` (§5).

**Finding 5 — "quota overrides" (Scope C) require no new schema.** A `GRANTED` feature-level override already resolves to `UNLIMITED` access in `getEntitlement()` (M1), and `checkQuota()` already treats `UNLIMITED` access as `limit: null` (unlimited) for any usage metric tied to that feature. Granting a feature override is therefore already a complete quota override — no separate quota-override primitive was built.

**Conclusion: zero new database tables or migrations were needed for this milestone.**

## 2. Existing functionality reused

- **`entitlement-service.ts`'s `grantFeatureOverride()`/`revokeFeatureOverride()`** (M1) — already admin-gated (re-derives the ACTING user's role from `resolvePlatformRoles()` on every call, never trusts a caller's claim). This milestone's admin routes call these directly rather than re-implementing the grant/revoke decision or its authorization check.
- **`resolveEffectivePlans()`, `getEntitlement()`, `checkQuota()`, `getUsage()`** (M1/M2) — used as-is for the admin per-user detail view; no parallel entitlement computation was written anywhere in this milestone.
- **`platform-subscription-service.ts`'s `getCustomerByUserId()`/`listSubscriptionsForUser()`** (M2) — used read-only for the admin billing view; their existing fail-closed-to-null/empty behavior on a query error is exactly what makes the admin UI degrade honestly (§ Scope D) with zero new code.
- **`supabaseAdmin.auth.admin.getUserById()`/`listUsers()`** — the same Supabase Admin API `persona-service.ts`, `team-service.ts`, and `user-analytics.ts` already use; no new user table.
- **`saas/audit-service.ts`'s `record()`** — reused completely unmodified for writing every admin action (role change, override grant/revoke/deactivate).
- **The existing `/admin` shell** (`AdminLayout`, `AdminSidebar`) — reused for visual consistency; only one new nav entry was added.
- **The existing admin-page convention** (server components calling service functions directly, e.g. `/admin/billing`, `/admin/saas`) — followed for the read-heavy user-detail page; only the inherently-interactive parts (search, role/override mutation) are client components.

## 3. Genuine gaps found and filled

1. No real ADMIN authorization check existed anywhere reachable (Finding 1/2) — filled by `requirePlatformAdmin()`, used by every new route in this milestone.
2. No admin user-search capability existed.
3. No role assignment/removal UI or API existed, and none of the required safety guards (last-admin block, self-lockout confirmation) existed anywhere.
4. No admin view of a user's effective entitlements (with source: plan vs. override vs. admin-bypass) existed.
5. No admin override-management UI/API existed (M1 built the engine; nothing ever called it from a route).
6. No admin view of a user's Stripe-backed billing state existed.
7. No admin usage-aggregate view existed.
8. No audit trail existed for any of the above (a real, reusable mechanism existed but had no write-site for this).

## 4. Files added

- `src/lib/billing/platform-admin-service.ts` (+ `.test.ts`) — the admin-workflow layer.
- `src/app/api/admin/platform/users/route.ts` (search), `users/[userId]/route.ts` (detail), `users/[userId]/roles/route.ts`, `users/[userId]/overrides/route.ts`, `overrides/[overrideId]/route.ts`, `usage/route.ts`.
- `src/app/admin/platform/layout.tsx` (the real `isAdmin()` gate), `users/page.tsx` (search UI), `users/[userId]/page.tsx` (detail UI).
- `src/components/admin/PlatformRoleManager.tsx`, `src/components/admin/PlatformOverrideManager.tsx`.
- `src/lib/billing/entitlement-overrides-service.test.ts` (new — M1's file had none).

## 5. Files modified

- `src/lib/billing/persona-service.ts` — added `AdminAccessRequiredError`, `requirePlatformAdmin()`; genericized `PlatformUnauthorizedError`'s message (see §7, a real bug found via live-probing).
- `src/lib/billing/entitlement-overrides-service.ts` — added `listAllOverridesForUser()` (full history) and `getOverrideById()`; `listActiveOverrides()`/`createOverride()`/`revokeOverride()` unchanged.
- `src/lib/billing/entitlement-service.ts` — added `deactivateEntitlementOverride()` (admin-gated wrapper around `revokeOverride()`); every M1/M2 function unchanged.
- `src/lib/saas/audit-service.ts` — added `listByObject()` (generic, not platform-specific); `record()`/`list()` unchanged.
- `src/components/admin/AdminSidebar.tsx` — one new nav entry ("Platform Users").
- `vitest.config.mts` — two new test files added to `include`.
- `src/lib/billing/entitlement-service.test.ts`, `persona-service.test.ts` — extended for the new functions/message.

## 6. Files intentionally untouched

- `/admin/layout.tsx`, `AdminLoginForm.tsx` — the general CMS admin auth gate (Finding 1). Not fixed here: doing so risks locking the site owner out of the entire admin panel (blogs, interview content, RAG documents, etc.) given Finding 2 (no one has ADMIN yet). Documented, not silently changed.
- `/admin/billing/page.tsx`, `/admin/saas/page.tsx` — organization-scoped, protected Phase 14 architecture (Finding 3).
- Every M1 (`platform-plan-registry.ts`, `usage-event-service.ts`, `feature-registry.ts`) and M2 (`platform-stripe-provider.ts`, `platform-billing-service.ts`) file not listed in §5 — no changes were needed; their existing decision logic is reused as-is.
- `supabase/migrations/20260817000000_add_platform_billing_tables.sql` (M2) — still not applied to live Supabase, per repository convention; not touched or worked around.

## 7. Security changes

Every requirement in the milestone's own Security Requirements list was implemented:

- **`requirePlatformAdmin()`** (persona-service.ts) is the one gate every new route calls first — it re-derives both identity (real Supabase session) and role (`app_metadata`, fresh on every call) server-side; nothing is ever cached or trusted from a request.
- **401 vs 403 are distinct and correctly mapped**: `PlatformUnauthorizedError` (no session) → 401; `AdminAccessRequiredError` (real session, not admin) → 403.
- **`app_metadata` is never client-writable** — `setPlatformRoles()` (the only function that writes it) is only ever called from `assignPlatformRole()`/`removePlatformRole()`, both of which require an ACTING admin resolved server-side; no route accepts a raw `app_metadata` payload.
- **Every userId/featureId/role is validated**: `assignPlatformRole()`/`removePlatformRole()` validate `role` against `PLATFORM_ROLES` (`InvalidPersonaError`, 400) and the target user's existence (`UserNotFoundError`, 404); `grantOverrideByAdmin()`/`revokeOverrideByAdmin()` validate `featureId` against the central 24-feature registry (`InvalidFeatureIdError`, 400) before entitlement-service.ts is ever called.
- **Overrides always belong to the intended target user, never the acting admin** — `deactivateOverrideByAdmin()` resolves which user an `overrideId` belongs to from the override row itself (`getOverrideById()`), never from client input; a client cannot even supply a target user for this action, since none is accepted.
- **Stripe customer/subscription mapping cannot be spoofed through the admin UI** — the admin detail view is strictly read-only for billing data (`getCustomerByUserId()`/`listSubscriptionsForUser()`, both reads); no route in this milestone writes to `platform_billing_customers`/`platform_subscriptions` at all. The actual write path (Stripe webhook, M2) was re-audited and is unchanged — its own forged-metadata protection (M2 §16 #15) is untouched and still verified by M2's own tests.
- **A genuine bug found via live-probing and fixed**: `PlatformUnauthorizedError`'s message ("You must be signed in to manage your billing.") — accurate for M2's checkout/portal routes — was context-wrong once reused by every `/admin/platform/*` route via `requirePlatformAdmin()`. Genericized to "You must be signed in to access this."; the one test asserting the old wording was updated to match, not weakened.

## 8. Database / migration changes

**None.** No new table, no new column, no new migration file. Confirmed via audit (§1, Finding 4/5) that `audit_logs` (nullable `organization_id`) and the existing `GRANTED`-override-→-`UNLIMITED` resolution already fully support this milestone's audit-trail and quota-override requirements.

## 9. Tests added

36 new/modified tests across 5 files:

- **`persona-service.test.ts`** (+3) — `requirePlatformAdmin()`'s 401/403/success paths, and the corrected generic-message assertion.
- **`entitlement-service.test.ts`** (+3) — `deactivateEntitlementOverride()`'s own admin gate, real delegation to `revokeOverride()`, and (Scope H #10) a test proving that once an override is no longer returned by `listActiveOverrides()`, `getEntitlement()` genuinely falls back to plan/fallback behavior.
- **`entitlement-overrides-service.test.ts`** (new, 8 tests) — Scope H #11: a **real, filter-applying** fake Supabase query builder (not a mocked-away function) proving expired overrides are excluded, revoked overrides are excluded, cross-user isolation holds, and `listAllOverridesForUser()`/`getOverrideById()` behave correctly.
- **`platform-admin-service.test.ts`** (new, 22 tests) — user search (exact-id vs. paginated, email/role filtering, minimal-PII shape), user-detail aggregation (centralized plan resolution, honest degradation when billing tables are empty, cross-user isolation), role assignment/removal (invalid persona rejection, idempotency, **last-admin block**, **self-lockout confirmation requirement**, successful self-removal once confirmed with another admin present), and override management (invalid feature-id rejection, correct target-user attribution, override-not-found handling, target-user resolution from the override row itself rather than client input).

Scope H's remaining items (#1/#2 admin-vs-non-admin API access, #13 Stripe mapping non-spoofability, #15 anonymous/free regression) are covered by direct tests above plus the full, unmodified 1020-test M1/M2 baseline continuing to pass unchanged (§10) — proof that nothing in this milestone altered existing anonymous/free/Stripe behavior.

## 10. Full test count

- Before this milestone: **1020/1020** passing (Phase 18 M2 baseline).
- After this milestone: **1056/1056** passing (77 test files) — 36 new tests, 0 regressions.

## 11. TypeScript result

`npx tsc --noEmit` — 0 errors.

## 12. Lint result

`npm run lint` — 0 errors, 1 pre-existing warning unrelated to this milestone.

## 13. Build result

`npm run build` — succeeds. Confirmed present in the build's route listing: `/admin/platform/users`, `/admin/platform/users/[userId]`, and all 6 new `/api/admin/platform/*` routes.

## 14. Live validation performed

Production server (`npm run start`) probes:

```
GET  /admin/platform/users (unauthenticated)                              → 307 (redirected to /admin/login — outer layout's existing session check)
GET  /api/admin/platform/users?email=test (unauthenticated)               → 401 {"error":"You must be signed in to access this."}
GET  /api/admin/platform/users/[fake-id] (unauthenticated)                → 401 (same)
POST /api/admin/platform/users/[fake-id]/roles (unauthenticated)          → 401 (same)
POST /api/admin/platform/users/[fake-id]/overrides (unauthenticated)      → 401 (same)
DELETE /api/admin/platform/overrides/[fake-id] (unauthenticated)          → 401 (same)
GET  /api/admin/platform/usage (unauthenticated)                          → 401 (same)
GET  /settings/billing (M2 customer page, regression check)               → 307 (unchanged — its own existing auth gate)
POST /api/ai/mock-interview {} (M1 representative integration, regression check) → 400 {"error":"resumeId is required"} (unchanged)
```

Every new route correctly rejects unauthenticated access; existing M1/M2 behavior is provably unchanged.

**Not performed, and not claimed**: no test with a real authenticated ADMIN session (this environment has no way to sign in as one — and per Finding 2, no account holds ADMIN yet regardless). No live/test-mode Stripe validation (same blocker as M2 — no Stripe credentials configured in this environment). No 403-for-authenticated-non-admin live probe (requires a real non-admin session, unavailable here). All such paths are instead covered by the unit test suite (§9), which directly exercises `requirePlatformAdmin()`'s real logic against mocked (not live) Supabase sessions.

## 15. Blocked by unapplied migrations/credentials

- `supabase/migrations/20260817000000_add_platform_billing_tables.sql` (M2) remains unapplied — the admin billing view's Stripe section will show "No Stripe billing account for this user yet" for every user until it is (an honest, controlled state — never fabricated data — confirmed by test, §9).
- No Stripe credentials exist in this environment (unchanged from M2) — the admin billing view can only ever show what's already synced into `platform_billing_customers`/`platform_subscriptions`, which is nothing, until both the migration is applied and real Stripe checkout/webhook traffic occurs.
- **No one currently holds the ADMIN platform role** (Finding 2) — `/admin/platform/*` is genuinely unreachable by any real account until a one-time bootstrap step is performed manually, e.g. via the Supabase SQL editor or a short one-off script calling `supabaseAdmin.auth.admin.updateUserById(YOUR_USER_ID, { app_metadata: { platform_roles: ["ADMIN"] } })` (exactly what `setPlatformRoles()`, already built in M1, does — just needs to be invoked once, by hand, for the very first admin). This is a deliberate, minimal, documented manual step rather than a parallel bootstrap mechanism built into the codebase (see §16).

## 16. Protected architecture intentionally left untouched

- **`/admin/layout.tsx`'s missing role check** (Finding 1) — a real, non-trivial gap, left alone specifically to avoid locking the site owner out of the CMS before any bootstrap has happened. This milestone adds a genuinely-enforced ADDITIONAL gate scoped only to `/admin/platform/*`, layered on top of (never replacing) the weaker outer check.
- **`/admin/billing`, `/admin/saas`, and every Phase 14 organization billing table/service** — read, understood, and deliberately not touched (Finding 3).
- **M1's `entitlement-service.ts` core decision logic and M2's Stripe webhook/checkout flow** — reused via their existing public functions only; no internal logic was modified, no second entitlement or billing engine was created.

## 17. Remaining risks

- Until the manual ADMIN bootstrap (§15) happens, this entire milestone's UI/API is provably correct but practically unreachable — a real operational step, not a code gap.
- The general `/admin` panel's authorization gap (Finding 1) remains a genuine, if long-standing and now twice-documented (Phase 17 M7, this milestone), site-wide weakness — recommended as a real future fix once bootstrapping makes it safe to enforce.
- The admin override UI lets an admin grant a feature to any of the 24 registry features by typing/selecting its id — validated server-side, but there is no UI-level guardrail against granting an obviously-mismatched feature (e.g., granting a RECRUITER-only feature to a pure JOB_SEEKER account); this is intentional (an admin override is explicitly meant to bypass the plan matrix) but worth knowing.
- `countUsersWithRole()` (the last-admin check) scans all users via paginated `listUsers()` calls (bounded, same cap as `user-analytics.ts`'s own precedent) — fine at this project's scale, but would need a real query path if the user base grows large enough to matter.

## 18. Recommended next milestone

**Phase 18 Milestone 4 — Admin Bootstrap & Site-Wide Authorization Hardening**: (a) formalize the one-time ADMIN bootstrap step documented in §15 into a safe, auditable one-shot script or documented runbook (not a standing parallel auth mechanism); (b) once a real admin exists and has been verified to work end-to-end against this milestone's control plane, revisit `/admin/layout.tsx`'s own authorization gate (Finding 1) and retrofit it with a real `isAdmin()` check now that doing so is actually safe; (c) once Stripe credentials and the M2 migration are both available, perform genuine end-to-end validation of the admin billing view against real synced subscription data.
