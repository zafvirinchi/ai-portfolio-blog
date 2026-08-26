# Phase 23 — Milestone 1: Public Entry, Persona Routing & Role-Aware Onboarding Audit

## 1. Executive Summary

This milestone audited the path a visitor takes from the public homepage through
signup/login to their first authenticated screen, across all three platform
personas (JOB_SEEKER, RECRUITER, ADMIN). The audit found three genuine,
low-risk UX defects — no security defects, no entitlement defects, no
architecture defects. All three were fixed with the smallest correct change,
reusing existing services (`persona-service.ts`, `supabase-server.ts`) and
touching no server-side authorization logic. One genuine mismatch was found
between the task's assumed architecture and the actual codebase (see §7) and
is reported here rather than silently forced to fit.

No new milestone is proposed. Per the task's own "final decision rule," a
Milestone 2 is warranted only if a genuine unresolved defect remains — none
does.

## 2. Scope

In scope: the public homepage, `Navbar`/`Footer`, `/login`, `/signup`,
`/register`, `/auth/callback`, `/reset-password`, `/settings/**` layout and
its organization-onboarding banner, and the routing/redirect behavior after
authentication succeeds, for all three personas.

Out of scope (confirmed unaffected, not touched): entitlement/billing logic,
recruiter/candidate ownership filters, admin authorization, the organization/
SaaS system's own internal pages (team, workspaces, invites), the legacy
unauthenticated `recruitment` pipeline.

## 3. Methodology

Audit-first: every finding below is backed by a direct source read (file +
line) or a live HTTP probe against a running `next dev` server on port 3000,
never assumption or memory from a prior phase. No fix was made until the
underlying claim was verified against current source.

## 4. Part 1 — Homepage Entry Point Audit

**Finding (genuine defect):** `Navbar.tsx` had no Login/Sign Up entry point
at all, and its entire link block was wrapped in `hidden md:flex` with no
mobile alternative — a mobile visitor saw no navigation whatsoever, and no
visitor, mobile or desktop, saw any way to authenticate from the homepage.

**Fix:** `Navbar.tsx` converted to include an async `AuthCta` sub-component
that resolves the Supabase session (`createSupabaseServerClient().auth.getUser()`
— the same cheap pattern already used by `settings/layout.tsx` and
`recruiter/layout.tsx`, not a new pattern) and renders Login/Sign Up links for
anonymous visitors or a "My Account" link (→ `/settings/profile`) for
authenticated ones. Placed outside the `hidden md:flex` wrapper so it is
visible at every breakpoint. Deliberately a session check only, not a full
persona resolution — this component renders on every page in the `(site)`
route group, and persona resolution is a heavier, Admin-API-backed call that
this decision doesn't need.

**Verified live:** `curl http://localhost:3000/` (anonymous) returns
`href="/login"` and `href="/signup"` in the rendered HTML.

## 5. Part 2 — Auth Flow Trace

Traced: homepage → `/login` or `/signup` → `LoginForm`/`SignupForm` →
`/api/auth/login` or `/api/auth/register` → `auth-service.ts` →
Supabase Auth → (`/auth/callback` for OAuth) → client-side `redirectTo` →
destination page.

**Finding (genuine defect):** the default post-auth `redirectTo` fallback
(used whenever no explicit `?redirect=` query param is present) was
`/settings/organization` in four generic, non-org-specific call sites. This
sends every newly authenticated user — including a plain JOB_SEEKER who has
no interest in organizations — straight into org-onboarding UI.

**Fix:** changed the default fallback from `/settings/organization` to
`/resume-analyzer` in exactly these four files:
- `src/components/saas/SignupForm.tsx`
- `src/components/saas/LoginForm.tsx`
- `src/app/auth/callback/route.ts`
- `src/app/(auth)/reset-password/page.tsx`

