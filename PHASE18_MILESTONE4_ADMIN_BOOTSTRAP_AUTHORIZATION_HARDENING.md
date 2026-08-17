# Phase 18 — Milestone 4: Platform Admin Bootstrap & Authorization Hardening

## 1. Milestone classification

Security-critical authorization hardening + a new, narrowly-scoped bootstrap mechanism. No new product surface, no new billing/entitlement logic, no new admin UI — this milestone closes access-control gaps in the existing `/admin/**` tree and establishes a safe way to create the very first ADMIN.

## 2. Audit findings

- **`/admin/layout.tsx`** (the layout wrapping every page under `/admin/**`) only checked `if (!user) redirect("/admin/login")` — no role check at all. Documented as a gap in Phase 17 M7, re-confirmed in Phase 18 M1/M3, left unfixed until now specifically because no user has ever held ADMIN.
- **No user in this system has ever held the ADMIN persona.** `app_metadata.platform_roles` can only be written server-side via the Supabase Admin API — there was previously no way for anyone to become the first admin without direct database access.
- **10 `/api/admin/analytics/*` routes** each had their own local `requireAdmin()` that only checked session presence, never a role — the same weak pattern as the page layout, just duplicated 10 times.
- **26 other `/api/admin/**` routes had *no* auth check whatsoever** — `blogs` (create/update/delete), `blogs/[id]`, `interview-categories` (+`[id]`), `interview-questions` (+`[id]`), `interview-topics` (+`[id]`), `interview/{extract,import,confirm-import,reformat-answer,regenerate-answer}`, `knowledge`, `rag-documents`. All write via the service-role Supabase client (`supabaseAdmin`) directly. Any unauthenticated caller who knew (or guessed) these URLs could create/edit/delete blog posts, interview content, and RAG knowledge-base documents that feed the site's AI chatbot. One of these — `src/app/api/admin/blogs/route.tsx` — used a `.tsx` extension and was missed by an initial `route.ts`-only file search; caught on a second pass after the production build listed it as a compiled route.
- **`/api/admin/platform/**` (Phase 18 M3)** was already correctly protected — every route calls `requirePlatformAdmin()` directly. No changes needed there.
- **No existing deployment/bootstrap/seed mechanism** exists in this repo (no `scripts/` directory, no `package.json` script beyond `dev`/`build`/`start`/`lint`/`test`, no `.env.example`). Env vars are plain `KEY=value` in `.env.local`, read via `process.env.X` directly — no validation/schema layer to plug into.
- **No middleware file** (`src/middleware.ts`) exists — nothing protects `/admin/**` or `/api/admin/**` at a layer above individual routes/layouts.
- **Role-safety logic in `platform-admin-service.ts` (M3)** — re-audited, found already correct: ADMIN is multi-role compatible, self-removal requires `confirmSelfRemoval`, the last ADMIN cannot be removed (`countUsersWithRole`), malformed role values are rejected (`isPlatformRole`/`InvalidPersonaError`), and every role mutation resolves the acting admin server-side, never from client input. No changes made to this file.

## 3. Existing functionality reused

