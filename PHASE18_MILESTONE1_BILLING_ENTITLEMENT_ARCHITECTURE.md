# Phase 18 — Milestone 1: Billing, Plans & Entitlement Architecture

## 1. Audit findings

Before writing any code, the following were read in full: `src/lib/billing/*` (Phase 14 M3 — plans/subscriptions/credits/payments/invoices/coupons), `src/lib/saas/*` (Phase 14 M1 — organizations/members/tenant-context), `src/lib/ai/usage/*` (Phase 14 M4 — LLM usage metering), every `supabase/migrations/*.sql` file, `src/app/(auth)/admin/login`, and every route currently wired into either metering system.

**The single most important finding: a complete, real billing/subscription/credit system already exists (Phase 14) — but it is ORGANIZATION-scoped end to end, and organizations are never auto-created.**

- `subscriptions.organization_id` is `not null`; `getActiveSubscription(organizationId)` (subscription-service.ts) is the existing `resolveEffectivePlan`-equivalent, already returning a virtual "implicit Free" plan when no row exists — exactly Step 7's required pattern, already built, for organizations.
- `credit-service.ts`'s `checkCredits()`/`consumeCredits()` — the existing quota-enforcement layer for 7 features (`resume_upload`, `resume_rewrite`, `jd_match`, `ats_report`, `mock_interview`, `ai_chat`, `knowledge_upload`) — are **explicit, documented no-ops whenever no organization resolves** ("Pure no-op... whenever there's no resolvable organization — every anonymous request today, and every logged-in user with no organization").
- `withUsageContext()` (`usage/usage-context.ts`) has the identical no-op-when-no-org behavior, by the same design.
- Organizations are only ever created via an explicit user action (`POST /api/saas/organizations`) — never auto-provisioned at signup. Confirmed by reading the entire `(auth)/*` flow and `tenant-context.ts`'s own doc comment: "every existing public AI route stays fully anonymous-usable."

**Conclusion:** the existing system fully covers B2B/team billing, but has **zero effect on the vast majority of actual product usage** — every anonymous ephemeral-tool session (resume analyzer, job match, interview prep, mock interview — all of Phase 13/16/17) and every individual signed-in user who has never created/joined an organization. This is exactly the gap Phase 18 M1 describes (JOB_SEEKER/RECRUITER personas, individual plans) — a genuinely separate, non-overlapping axis from the existing org billing, not a rebuild of it.

**Second finding — a real, pre-existing security gap, documented but NOT touched in this milestone (see §11):** every `/admin/*` API route's `requireAdmin()` helper only checks "is there an authenticated Supabase session" — there is no actual role check anywhere, and no `middleware.ts` exists to restrict `/admin` paths. Any self-registered user (via the public `/signup` page) can currently reach `/admin` analytics routes. Fixing this is out of scope for this architecture-only milestone (it would require touching ~9 existing admin routes, well beyond "select 1-2 representative routes"), but the new `isAdmin()`/`resolvePlatformRoles()` primitives built here are exactly what a future milestone should use to fix it.

**Third finding — no `profiles`/`users` table, no platform role column anywhere.** Confirmed via every `create table` statement across all 13 migrations. `organization_roles`/`organization_members` are strictly org-scoped (owner/admin/member within one org), not a platform-wide persona. The PlatformRole model this milestone builds is a genuine, real gap.

**Fourth finding — `resume_version_service.getVersion(userId, resumeVersionId)` correctly scopes by `.eq("id", ...).eq("user_id", userId)`, and `userId` is always server-derived via `requireUserId()`, never from the request body.** Re-verified, no issue found.

## 2. Existing functionality reused