Seven other occurrences of `/settings/organization` were identified and
deliberately left unchanged because they are legitimately org-specific
navigation, not generic post-auth defaults: `InviteActions.tsx`,
`settings/organization/page.tsx`, three occurrences inside
`settings/layout.tsx` itself (nav item, its own login-redirect target, header
link), and two inside `billing/layout.tsx`.

**Design decision — scope kept minimal:** considered making the redirect
persona-aware (RECRUITER → `/recruiter`, else → `/resume-analyzer`) for both
the OAuth callback and password-login paths. Decided against it: a recruiter
landing on `/resume-analyzer` is not blocked — the "Recruiter" link is now
visible in the navbar/homepage regardless — so the added complexity (a new
field on `login()`'s return shape, a new persona-resolution call on every
login) was not justified by the task's own repeated "smallest correct fix"
instruction. A flat, uniform default was used everywhere instead.

**Verified live:** unauthenticated GET to `/settings/organization` still
307-redirects to `/login?redirect=/settings/organization` — the one
`settings/layout.tsx`-internal occurrence — confirming this specific
call site was correctly left untouched.

## 6. Part 3 — `/settings` Organization UX Audit

Read `src/app/settings/layout.tsx`, `src/app/settings/organization/page.tsx`,
`src/app/api/saas/me/route.ts` in full.

**Finding (genuine defect, not a hard block):** the "Create your first
organization" banner's only condition was `organizations.length === 0` —
persona-blind. It is not a functional block (verified via
`src/app/api/billing/platform/overview/route.ts`, which uses only
`requireUserId()` with zero organization dependency — see §9), but it is
confusing: every JOB_SEEKER who has never created an org sees an "onboarding"
prompt for a feature they will never use.

**Fix:** `settings/layout.tsx` now resolves the caller's persona via
`resolvePlatformRoles(user.id)` (reusing `user.id`, already resolved by the
existing `supabase.auth.getUser()` call — no redundant session resolution)
and only shows the banner when `isRecruiter(roles) || isAdmin(roles)`. The
"Organization" nav tab itself remains reachable by everyone, unchanged — a
JOB_SEEKER who deliberately navigates there still can.

**Verified:** TSC/build confirm `resolvePlatformRoles`/`isRecruiter`/
`isAdmin` signatures match the call site exactly. Authenticated-session live
verification of the banner itself is **BLOCKED** — no real login cookie was
available to this audit session (see §14).

## 7. Part 6 — Recruiter Organization Requirements: Architecture Mismatch

The task's framing assumed a "RECRUITER → organization/company context where
required" model. Direct source tracing disproves this for the *current*
codebase: `src/lib/ai/recruiter/candidate-service.ts`,
`recruiter-job-service.ts`, and `recruiter-auth.ts` were grepped for
`organization_id`/`organizationId` — **zero matches**. Every recruiter query
is scoped by `.eq("recruiter_id", recruiterId)` directly against the
session-derived individual recruiter, with no organization relationship
anywhere in the recruiter data model.

This is reported honestly rather than force-fitted: the organization/SaaS
system (Phase 14) and the recruiter workspace (Phase 13/19) are two
independent systems that happen to share a settings shell, not a layered
persona-over-org model. No fix was applicable here because there is no
defect — the recruiter workspace does not require, use, or reference an
organization at all today. `settings/layout.tsx`'s banner change in §6 is
scoped to persona only, not to any actual recruiter/org data dependency,
because none exists.

## 8. Part 5 — JOB_SEEKER Feature Independence (Spot-Verified)

Grepped `src/lib/ai/{linkedin,cover-letter,resume-rewriter,interview-prep,mock-interview}/**/*.ts`
for `organization_id`, `organizationId`, `tenantContext`, `getTenantContext`
— **zero matches** across all five feature families. Confirms these remain
fully ephemeral, session-based, and organization-independent, consistent with
CLAUDE.md's own architecture description. No fix needed.

## 9. Part 9 — Billing/Entitlement Relationship