- `requirePlatformAdmin()` / `isAdmin()` / `resolvePlatformRoles()` (`persona-service.ts`, M1/M3) — the single role-resolution authority. No second implementation was written anywhere.
- `auditService.record()` (`src/lib/saas/audit-service.ts`, Phase 14) — the bootstrap grant is logged through the exact same function M3 uses for role/override changes. No second audit system.
- `audit_logs` table itself, queried (never written to as a new table) to answer "has bootstrap ever succeeded" — reused as the persistence marker Step 5 asked for, instead of adding a new table/column.
- `supabaseAdmin.auth.admin.getUserById()` / `updateUserById()` — the same Admin API every persona read/write in this codebase already uses.
- The M3 "Access Denied" panel pattern (`/admin/platform/layout.tsx`'s original UI) was reused verbatim for the newly-enforced `/admin/layout.tsx` check, rather than inventing a new denial UI.

## 4. Genuine vulnerabilities found and fixed

1. `/admin/layout.tsx` — session-only check, no role check (fixed).
2. 10 `/api/admin/analytics/*` routes — session-only local `requireAdmin()` (fixed, replaced with shared guard).
3. 26 `/api/admin/**` routes with zero auth check at all, writing via the service-role client (fixed — see file list below). This is the largest finding of the milestone.

## 5. Bootstrap design chosen and why

`POST /api/admin/bootstrap`, gated by **two independent factors**, both required:

1. A real, specific, authenticated Supabase session (`requireUserId()`).
2. The server-only `PLATFORM_ADMIN_BOOTSTRAP_SECRET` env var, presented via an `x-bootstrap-secret` header and compared with `crypto.timingSafeEqual`.

The promoted account is **always the caller's own session `userId`** — no `targetUserId` field exists anywhere in the request or the function signature. This is the core safety property: knowing the secret alone isn't enough (you must already be a real signed-in user), being signed in alone isn't enough (you must know the secret), and even a caller with both can only ever promote *themselves*. This structurally prevents the endpoint from ever becoming a general role-assignment API (Step 5) — there is no parameter through which a third party could be targeted.

Not hard-disabled after one success: a code-level one-time lock creates its own lockout-recovery problem (e.g. the first bootstrapped account is lost) with no safe way back short of direct DB access — exactly what this feature exists to avoid needing. The primary, sufficient off-switch is operational: removing `PLATFORM_ADMIN_BOOTSTRAP_SECRET` from the deployment config makes the endpoint fail closed for everyone, no code change required. Every invocation still requires both factors regardless of how many admins already exist, so repeat use is never less safe than the first use.

`hasAnyBootstrapGrant()` queries `audit_logs` for a prior `platform.bootstrap.admin_granted` action and surfaces it informationally in the response (`priorGrantExisted`) — visibility for the operator, not a hard block.

## 6. Files added

- `src/lib/billing/admin-api-guard.ts` — shared `requireAdminRoute()` guard for every `/api/admin/**` route outside `platform/**`.
- `src/lib/billing/admin-api-guard.test.ts`
- `src/lib/billing/platform-admin-bootstrap-service.ts` — the bootstrap mechanism.
- `src/lib/billing/platform-admin-bootstrap-service.test.ts`
- `src/app/api/admin/bootstrap/route.ts` — the bootstrap HTTP endpoint.

## 7. Files modified

- `src/app/admin/layout.tsx` — real `isAdmin()` enforcement, Access Denied panel for authenticated non-admins.
- `src/app/admin/platform/layout.tsx` — removed its now-redundant `isAdmin()` check (the outer layout enforces it for every request before this nested layout ever runs); kept only as a spacing wrapper.
- `vitest.config.mts` — registered the two new test files.
- All 27 vulnerable `/api/admin/**` route files: `analytics/{ai-usage,conversion,export,features,organizations,overview,revenue,subscriptions,trends,users}/route.ts`, `blogs/route.tsx`, `blogs/[id]/route.ts`, `interview-categories/route.ts`, `interview-categories/[id]/route.ts`, `interview-questions/route.ts`, `interview-questions/[id]/route.ts`, `interview-topics/route.ts`, `interview-topics/[id]/route.ts`, `interview/{extract,import,confirm-import,reformat-answer,regenerate-answer}/route.ts`, `knowledge/route.ts`, `rag-documents/route.ts`.

## 8. Files intentionally untouched

- `src/app/api/admin/platform/**` (5 route files) — already correctly gated by `requirePlatformAdmin()` since M3.
- `src/lib/billing/platform-admin-service.ts` — re-audited (Step 6), found already correct; no genuine gap to fix.
- `src/lib/billing/persona-service.ts` — the authorization primitives themselves needed no changes, only wider reuse.
- `src/app/api/admin/interview-topics/[id]/route.ts`'s missing `PUT`/`DELETE` handlers — a pre-existing functional gap (only `GET`/`POST` exist, duplicating the base route), unrelated to authorization and out of this milestone's scope; the handlers that do exist are now guarded.

## 9. Admin authorization changes

`/admin/layout.tsx` now resolves the session user's roles via `resolvePlatformRoles()` and requires `isAdmin()`. Unauthenticated → redirect to `/admin/login` (unchanged). Authenticated non-admin → a plain "Access Denied" page, no sidebar/nav, no indication of which specific resource exists beneath it. ADMIN → unchanged normal access. Because this is a parent layout, every page under `/admin/**` — blogs, interview content, knowledge, RAG documents, SaaS/billing/usage dashboards, and the M3 platform control plane — is now protected by this one change.

## 10. Bootstrap security controls

- Timing-safe secret comparison (`crypto.timingSafeEqual`), including equal-effort handling of length mismatches.
- Fails closed with no admin created if `PLATFORM_ADMIN_BOOTSTRAP_SECRET` is unset.
- Target is always the caller's own verified session `userId` — never client-supplied.
- Idempotent: an already-ADMIN caller gets a safe `{ alreadyAdmin: true }` result, no duplicate role entry, no duplicate audit write.
- Existing roles (`JOB_SEEKER`/`RECRUITER`) are always preserved — additive only.
- Every successful grant is written to `audit_logs`.
- The response never echoes the secret or any field derived from it; error responses distinguish only 401 (no session) / 403 (bad secret) / 404 (account unresolvable) / 503 (not configured) without leaking which specific factor an attacker got closer to satisfying beyond that.

## 11. Role-management changes

None. Step 6's re-audit of `platform-admin-service.ts` found the last-admin block, self-lockout confirmation, and malformed-role rejection already correct and already tested (M3). No rewrite.

## 12. Audit logging changes

One new audit action, logged through the existing `auditService.record()`: `platform.bootstrap.admin_granted` (`objectType: "platform_user"`, `objectId`/`userId`: the newly-bootstrapped user, `organizationId: null`). No new audit table or system.

## 13. Migration status

**Migration required for this milestone: none.** The bootstrap mechanism reuses the existing `audit_logs` table for both logging and the "has bootstrap ever run" signal; no new table or column was needed.

## 14. Tests added

- `admin-api-guard.test.ts` (5 tests) — success passthrough, 401/403 mapping, no-input-to-forge structural check, safe 500 fallback that never leaks the underlying error message.
- `platform-admin-bootstrap-service.test.ts` (15 tests) — missing/wrong/wrong-length secret rejection, not-configured fail-closed, unresolvable-account failure, always-targets-caller behavior, role preservation, exactly-once ADMIN grant, single audit entry, secret never present in the response, idempotency (including multi-role admins), and `hasAnyBootstrapGrant()`'s three states.

Mapped against the 20 enumerated behaviors: items 1–3 and 5–11 and 16–17 are covered directly by the two new test files above; items 12–13 and 15–16 (last-admin block, self-lockout, role validation, acting-admin identity independence) were already covered by M3's `platform-admin-service.test.ts`, re-verified passing, not rewritten; item 4 (M3's own protections) re-verified passing unchanged; item 14 is covered structurally — the guard function takes no parameters at all, so there is no field for a client-supplied `isAdmin` to occupy; items 18–20 (anonymous/free-user behavior, `/settings/billing`, Stripe webhook security) are covered by the full, unmodified regression suite passing.