- **Conventions, not code**: no RLS (application-level enforcement via `supabaseAdmin`, matching every existing table), snake_case DB columns, `if not exists`/idempotent migrations requiring manual application (this repo has no migration tooling), the "implicit Free, never a fabricated subscription" pattern from `subscription-service.ts`, and the graceful "fall back to a safe default on ANY query failure, including a pre-migration missing table" pattern from `plan-service.ts`/`credit-service.ts` — all directly mirrored in the new code.
- **`SubscriptionStatus`** (`billing-schema.ts`) is re-exported as-is by `platform-schema.ts`, not redefined — `trialing/active/past_due/canceled/grace_period` is exactly the right vocabulary for a user's plan status too.
- **`supabaseAdmin.auth.admin.getUserById()`/`updateUserById()`** — already an established pattern (`team-service.ts`, `user-analytics.ts`, `auth-service.ts`) — reused directly for role storage (see §5) instead of a new table.
- **`resume-version-auth.ts`'s `requireUserId()` precedent** ("Resume versions are personal, not organization-scoped... a logged-in user with no organization can still have resume versions") is the direct model for `persona-service.ts`'s `getOptionalUserId()`.
- **`credit-service.ts`'s exact no-op-when-absent shape** is mirrored by the new per-user checks in the two representative routes — additive, side by side, never replacing the existing org-level check.

## 3. Genuine gaps filled

1. No platform persona/role model existed at all.
2. No feature registry existed — no typed, centralized list of what's monetizable.
3. No individual-user plan/entitlement resolution existed — the org-scoped one doesn't apply to individual usage.
4. No usage-metric abstraction existed for individual (non-org) usage.
5. No admin-override mechanism existed for granting/revoking access outside a plan.

## 4. Personas

```ts
type PlatformRole = "JOB_SEEKER" | "RECRUITER" | "ADMIN";
```

Always an array (`PlatformRole[]`), never a single field — a user can hold more than one. Stored in Supabase Auth's own `app_metadata` (`platform_roles`), **not a new table**: `app_metadata` can only be written through the service-role Admin API (`supabaseAdmin.auth.admin.updateUserById`), never through the client SDK's `updateUser()` — so "roles are server-derived, never client-writable" (Step 2) is a structural guarantee of the storage location itself, not something application code has to enforce by convention. Every user defaults to `["JOB_SEEKER"]` when `app_metadata` has no roles at all, or on any lookup failure (least-privilege default). ADMIN must be explicitly granted (via `setPlatformRoles()`, not exposed to any route in this milestone).

## 5. Plans

```
JOB_SEEKER_FREE / JOB_SEEKER_PRO / JOB_SEEKER_PREMIUM
RECRUITER_FREE / RECRUITER_PRO / RECRUITER_BUSINESS
```

ADMIN has no plan key — a privileged role, never a commercial tier (`getDefaultPlanForRole("ADMIN")` returns `null`; `entitlement-service.ts` short-circuits to full access for ADMIN before the plan matrix is ever consulted). Defined as a pure, static, in-code catalog (`platform-plan-registry.ts`) — **deliberately not persisted to a database table** this milestone, since (a) no user-level subscription row exists yet to need a real foreign key to a `plans.id`, and (b) every limit is explicitly provisional (see §8). Every limit/number in the matrix is a documented architecture default, not a commercial pricing decision.

## 6. Feature registry

24 typed `FeatureId`s across 4 categories (resume, job, interview, recruiter) — the exact list from the milestone's own Step 4, verbatim. `FEATURE_REGISTRY` attaches a label/category/primary-persona to each. Every entitlement check in the codebase uses these typed ids; no arbitrary string is ever passed to `requireFeature()`/`canAccess()`.

## 7. Usage model

```ts
type UsageMetric = "ATS_CHECKS" | "JD_MATCHES" | "AI_REWRITES" | "INTERVIEW_PREPARATIONS" | "MOCK_INTERVIEWS" | "RECRUITER_CANDIDATES" | "RECRUITER_EXPORTS";
type UsagePeriod = "DAY" | "MONTH" | "LIFETIME";
```

A metric's usage pool is shared across every feature that draws on it (e.g. `resume.jd.match`, `job.match`, and `job.analyzer` all draw from `JD_MATCHES`) — `checkQuota()` resolves the most permissive entitlement across every feature using a metric, then measures real usage against that. Usage is recorded to a new, minimal `platform_usage_events` table **only after the real billable operation has actually succeeded** — never on a validation failure, an auth failure, or a rejected `requireFeature()`/`requireQuota()` call (verified directly in both representative integrations, §12).

## 8. Entitlement model

`FeatureEntitlementDefinition = { access: "NONE" | "LIMITED" | "UNLIMITED", metric?, limit?, period? }` — one shape covers all three of Step 5's required types (boolean, usage-limited, unlimited).