`src/app/api/billing/platform/overview/route.ts` (27 lines, read in full)
calls only `requireUserId()` — no organization/tenant dependency anywhere.
This is conclusive, direct proof that the platform (per-user) billing system
that governs every `/api/ai/**` feature has zero relationship to the
organization system. The two billing systems remain correctly separate, per
CLAUDE.md's explicit architecture rule; nothing here was touched.

## 10. Part 7/8/10 — Admin Security, Multi-Role Behavior, Server-Side Authz

None of this milestone's changes touch server-side authorization:
- `Navbar.tsx`'s `AuthCta` performs a session read only (`auth.getUser()`),
  no role decision, no gate.
- `settings/layout.tsx`'s `!user` redirect gate is byte-for-byte unchanged;
  only the *banner rendered after* that gate was made persona-aware.
- The four redirect-default changes affect only where an already-authenticated
  browser is sent next — they do not change what "authenticated" means or
  what any route protects.
- Copy-only changes (see §11) do not touch logic.

**Verified live:** `GET /recruiter` → 307, `GET /admin` → 307 (both still
redirect an unauthenticated caller exactly as before). Admin's unconditional
plan/quota bypass and recruiter's `recruiter_id`-scoped `requireRecord()`
pattern were not modified by this milestone and were not re-audited from
scratch here, since no change in this milestone touches either.

## 11. Additional Fix: Persona-Blind Auth-Page Copy

