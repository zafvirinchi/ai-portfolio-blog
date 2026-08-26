# Phase 23 — Milestone 3: Role-Aware SaaS Dashboard & Customer Journey Completion

## 1. Current Customer Journey (Before This Milestone)

Signup/login always landed every persona on the same flat default
(`/resume-analyzer` as of M1). The homepage had a Login/Sign Up CTA (M1)
but zero mention of either product (Job Seeker tools or Recruiter
Workspace). Critically, tracing the full identity chain (Part 5 below)
surfaced that **a self-signed-up user had no way to ever acquire the
RECRUITER role** — the Recruiter Workspace was reachable and browsable,
but every write action (post a job, import candidates, match, evaluate,
export, ...) rejected with `FEATURE_NOT_INCLUDED`, with no self-service
path out, not even by paying via Stripe checkout (see §3).

## 2. Authentication Flow

Traced every completion path: password login (`auth-service.ts`'s
`login()`), OAuth/SSO (`auth/callback/route.ts`), the three MFA-verify
routes (totp/email/backup-codes), and registration
(`auth-service.ts`'s `register()`). All six funnel through one shared
function, `finalizeLogin(req, userId)` — the correct, single place to add
persona-aware routing once, rather than duplicating the decision six
times (§14, Change 1).

## 3. RECRUITER Journey — the Central Finding

Verified precisely, end to end:

- `requireRecruiterId()` (`recruiter-auth.ts`) proves only "signed in" —
  `recruiter_id === auth.users.id`, no role check.
- GET routes (list jobs/candidates/dashboard/ranking) have **no**
  entitlement check at all — a JOB_SEEKER-only account can browse an
  (empty) Recruiter Workspace freely.
- Every write action independently calls `requireFeature(recruiterId,
  "recruiter.*")`. `getEntitlement()` → `resolveEffectivePlans()` only
  ever produces a plan entry for a role the user's `app_metadata.
  platform_roles` array already contains
  (`entitlement-service.ts:147-173`) — a JOB_SEEKER-only account
  produces zero `RECRUITER` plan entries, so every `recruiter.*` check
  resolves `NONE` and throws.
- **The only existing way to add `RECRUITER`** was
  `platform-admin-service.ts`'s `assignPlatformRole()`, reachable
  exclusively via an ADMIN-gated route
  (`/api/admin/platform/users/[userId]/roles`).
- Checked whether paying fixes this: `initiateCheckout()`
  (`platform-billing-service.ts:73-94`) validates only that the
  requested `planKey` is a real, Stripe-backed plan — it does **not**
  check the caller's current roles. A JOB_SEEKER-only user could
  successfully complete Stripe checkout for `RECRUITER_PRO`. But no
  webhook handler anywhere calls `setPlatformRoles`/`assignPlatformRole`
  — confirmed by grep, zero matches outside the admin/bootstrap
  services. Since `resolveEffectivePlans()` only ever inspects roles the
  user already has, that paid subscription would be silently ignored
  forever: **a customer could pay and receive nothing.**

This is a genuine, verified, severe defect — not an architecture
question. Fixed minimally (§14, Change 2): a new, narrow, self-target-only
`activateRecruiterPersona()` (additive, idempotent, hardcoded to
`RECRUITER`, never accepts a role parameter) plus a `POST
/api/persona/recruiter/activate` route and an activation prompt on
`/recruiter` itself. Once a user holds the role even on the FREE tier,
the existing checkout flow (already correct otherwise) starts working
normally for a paid upgrade too.

Every other step of Part 5's checklist was already correct and required
no fix: sign up → log in → reach `/recruiter` → create jobs → import →
match/evaluate → shortlist → interviews → analytics → export → billing
(`/settings/billing`, already role-scoped, see §9) → upgrade (`UpgradePrompt`,
already correct, see §10) all work exactly as designed for a caller who
holds the role — verified by direct route/service reads in M2 and
re-confirmed here.

## 4. JOB_SEEKER Journey

Fully self-service already, confirmed unchanged: default signup role is
always `["JOB_SEEKER"]` (`persona-service.ts`'s `resolvePlatformRoles()`
default), every job-seeker AI route is either anonymous-capable or
`getOptionalUserId()`-gated with zero organization dependency (re-grepped
`src/lib/ai/{linkedin,cover-letter,resume-rewriter,interview-prep,
mock-interview}/**` — zero `organization_id`/`tenantContext` references,
consistent with M2), and `/settings/billing` already renders only the
JOB_SEEKER plan card for a JOB_SEEKER-only account. No fix needed.

## 5. ADMIN Journey

Unchanged, verified unchanged: `requirePlatformAdmin()` still re-derives
`ADMIN` from `app_metadata` on every call, never cached; no nav link to
`/admin` exists anywhere (confirmed via `Navbar.tsx`'s static `links`
array — no admin entry), consistent with "do not expose admin
functionality publicly." Live-probed `GET /admin` unauthenticated →
307 to `/admin/login`, identical to before this milestone.

## 6. Organization / B2B Journey

Not touched. `/settings/organization`'s persona-aware banner (M1) is
unchanged. The one change in this area is presentational: `/billing`
(org billing)'s existing "Create an organization first" empty state now
also links back to `/settings/billing` for a user who landed there by
mistake looking for their own personal plan (§14, Change 5) — the org
gate/logic itself (`getTenantContext()`, `organizations.length === 0`)
is untouched.

## 7. Dashboard / Landing Routing

**Finding A confirmed and fixed.** Before this milestone, every
authentication-completion path used a flat `/resume-analyzer` default
regardless of persona. Added `resolveDefaultLandingPath(userId)`
(`persona-service.ts`) — `RECRUITER` (with or without `JOB_SEEKER` too,
multi-role included) → `/recruiter`; everyone else → `/resume-analyzer`.
Computed once inside `finalizeLogin()`, so password login, all three MFA
verify routes, and OAuth/SSO callback all agree without duplicating the
role lookup. `ADMIN`-only accounts still land on `/resume-analyzer` —
deliberately no special-cased admin landing, matching "ADMIN → existing
`/admin` behavior" (unchanged, reached via direct URL as before).

No new dashboard framework was introduced — `/resume-analyzer` and
`/recruiter` already ARE the correct, existing landing surfaces; this
milestone only routes users to the one that already matches their
persona.

**Deliberate scope decision**: `reset-password/page.tsx`'s post-reset
redirect stays a flat `/resume-analyzer` (not persona-aware) — a
low-frequency, secondary flow where adding a client-side role fetch
purely for this path wasn't justified by "smallest possible fix."

## 8. Navigation Audit

`Navbar.tsx`'s static links (Resume Analyzer, Job Match, Recruiter,
Billing, ...) are **not** persona-filtered, and this milestone leaves
them that way deliberately: every destination already self-gates
correctly server-side, and hiding a link from the "wrong" persona would
only hurt discovery (a job seeker might later want to hire, and vice
versa) without any security or correctness benefit — while ALSO costing
a `resolvePlatformRoles()` Admin API call on every authenticated page
view across the whole `(site)` route group, which M1 deliberately avoided
for the session-only auth CTA. Audited and confirmed already correct;
no fix applied here.

## 9. Billing UX Audit

`/settings/billing` was already well-built: plan cards, usage, and the
plan-comparison grid are all filtered to `overview.roles` — a
JOB_SEEKER-only account never even sees a RECRUITER plan card, and vice
versa (`settings/billing/page.tsx:325-326`) — and it already carries
clear on-screen disambiguation copy ("Your personal plan for Job Seeker
and Recruiter tools — separate from any organization's team billing",
line 214). **Two small, real gaps were found and fixed** (§14, Changes
4-5): the settings header's generic "Billing" link (→ org billing) read
as the same destination as the "My Billing" nav tab (→ personal billing)
sitting right next to it — relabeled "Organization Billing" for clarity.
And `/billing`'s own "Create an organization first" empty state had no
way to point a confused personal-plan user back to `/settings/billing` —
added one line with a link. Neither billing system's logic was touched.

## 10. Entitlement UX Audit

Already fully correct, no fix needed: `readEntitlementError()` +
`UpgradePrompt` correctly render distinct CTAs for `AUTH_REQUIRED`
("Sign In" → `/login`), `FEATURE_NOT_INCLUDED` (with a plan-name hint via
`findCheapestPlanGranting()`), and `QUOTA_EXCEEDED` (usage/reset info via
`describeResetDate()`) — confirmed by direct read of
`entitlement-client-error.ts` and `UpgradePrompt.tsx`. No `BILLING_
UNAVAILABLE` code exists anywhere, consistent with CLAUDE.md. One
observation, not a defect: before this milestone's fix, a JOB_SEEKER-only
user hitting `FEATURE_NOT_INCLUDED` on a `recruiter.*` action and
clicking "View plans & upgrade" would land on `/settings/billing` and
still see **no** RECRUITER plan card to upgrade into (§9's role-filtering
is correct behavior, but it meant this was a genuine dead end) — this is
exactly what §3's fix resolves; `UpgradePrompt` itself needed no change.

## 11. Multi-Role Behavior

Audited a hypothetical `JOB_SEEKER` + `RECRUITER` account: default
landing is now deterministically `/recruiter` (§7's priority). Both
product surfaces remain fully reachable (`Navbar`'s links are
role-blind, §8). `/settings/billing` renders both plan cards
simultaneously (`overview.roles` includes both, §9's `.filter()` loop
just runs twice). Neither role hides the other anywhere audited.
Organization UI does not appear "incorrectly" for this combination —
its visibility depends only on actual organization membership, never on
platform persona (M1/M2 finding, re-confirmed unchanged). No complex
role-switcher was introduced — a single deterministic default plus
already-universal nav access was sufficient, per the task's own
instruction not to invent one unless proven necessary.

## 12. Mobile Behavior

Confirmed M1's Login/Sign-Up/My-Account CTA is genuinely visible at
every breakpoint (it sits outside the `hidden md:flex` wrapper) — no
regression. **New finding**: the feature links themselves (Resume
Analyzer, Job Match, **Recruiter**, **Billing**, ...) were still `hidden
md:flex`-only, meaning a mobile visitor had no way to reach the Recruiter
Workspace or Billing except by typing the URL directly — exactly the gap
Part 11 asked to verify. Fixed with the smallest addition: `MobileNav.tsx`,
a plain disclosure toggle (`md:hidden`) reusing the identical `links`
array, no new routing/auth logic (§14, Change 6).

## 13. Security Validation

No server-side authorization was modified. Live-probed against the
running dev server, unauthenticated:

```
GET  /recruiter                          -> 307 -> /login?redirect=/recruiter        (unchanged)
GET  /admin                              -> 307 -> /admin/login                       (unchanged)
GET  /settings/billing                   -> 307 -> /login?redirect=/settings/organization (unchanged — settings/layout.tsx's own gate)
GET  /billing                            -> 307 -> /login?redirect=/billing           (unchanged)
GET  /api/ai/recruiter/jobs              -> 401 {"error":"You must be signed in..."}  (unchanged)
POST /api/persona/recruiter/activate     -> 401                                        (new route, correctly session-gated)
```

`POST /api/persona/recruiter/activate` is the one new authorization
surface introduced this milestone: it resolves identity exclusively via
`requireUserId()` (server session, never a request body/query/path
value), and the granted role is hardcoded to `"RECRUITER"` in source —
the route accepts no role parameter at all, so it structurally cannot be
used to self-grant `ADMIN` or act on another account. `recruiter_id`
derivation, recruiter ownership (`requireRecord()`), admin authorization,
platform entitlement checks, and organization authorization are all
byte-for-byte unchanged from M1/M2.

## 14. Genuine Defects Found & Changes Implemented

1. **Post-login landing was persona-blind (Finding A).**
   `persona-service.ts`: added `resolveDefaultLandingPath()`. `auth-
   service.ts`: `finalizeLogin()` now returns `{ defaultLandingPath }`;
   `login()`/`register()` propagate it. `auth-types.ts`: extended
   `LoginResult`/`RegisterResult`. Propagated through
   `/api/auth/login/route.ts` and all three MFA verify routes
   (totp/email/backup-codes). `auth/callback/route.ts`: uses
   `defaultLandingPath` only when no explicit `?redirect=` was supplied.
   `LoginForm.tsx`: `finish()` now takes the server-provided default;
   `handleOAuth` forwards only an explicit redirect, never a flattened
   one, so the callback's own default gets a chance to run.
2. **No self-service path to the RECRUITER role (Finding D, root
   cause).** `persona-service.ts`: added `activateRecruiterPersona()`
   (additive, idempotent, hardcoded to `RECRUITER`). New route: `POST
   /api/persona/recruiter/activate` (self-target-only via
   `requireUserId()`). `recruiter/page.tsx`: shows an "Activate your
   Recruiter Workspace" gate (via `/api/billing/platform/overview`'s
   already-existing `roles` field) instead of the normal dashboard for
   an account that doesn't yet hold the role, with a one-click activate
   button.
3. **Homepage had no Job Seeker/Recruiter value proposition or entry
   point (Findings D/E, discoverability).** New component
   `ProductEntryPoints.tsx` — two small cards, added directly after
   `HeroSection` on the homepage. Deliberately additive, not a homepage
   redesign — the portfolio identity (CLAUDE.md's own description of
   this app) stays first and dominant.
4. **`settings/layout.tsx` header "Billing" link ambiguous next to the
   "My Billing" nav tab (Finding F).** Relabeled "Organization Billing."
5. **`/billing`'s no-organization empty state had no way back to
   personal billing (Finding F).** Added one cross-link to
   `/settings/billing`.
6. **Recruiter/Billing nav entries unreachable on mobile (Finding H).**
   New `MobileNav.tsx` — a `md:hidden` disclosure toggle reusing the
   existing `links` array, wired into `Navbar.tsx`.

**Not fixed — audited and confirmed already correct or intentionally
unchanged**: `/settings` organization banner persona-awareness (M1,
re-verified unchanged), entitlement UX (`UpgradePrompt`, already
correct), `/settings/billing`'s existing role-scoping (already correct),
Navbar's role-blind top-level links (deliberate, see §8), admin exposure
(none added), organization/recruiter architectural separation (untouched,
per explicit instruction), `reset-password`'s flat redirect (deliberate
scope decision, see §7).

## 15. Tests

Added focused regression tests, no existing test weakened or removed:

- `persona-service.test.ts`: 3 tests for `activateRecruiterPersona`
  (additive grant, idempotent no-write-if-already-held, structurally
  cannot grant any role but RECRUITER) + 3 tests for
  `resolveDefaultLandingPath` (RECRUITER-priority for multi-role, plain
  JOB_SEEKER, ADMIN-only — no special-cased admin landing).
- New `src/app/api/persona/recruiter/activate/route.test.ts`: 3 tests
  (401 with no session, correct self-target activation, safe 422 with no
  internal detail leaked on unexpected failure).
- Added both new/extended files to `vitest.config.mts`'s `include`
  allowlist (the route test file; `persona-service.test.ts` was already
  listed).

No tests were manufactured for the areas confirmed already-correct and
left unchanged (Navbar role-blindness, entitlement UX, org/recruiter
separation) — per the task's own instruction.

## 16. Build / Lint / Type Validation

```
npx tsc --noEmit    -> clean, zero errors
npm run lint         -> 1 pre-existing warning (unrelated: <img> in blog/[slug]), 0 errors
npm test              -> 103 files, 1231/1231 tests passing (9 new)
npm run build         -> exit 0, all routes compiled, including the new /api/persona/recruiter/activate route
```

## 17. Live Probes

Run against the pre-existing `next dev` server on port 3000 (same server
used in M1, reflects current source via HMR):

- `GET /` (anonymous) — "For Job Seekers" / "For Recruiters" /
  "Analyze your resume" / "Open Recruiter Workspace" all present in the
  rendered HTML; mobile toggle button (`aria-label="Open menu"`,
  `md:hidden`) present.
- Unauthenticated security probes — see §13, all unchanged from
  pre-milestone behavior.

**Blocked, stated explicitly rather than fabricated**: end-to-end
verification of the persona-aware post-login redirect and the recruiter
activation banner both require a real authenticated session, which this
audit session does not have. The underlying logic was instead verified
by (a) direct source read of every call site, (b) the new unit tests in
§15 exercising the exact role-resolution logic those routes depend on,
and (c) a clean `tsc --noEmit` proving every call site's types agree.

## 18. Remaining Operational Prerequisites

Unchanged from Phase 21/22: the 14 pending Supabase migrations still need
manual application via the SQL Editor before `platform_subscriptions`/
`organizations`/etc. exist in a fresh environment; Stripe price IDs still
need configuring for both billing systems. Nothing in this milestone adds
a new prerequisite.

## 19. Product Recommendations

None requiring a further milestone. One item worth surfacing for product
awareness, not an engineering gap: `activateRecruiterPersona()` grants
the RECRUITER role on the FREE tier with no confirmation step or
onboarding beyond the single button — if the product later wants a
richer "tell us about your hiring needs" onboarding flow for new
recruiters, that would be a deliberate UX addition, not a fix to
anything broken today.

## Final Decision Rule Applied

Genuine routing/navigation/billing UX defects were found (§14, six
changes) and fixed minimally, each reusing existing services
(`persona-service.ts`, `entitlement-client-error.ts`'s existing
`UpgradePrompt` pattern, `/api/billing/platform/overview`'s existing
`roles` field) rather than inventing new architecture. No new database
schema, no new billing system, no organization dependency was introduced
into the Recruiter Workspace, and no existing server-side authorization
was weakened — confirmed by live probe (§13) and by the fact that every
change in §14 is additive UI/routing/copy, never a removed or loosened
check. No Milestone 4 is proposed. Nothing in this milestone has been
committed.