Resolution order in `getEntitlement(userId, featureId)`, highest authority first:
1. **ADMIN role** → full `UNLIMITED` bypass.
2. **An active `REVOKED` override** → `NONE`, even if the plan would allow it.
3. **An active `GRANTED` override** → `UNLIMITED`, even if the plan would deny it.
4. **The most permissive of the user's resolved plans** (multi-role support — Step 2).

Every step is server-derived; `getEntitlement`/`canAccess`/`requireFeature`/`checkQuota`/`requireQuota` take only a `userId` — there is no parameter through which a plan, role, entitlement, or usage count could be supplied by a caller.

## 9. Plan resolution

`resolveEffectivePlans(userId)` returns one `ResolvedPlatformPlan` **per resolved role** (plural — Step 2's multi-role requirement), each with `isImplicitFree: true` this milestone (no payment provider exists yet to ever make it `false` — mirrors `ResolvedSubscription.isImplicitFree` exactly). No fake subscription is ever fabricated; FREE is always the correct, honest answer today.

## 10. Quota model

`checkQuota(userId, metric)` → `{ allowed, used, limit, period, remaining }`; `limit`/`remaining` are `null` for unlimited access, never a fabricated large number. Boundary behavior (verified by tests, §16): below limit → allowed; **exactly at** limit → denied (`used >= limit`); above limit → denied; unlimited → always allowed, usage still tracked for visibility.

## 11. Admin override model

`platform_entitlement_overrides` — one row per grant/revoke, with `expires_at` (null = permanent), `revoked_at` (manual deactivation without deleting the audit trail), and `granted_by` (always the acting admin's own server-derived userId). `grantFeatureOverride()`/`revokeFeatureOverride()` both re-verify the **acting** user resolves as ADMIN via `resolvePlatformRoles()` — server-side, every call, never trusted from a caller. Neither function, nor any override-management route, is exposed to any client-facing endpoint in this milestone (no admin UI was built, per the explicit instruction).

## 12. Security model

Verified against every item in Step 14:
1–3. Client cannot choose a plan/role/usage — none of these are ever accepted as a parameter anywhere in `entitlement-service.ts`; every value is re-derived from `resolvePlatformRoles()` (Supabase `app_metadata`) and `platform_usage_events` (queried by server-derived `userId`).
4–5. `requireFeature()`/`requireQuota()` cannot be bypassed via an alternate route — both representative integrations call them before any billable work executes.
6. ADMIN is resolved exclusively via `app_metadata`, writable only through the service-role Admin API.
7–8. Recruiter/job-seeker entitlements are scoped by resolved role, never mixed unless the account genuinely holds both roles.
9. Cross-user access: every function takes only a `userId`; there is no code path where resolving user A's entitlement could read or leak user B's state (verified directly by a dedicated cross-user isolation test, §16).
10. Usage is recorded only after real success (§7) — a rejected/failed request never consumes quota, verified in both representative integrations.

## 13. Database decision

Two new tables, both genuinely required for the architecture to be real rather than fake (`supabase/migrations/20260816000000_add_platform_entitlement_tables.sql`):

- **`platform_entitlement_overrides`** — the one piece of entitlement state that must be persisted even before any payment provider exists (promotional/beta/enterprise access). Indexed on `(user_id, feature_id)`.
- **`platform_usage_events`** — one row per successfully-completed billable operation, minimal columns (`user_id, metric, occurred_at`), counted by period via range queries. Indexed on `(user_id, metric, occurred_at desc)`.

**Deliberately NOT created**, per Step 13's own instruction to build only the minimum: a user-level `subscriptions` table (no real subscription can exist without a payment provider — FREE is always correct without one), `billing_events`, `subscription_items`, or any payment/transaction table, and the plan catalog itself (pure in-code data, no table needed since nothing references it by foreign key yet). No RLS, matching every existing table in this project — enforcement is entirely application-level. This migration, like every other in this repo, requires manual application to live Supabase (no migration tooling exists).

## 14. Representative integrations

Two routes, exactly as recommended (Step 16):

- **`POST /api/ai/resume`** (ATS score / resume analysis) — `requireQuota(userId, "ATS_CHECKS")` before the work, `recordUsage(userId, "ATS_CHECKS")` only after real success.
- **`POST /api/ai/mock-interview`** (start a mock interview session) — `requireQuota(userId, "MOCK_INTERVIEWS")` before the work, `recordUsage(userId, "MOCK_INTERVIEWS")` only after real success.

Both are **additive**, sitting alongside the existing organization-scoped `checkCredits()`/`consumeCredits()` calls, never replacing them. Both resolve the acting user via `getOptionalUserId()` (mirrors `credit-service.ts`'s own no-op-when-absent precedent exactly): when no real Supabase session exists — every anonymous request, which is the overwhelming majority of traffic to both routes today — the new check is never even called, and behavior is byte-for-byte identical to before this milestone. Verified live (§18): an anonymous request without a session produces the exact same 400/422 responses it did before this milestone touched these files.

## 15. Future Stripe/payment integration boundary

Nothing in this milestone talks to Stripe or any payment provider, builds checkout, or builds a billing dashboard UI — all explicitly out of scope. The boundary for a future milestone: `resolveEffectivePlans()` currently always returns the FREE tier per role; once a payment provider exists, a real user-level subscription table (deliberately not built here) would let it return a paid `planKey` instead — every other function (`getEntitlement`, `checkQuota`, `requireFeature`, etc.) needs no change, since they already read whatever `resolveEffectivePlans()`/the plan matrix say.

## 16. Future billing dashboard contract

```ts
interface BillingOverview {
  roles: PlatformRole[];       // plural — Step 2's own requirement
  plans: PlatformPlanKey[];
  status: SubscriptionStatus;
  isImplicitFree: boolean;
  features: FeatureEntitlementSummary[];
  usage: UsageSummary[];
  renewalDate?: string;        // always undefined until a real subscription exists
  cancelAtPeriodEnd?: boolean; // always undefined until a real subscription exists
}
```

Implemented as `getBillingOverview(userId)` in `entitlement-service.ts` — a plain function, **no API route was added for it** (consistent with "do not build the billing dashboard yet"); a future M3 wires this into a route and UI. Deliberately deviates from the milestone's own illustrative `role`/`plan` singular fields, in favor of Step 2's explicit multi-role architectural requirement, which the example predates in the same document.

## 17. Files added

- `src/lib/billing/platform-schema.ts`
- `src/lib/billing/persona-service.ts` (+ `.test.ts`)
- `src/lib/billing/feature-registry.ts`
- `src/lib/billing/platform-plan-registry.ts` (+ `.test.ts`)
- `src/lib/billing/entitlement-overrides-service.ts`
- `src/lib/billing/usage-event-service.ts`
- `src/lib/billing/entitlement-service.ts` (+ `.test.ts`)
- `supabase/migrations/20260816000000_add_platform_entitlement_tables.sql`

## 18. Files modified

- `src/lib/billing/index.ts` — namespaced re-exports for the new modules (avoids collisions with the existing org-scoped exports, same pattern already used for `invoiceService`/`paymentService`/`couponService`).
- `src/app/api/ai/resume/route.ts` — representative integration (§14).
- `src/app/api/ai/mock-interview/route.ts` — representative integration (§14).
- `vitest.config.mts` — added the 3 new test files to `include` (scoped narrowly, not a blanket `src/lib/billing/**`).

## 19. Tests

45 new tests across 3 files:

- **`platform-plan-registry.test.ts`** (9 tests) — matrix structural consistency (every `LIMITED` entry has a real metric/limit/period, `UNLIMITED`/`NONE` never carry stray fields), role/category isolation (recruiter plans never grant job-seeker features and vice versa), monotonicity (a higher tier is never more restrictive than its own FREE tier), and `getDefaultPlanForRole`'s FREE-always/ADMIN-null behavior.
- **`persona-service.test.ts`** (11 tests) — default-to-JOB_SEEKER, real roles returned, invalid/foreign values silently dropped, graceful failure fallback, `isAdmin`/`isRecruiter`, `setPlatformRoles`' Admin-API-only write path, and `getOptionalUserId`'s null-when-anonymous behavior.
- **`entitlement-service.test.ts`** (25 tests) — plan resolution (FREE default, multi-role, ADMIN-null), feature access (allowed/denied, recruiter-vs-job-seeker isolation, multi-role most-permissive, ADMIN bypass, override grant/revoke precedence), `requireFeature`, quota boundaries (below/exactly-at/above limit, unlimited, zero-entitlement, period reporting), `requireQuota`'s `QuotaExceededError`, `recordUsage`, `getUsage` across all 3 periods, admin-override authorization (including the explicit forged-role rejection test), cross-user isolation, and the billing overview contract's no-fabrication guarantee.

## 20. Full test result

- Before this milestone: **929/929** passing (Phase 17 baseline).
- After this milestone: **974/974** passing (72 test files) — 45 new tests, 0 regressions.

## 21. TypeScript / lint / build results

- `npx tsc --noEmit` — 0 errors.
- `npm run lint` — 0 errors, 1 pre-existing warning unrelated to this milestone.
- `npm run build` — succeeds; every existing route (including `/resume-analyzer`, `/mock-interview`) still compiles and is present in the build's route listing.

## 22. Live validation

Production server (`npm run start`) probes:

```
GET /resume-analyzer                                                          → 200
GET /mock-interview                                                           → 200
POST /api/ai/mock-interview (anonymous, missing fields)                       → 400 {"error":"resumeId is required"}   (unchanged from before this milestone)
POST /api/ai/resume (anonymous, no file)                                      → 400 {"error":"A resume file is required"} (unchanged)
POST /api/ai/mock-interview (anonymous, fake resumeId/jdMatchId)              → 422 {"error":"Resume not found or expired — please re-upload your resume."} (unchanged — never blocked by the new entitlement check)
```

Confirms the core safety requirement: anonymous requests to both representative routes behave byte-for-byte identically to their pre-milestone behavior. No sensitive data leaked in any response. Server was cleanly stopped after validation.

**Not executed, and not claimed**: no authenticated end-to-end walkthrough (a real signed-in user hitting their FREE-tier limit and receiving a real 402) was performed — this requires a live Supabase user session, consistent with the documented environment limitation in every prior milestone. The full quota/entitlement logic was instead verified via the unit test suite (§19), including explicit below/at/above-limit boundary tests.

## 23. Known limitations

- The pre-existing `/admin` route authorization gap (§1) was found but not fixed — out of scope for this architecture-only milestone; the new `isAdmin()` primitive is ready for a future milestone to use there.
- No admin UI exists yet to actually grant/revoke overrides or assign RECRUITER/ADMIN roles — `setPlatformRoles()`/`grantFeatureOverride()`/`revokeFeatureOverride()` are real, tested, callable functions with no route wired to them yet (intentional — "do not build the admin UI yet").
- Plan limits are provisional architecture defaults, explicitly not pricing decisions (documented throughout `platform-plan-registry.ts`).
- Only 2 of the ~11 routes currently wired into the org-scoped credit system have a parallel individual-user check — intentional, minimal-risk scope per Step 16; every other route is documented here as a future integration point following the identical pattern.
- No authenticated live E2E was run (§22) — same documented limitation as every prior Phase 17/18 milestone in this session.

## 24. Milestone classification

**C — Entitlement architecture ready for payment integration.**

The centralized service is real (not a stub), every function is server-authoritative, the plan/feature/usage model is complete and extensible, two representative routes prove the wiring end-to-end without altering any existing behavior, and the full test suite (45 new, 974/974 total) exercises the actual decision logic including security-sensitive paths (forged-role rejection, cross-user isolation, quota boundaries). What remains — Stripe integration, checkout, the billing dashboard UI, and retrofitting more routes — is exactly the follow-on work this milestone was scoped to enable, not evidence that the architecture itself is incomplete.

## 25. Recommended Phase 18 Milestone 2

**Payment Provider Integration (Stripe) for the Platform Entitlement Layer** — introduce a real user-level subscription record (informed by this milestone's explicit note in §15 on exactly what `resolveEffectivePlans()` needs to support one), wire Stripe checkout/webhooks for the 6 commercial `PlatformPlanKey` tiers (reusing `billing/stripe-provider.ts`'s existing adapter pattern rather than a second Stripe integration), and extend `platform_usage_events`/`platform_entitlement_overrides` only if real usage reveals a genuine need — following the same audit-first, reuse-first, minimal-new-infrastructure discipline this milestone established.