While tracing Part 2, `/login`, `/signup`, and `/register` were found to have
copy that only mentions organizations/workspaces/teams ("Sign up to create or
join organizations and workspaces," "Log in to manage your organizations,
workspaces, and team") — misleading for the JOB_SEEKER majority of visitors.
Fixed as a minimal text-only change in all three page files to mention the
actual tools (resume, interview prep, recruiter) while still surfacing the
organization option for those who need it. No logic changed.

## 12. Files Changed (This Milestone)

```
src/components/layout/Navbar.tsx           — session-aware auth CTA, always-visible
src/app/settings/layout.tsx                — persona-aware org-onboarding banner
src/components/saas/SignupForm.tsx         — default redirect -> /resume-analyzer
src/components/saas/LoginForm.tsx          — default redirect -> /resume-analyzer
src/app/auth/callback/route.ts             — default redirect -> /resume-analyzer
src/app/(auth)/reset-password/page.tsx     — default redirect -> /resume-analyzer
src/app/(auth)/login/page.tsx              — persona-neutral copy
src/app/(auth)/signup/page.tsx             — persona-neutral copy
src/app/(auth)/register/page.tsx           — persona-neutral copy
```

(`src/lib/auth/{audit-auth,auth-service,password-service,security-service,session-service}.ts`,
`vitest.config.mts`, and the three new `src/lib/auth/*.test.ts` files were
modified in the prior "auth bookkeeping crash" fix, immediately before this
milestone began — unrelated to Phase 23 M1, unchanged again here.)

## 13. Regression Test Coverage

No new `.test.ts`/`.test.tsx` files were added for this milestone's changes.
Per CLAUDE.md's explicit testing standard, this repo has **no
component/UI test infrastructure** (no React Testing Library, no
`.test.tsx` files anywhere) and UI changes are verified by direct code
reading plus live-probing a running `next dev` server — not by fabricating a
new test category this repo doesn't use. Every change in this milestone is
presentational/routing-default UI, not a new unit-testable function, so this
convention applies directly. The 13 scenarios in the original task's Part 12
were verified as follows instead:

| Scenario | Method | Result |
|---|---|---|
| Homepage exposes Login | Live probe (`curl /`) | ✅ `href="/login"` present |
| Homepage exposes Sign Up | Live probe (`curl /`) | ✅ `href="/signup"` present |
| Authenticated user gets correct CTA | Code read (`AuthCta`, session branch) | ✅ verified in source; live probe BLOCKED (§14) |
| JOB_SEEKER doesn't require org | Code read (`/api/billing/platform/overview`) | ✅ zero org dependency |
| JOB_SEEKER doesn't see org onboarding unnecessarily | Code read (`settings/layout.tsx` persona gate) | ✅ verified in source; live probe BLOCKED (§14) |
| JOB_SEEKER can access personal billing | Code read (unchanged, pre-existing) | ✅ unaffected |
| RECRUITER retains org workflow | Code read (banner still shows for `isRecruiter`) | ✅ unaffected |
| RECRUITER retains workspace access | Live probe (`/recruiter` → 307 unauthenticated, as before) | ✅ unaffected |
| JOB_SEEKER cannot call recruiter APIs | Not touched by this milestone | ✅ unaffected (no change) |
| Non-admin cannot access admin APIs | Live probe (`/admin` → 307) | ✅ unaffected |
| ADMIN behavior unchanged | Code read (`isAdmin` bypass logic untouched) | ✅ unaffected |
| Existing entitlement checks unchanged | No entitlement file touched | ✅ unaffected |
| Multi-role behavior unchanged | `isRecruiter`/`isAdmin` are independent OR-checks, unchanged | ✅ unaffected |

## 14. Blocked Verification

Authenticated end-to-end verification (logging in as an actual JOB_SEEKER vs
RECRUITER account and observing the settings banner / CTA rendering) is
**BLOCKED** — no real user session/cookie was available to this audit
session. This is stated explicitly rather than fabricated. The underlying
logic was instead verified by direct source read and by confirming the exact
function signatures (`resolvePlatformRoles`, `isRecruiter`, `isAdmin`) match
the new call site, plus a clean `tsc --noEmit`.

## 15. Validation Results

```
npx tsc --noEmit    → clean, zero errors
npm run lint         → 1 pre-existing warning (unrelated: <img> in blog/[slug]), 0 errors
npm test              → 102 files, 1222/1222 tests passing
npm run build         → exit 0, all routes compiled (see full route list in build output)
```

Live probes against a running `next dev` server (port 3000):
- `GET /` → Login/Signup links present in HTML (unauthenticated)
- `GET /settings/organization` (unauthenticated) → 307 to `/login?redirect=/settings/organization` (unchanged)
- `GET /recruiter` (unauthenticated) → 307 (unchanged)
- `GET /admin` (unauthenticated) → 307 (unchanged)
- `GET /signup`, `/login`, `/register` → updated copy confirmed present in rendered HTML

## 16. Security Review

No change in this milestone alters: identity resolution, entitlement checks,
recruiter/candidate ownership filters, admin bypass logic, Stripe webhook
handling, or Supabase query filters. Every change is either (a) a session
*presence* check for CTA rendering, (b) a persona check for *banner
visibility* (not access control — the underlying route/data were never
gated by organization membership to begin with), or (c) a client-side
navigation default. No `BILLING_UNAVAILABLE`-style new error code, no new
entitlement path, no new billing system, no RLS change, no auth weakening.

## 17. Final Decision Rule Applied

Per the task's own rule: fixes were made only where a genuine defect was
proven (homepage lacked Login/Signup → fixed; JOB_SEEKER unnecessarily saw
org onboarding → fixed; generic post-auth redirect defaulted into org
onboarding → fixed). No separate dashboard architecture was introduced. No
change was made to recruiter/admin authorization. No self-selectable ADMIN
role was introduced. No new migration or dependency was added.

## 18. Milestone 2 Recommendation

**Not proposed.** No unresolved genuine defect remains from this audit. The
one open item — authenticated E2E verification of the persona-aware banner —
is a verification gap, not a code defect, and does not on its own justify a
further engineering milestone.

## 19. Sign-Off

All findings audited from current source, all fixes minimal and reusing
existing services, all validation (tsc/lint/tests/build/live probes) passing
or explicitly marked blocked where genuinely blocked. Nothing in this
milestone has been committed, per instruction.