## 15. Final test count

**1076 / 1076 passing** (79 test files), up from the 1056 baseline — 20 new tests, zero modified/removed.

## 16. TypeScript result

`tsc --noEmit` — clean, no errors.

## 17. Lint result

`eslint` — clean (one pre-existing, unrelated warning in `src/app/(site)/blog/[slug]/page.tsx` about `<img>` vs `next/image`, not touched by this milestone).

## 18. Build result

`npm run build` — succeeded. Confirmed in the route manifest: `/api/admin/bootstrap`, all 27 fixed `/api/admin/**` routes, and every `/admin/**` page compiled successfully.

## 19. Live validation performed

With the dev server running locally (no real Supabase session/credentials available in this environment):

- `GET /admin` unauthenticated → `307` to `/admin/login`.
- `GET /admin/platform/users` unauthenticated → `307` to `/admin/login` (now caught by the outer layout before the nested one even runs).
- `GET /admin/blogs` unauthenticated → `307` to `/admin/login`.
- `GET /api/admin/platform/users`, `GET /api/admin/analytics/overview`, `GET /api/admin/interview-categories`, `POST /api/admin/blogs`, `PUT`/`DELETE /api/admin/blogs/[id]`, `DELETE /api/admin/knowledge`, `POST /api/admin/interview/extract` unauthenticated → all `401` with the same generic "You must be signed in to access this." body, nothing route-specific leaked.
- `POST /api/admin/bootstrap` unauthenticated (no secret, and separately with a wrong secret) → `401` (the session check runs before the secret check, so an anonymous caller never learns whether a secret would have mattered).
- Grepped the built `.next/static` client chunks for `PLATFORM_ADMIN_BOOTSTRAP_SECRET` — no match; the name (and by extension, since it's never assigned a `NEXT_PUBLIC_` alias, any value) does not reach client-side code.

## 20. What could NOT be validated

- Authenticated ADMIN access end-to-end (no real Supabase session/user available in this environment).
- An actual bootstrap grant against a live database (no `PLATFORM_ADMIN_BOOTSTRAP_SECRET` configured, no live Supabase credentials).
- Whether `audit_logs` writes actually persist against the real database (same reason M1–M3 couldn't validate this — the M2 billing migration remains manually unapplied).
- Any Stripe-related behavior (unchanged by this milestone; not touched, not re-probed).

None of the above were fabricated or assumed successful.

## 21. Remaining risks

- **Deployment sequencing**: this fix must be deployed together with `PLATFORM_ADMIN_BOOTSTRAP_SECRET` set in the target environment, and the site owner must call `POST /api/admin/bootstrap` (with a valid session + the secret) *before or immediately after* the layout fix reaches production — otherwise the owner is locked out of `/admin/**` until they do. This is inherent to fixing a real gap where no admin has ever existed; there is no way to close the gap without this one manual step.
- `interview-topics/[id]/route.ts` still has no `PUT`/`DELETE` handlers (pre-existing, unrelated functional gap, not a security issue — flagged for awareness, not fixed here as out of scope).
- No rate limiting exists on the bootstrap secret comparison, consistent with how every other secret in this codebase (Stripe webhook signatures, etc.) is handled — cryptographic secrecy is the defense, not attempt-throttling. A determined attacker with a valid session and network access could brute-force the secret; a sufficiently long, random `PLATFORM_ADMIN_BOOTSTRAP_SECRET` value is required for this to remain safe (operational guidance, not a code gap).

## 22. Recommended Phase 18 Milestone 5

A real `.env.example` documenting every required/optional environment variable this codebase now depends on (Stripe keys, `PLATFORM_ADMIN_BOOTSTRAP_SECRET`, Supabase keys) — none currently exists, and this milestone's own audit had to reverse-engineer the convention from `.env.local`. Alongside it, a short operational runbook for the bootstrap step itself (who runs it, when, how the secret is rotated/removed post-bootstrap) would close the sequencing risk noted in §21 without adding any new code.
