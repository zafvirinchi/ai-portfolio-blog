# Phase 26 — Milestone 1: Production SaaS End-to-End User Journey & Launch Readiness Audit

## 1. Executive Summary

A full, evidence-based audit of both major product journeys (Job Seeker, Recruiter) plus cross-cutting security, billing, AI-failure, error-state, mobile, production-configuration, legal, and observability concerns. Three independent, parallel investigations traced Journey A, Journey B, and whole-application security/AI-failure/error-states from current source; the orchestrator directly traced navigation, production configuration, legal surfaces, and observability.

**Both product journeys (Job Seeker, Recruiter) were independently confirmed to work correctly end-to-end, with zero defects found in either.** This reflects real, already-completed hardening work from prior phases (23-25), not an easy pass — see Sections 3-4 for the full evidence trail.

**One genuine, critical security defect was found and fixed**: two API routes under the organization/workspace management surface (`src/app/api/saas/organizations/[orgId]/members/route.ts` GET, and the nested `workspaces/[workspaceId]/members/route.ts` GET/POST/DELETE) had authorization gaps ranging from a completely missing check (GET, on both routes — reachable by a fully unauthenticated caller) to a missing permission check (POST/DELETE, reachable by any authenticated member of an org regardless of role). The GET gap on the organization-level route is the most severe: it returned real member email addresses for any organization whose id a caller knew or guessed, with zero authentication required. All four gaps are now fixed, minimally, by applying the exact same authorization pattern every sibling route in the same file/directory already uses correctly — no new authorization mechanism was introduced.

No other P0/P1/P2 defect was found anywhere else in either journey, billing, entitlements, AI-provider-failure handling, or error states.

## 2. Current Application Architecture Relevant to User Journeys

- **Identity**: Supabase Auth is the root identity source everywhere; `requireUserId()` (platform), `requireRecruiterId()` (recruiter), `getTenantContext()` (organization) each independently resolve identity server-side from the verified session — never from client input.
- **Two billing systems** (documented, deliberate): organization-scoped (`billing-service.ts`/`stripe-provider.ts`, `STRIPE_SECRET_KEY` + org webhook secret) and platform/per-user-scoped (`platform-billing-service.ts`/`platform-stripe-provider.ts`, same `STRIPE_SECRET_KEY` + a separate platform webhook secret).
- **Recruiter workspace is genuinely self-contained**, keyed by `recruiter_id = auth.users.id`, with zero organization dependency — confirmed at the source level in this milestone (Section 4), not merely documented.
- **No RLS anywhere**; every table's ownership boundary is enforced in application code via `supabaseAdmin` (service-role) queries filtered by session-derived ids.

## 3. Job-Seeker Journey Trace (Journey A)

Independently traced end-to-end from source: Homepage (`(site)/page.tsx`, clear "For Job Seekers"/"For Recruiters" entry cards) → Signup/Login (real email/password + OAuth, no forced persona-selection screen, lands on `/resume-analyzer` by default) → default `JOB_SEEKER` persona (`persona-service.ts`, degrades safely, never forces org/recruiter UI) → Navbar (session-aware, one shared link array feeding both desktop and mobile nav, so they cannot drift) → Resume Analyzer/Builder (already exhaustively audited across Phase 25 M1-M4; this milestone only re-confirmed discoverability, not internals) → Job Matching (`JobMatchUpload.tsx`: real upload progress, `readEntitlementError`/`UpgradePrompt` on 402, `JD_MATCHES` quota enforced before the LLM call) → entitlement boundary → checkout (`checkout/route.ts`: identity and plan both server-validated before Stripe is touched) → webhook (signature required, raw body read before parsing, clean 400 on missing signature) → profile/logout.

**Zero defects found.** Every checkpoint traced to current source, not assumed.

## 4. Recruiter Journey Trace (Journey B)

Independently traced end-to-end, with special emphasis on the architectural rule under audit: **"Recruiter workspace must be self-contained, keyed by `recruiter_id = auth.users.id`, with no organization dependency."** Confirmed true at the source level:
- `POST /api/persona/recruiter/activate` resolves identity via `requireUserId()` only; `activateRecruiterPersona()` writes `RECRUITER` into `auth.users.app_metadata.platform_roles` via the Supabase Admin API — zero organization/tenant reference anywhere in the path (no `getTenantContext()`, no `organizationId`, grep-confirmed).
- `requireRecruiterId()` returns the raw session `user.id` directly, with its own doc comment explicitly stating candidates/JDs "belong to their own auth.users id, never to a whole organization."
- Candidate management, AI features (recommend/compare/insights), and billing (the shared per-user platform checkout route) all correctly scope to this same `recruiter_id`, with ownership filtering (`.eq("recruiter_id", recruiterId)`) confirmed at 13+ call sites in `candidate-service.ts`.
- The Phase 25 M4 fix (`RecruiterReportsTab.tsx`'s candidate-report download) was re-confirmed still intact.
- Mobile: candidate table wrapped in `overflow-x-auto`; real empty states present.

**Zero defects found.**

## 5. Authentication & Persona Findings

No defect. Anonymous, job-seeker, and recruiter access patterns all confirmed correct and mutually non-interfering (Sections 3-4). Persona resolution degrades safely on any lookup failure rather than throwing or granting excess access.

## 6. Navigation Findings

No defect. `Navbar.tsx`/`MobileNav.tsx` share one `links` array — desktop and mobile cannot diverge by construction. Session-aware auth CTA (Login/Sign Up vs. My Account) visible at every breakpoint. No dead links, no protected-route link without redirect handling (every protected destination already self-redirects to `/login`).

## 7. Resume Journey Findings

Not re-audited in depth per this milestone's explicit instruction (Phase 25 M1-M4 already exhaustively covered this journey across 4 independent passes, fixing 6 real defects along the way, all validated). This milestone only confirmed discoverability from the homepage/navbar — confirmed reachable, no dead end, consistent with Phase 25's already-validated state.

## 8. Job Match / Optimization Findings

No defect. `/api/ai/job-match/route.ts`: `requireQuota("JD_MATCHES")` before the LLM call, `recordUsage` only after success. Client (`JobMatchUpload.tsx`) has real upload progress (XHR-based, not a dead spinner), correctly distinguishes entitlement rejection (`UpgradePrompt`) from a generic network/parse failure. "Download Analysis" builds its report client-side from already-fetched JSON — not subject to the `<a href>`-to-API bug class Phase 25 fixed repeatedly, since it never makes a second API round-trip.

## 9. AI Provider Failure Findings

No defect. `usage-meter.ts`'s `meteredCall()` releases (never commits) a usage reservation on any OpenAI throw, then rethrows the original error unchanged — matching its own documented contract. Sampled 3 AI-calling routes across different feature families (job-match, recruiter candidate re-evaluation): all correctly order quota-check → LLM call → `recordUsage`-only-on-success, with no Supabase write of partial/corrupted data on failure, and a safe error message (never a raw provider error or stack trace) on the client. No infinite/dead spinner risk found (try/catch/finally consistently present).

The previously-diagnosed `OPENAI_API_KEY`/`OPENAI_BASE_URL` Vocareum course-proxy key issue (reported earlier in this engagement) remains an **operational/configuration blocker**, not a code defect — the application's own failure-handling code around it is correct.

## 10. Billing & Entitlement Findings

No defect in the billing/entitlement *logic* itself. See Section 14 for the separate, real *configuration* gap (Stripe secrets not present in this environment).

- Checkout (`checkout/route.ts`): identity server-resolved, `planKey` validated against the server registry before Stripe is touched; invalid plan → 400, duplicate subscription → 409 — never a raw 500 leak.
- Webhook (`webhook/route.ts`): raw body read before parsing (required for signature verification), missing signature → clean 400.
- `platform-subscription-service.ts`: every lookup filters by session-resolved `userId`; the one reverse lookup by Stripe customer id is only ever driven by a signed, server-verified Stripe event, never a client-facing route.
- No alternate route bypasses entitlement enforcement (confirmed by the same fork that found the org/workspace defect — see Section 11 item 2).

## 11. Security / IDOR Findings

**GENUINE DEFECT — the central finding of this milestone.** Severity: **A-critical** for the GET gaps (unauthenticated, cross-tenant PII exposure), **B-major** for the POST/DELETE gap (authenticated privilege escalation within an org). All fixed — see Section 17.

Every other area checked was confirmed sound:
- Resume Versions IDOR: re-confirmed clean (now the 4th independent confirmation across this engagement).
- Recruiter candidate ownership: confirmed clean (13+ `.eq("recruiter_id", ...)` call sites).
- `platform_subscriptions`/organization-membership tables: confirmed session-filtered, not client-id-filtered.
- Whole-`src/app/api/**` grep for identity fields destructured from body/query and used in an authorization decision without independent server-side re-resolution: exactly one other hit, `saas/organizations/switch/route.ts`'s `organizationId` from body — but it's independently re-verified via `verifyMembership()` before being trusted, so **not a defect**.
- Billing/checkout: identity always server-resolved; a checkout cannot be initiated on behalf of another user via a client-supplied id.

## 12. Error-State Findings

No defect beyond the routes fixed in Section 11 (which, before the fix, would have returned real data rather than an error — an even worse failure mode than a bad error state). Sampled recruiter-activation, login/signup, and billing-checkout error paths: all return structured, safe error messages via a consistent `try/catch` → typed-error → status-code pattern, never a raw stack trace or blank page.

## 13. Mobile/Responsive Findings

No defect. Homepage, Navbar/MobileNav, auth pages, `JobMatchUpload`/`UpgradePrompt`, and the recruiter candidate table all confirmed to have genuine (not merely cosmetic) responsive handling — real Tailwind breakpoints, a real mobile disclosure nav, `overflow-x-auto` on the one wide data table checked.

## 14. Production Configuration Findings

Read `.env.local`'s variable names directly (values never inspected/printed):

| Variable | Present locally? | Classification |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Yes | Configured |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Yes | Configured, but the key itself is the previously-diagnosed suspended Vocareum course-proxy key — **operational blocker**, not re-diagnosed here |
| `PLATFORM_ADMIN_BOOTSTRAP_SECRET` | Yes | Configured |
| **`STRIPE_SECRET_KEY`** | **No** | **Operational blocker** — billing/checkout cannot function in this environment until set |
| **`STRIPE_PLATFORM_WEBHOOK_SECRET`** | **No** | **Operational blocker** — the platform billing webhook cannot verify events until set |

`platform-stripe-provider.ts`'s `getStripeClient()` is deliberately lazy — confirmed by direct code read: it never throws at import time, only when an actual Stripe call is attempted, and produces a clean, safe, instructive error (`"STRIPE_SECRET_KEY is not configured. Add it to .env.local to enable platform checkout."`) that the checkout route's catch block correctly surfaces as a 422 JSON body — **this is correct, intentional, already-hardened "code-ready pending external config" behavior, not a defect.**

**Classification: these two missing Stripe secrets are operational/configuration blockers, not engineering defects.**

## 15. Legal/Business Blockers

Repo-wide search (route tree + footer + navbar) found **no Terms of Service, Privacy Policy, or Refund/Cancellation policy page anywhere** — live-confirmed: `GET /terms` → 404, `GET /privacy` → 404. A `/contact` page exists (a general contact form framed around "collaboration, job opportunities, technical discussions, or project work" — not explicitly billing/support-focused, though it could serve that purpose).

**This is a genuine, real launch blocker for a SaaS product that processes payments via Stripe** — most jurisdictions and Stripe's own merchant requirements expect a visible Terms of Service and Privacy Policy. Per this milestone's explicit instruction, **no legal language was drafted or invented** — this is reported as a business/legal decision requiring the user's own input (a lawyer or a legal-template service), not something to be fabricated by this audit.

## 16. Observability Findings

No third-party observability/error-tracking platform (Sentry, Datadog, etc.) is integrated anywhere in `package.json`. All server-side error visibility is via a consistent `console.error("[feature] ...", error)` convention (confirmed already-established and consistently applied, including in the newly-fixed routes). In a real deployment this would flow into whatever the hosting platform's own log aggregation is (e.g. Vercel function logs) — a reasonable MVP-stage posture, not a code defect.

**Classification: informational.** Per this milestone's explicit instruction, no new observability platform was introduced.

## 17. Defects Fixed

**`src/app/api/saas/organizations/[orgId]/members/route.ts`** (GET):
- **Before**: zero authorization check. Any caller — including a fully unauthenticated one — who knew or guessed an `orgId` could read that organization's complete member roster, including real email addresses (`getTeamRoster()` resolves each member's email).
- **Fix**: added the exact same `getTenantContext()` + `context.organizationId !== orgId` → 403 guard every sibling mutating route in this same file tree already uses (`[orgId]/members/[userId]/route.ts`'s PATCH/DELETE).
- **Severity**: A-critical (unauthenticated, cross-tenant PII exposure).

**`src/app/api/saas/organizations/[orgId]/workspaces/[workspaceId]/members/route.ts`** (GET, POST, DELETE):
- **GET before**: zero authorization check — same class of unauthenticated cross-tenant exposure as above (workspace membership: user ids + roles, not emails). **Fix**: same guard added.
- **POST/DELETE before**: checked only organization membership (any tenant match), never a permission — unlike the identical action at the organization level, which requires "Manage Users." Net effect: any member of an org, regardless of role, could add or remove any other member of any workspace in that org, including assigning an arbitrary role. **Fix**: added `requirePermission(context, "Manage Users")` to POST, and the same self-removal-allowed/other-removal-requires-permission check the org-level sibling's DELETE already uses, to DELETE — reusing the existing `permission-service.ts` exactly as-is, no new authorization mechanism.
- **Severity**: A-critical (GET), B-major (POST/DELETE).

Both fixes apply the exact pre-existing pattern already correctly used by sibling routes in the same codebase — no new architecture, no new dependency, no new database migration.

**Reviewed, not a defect**: the repo's automated security scanner flagged `const { userId, role_key } = await req.json()` in the fixed POST handler as "an identity field read from request input." Reviewed directly: `userId` here is the *target* user being added to the workspace, not the *acting* user's own identity — the authorization decision is entirely based on `context` (session-derived via `getTenantContext()`), exactly matching this repo's own documented exception ("a path/body parameter naming a target is fine — the acting user is still independently resolved from the session"). No change needed.

## 18. Defects Deferred

None — both fixes above were completed and validated within this milestone.

## 19. Operational Blockers

1. `STRIPE_SECRET_KEY` / `STRIPE_PLATFORM_WEBHOOK_SECRET` not configured — billing/checkout non-functional until set (Section 14). Code already fails gracefully.
2. `OPENAI_API_KEY`/`OPENAI_BASE_URL` still point at a suspended Vocareum course-proxy key (previously diagnosed, not re-investigated) — every AI feature blocked until replaced with a real key.
3. Terms of Service / Privacy Policy / Refund policy pages do not exist (Section 15) — a business/legal decision, not an engineering task.

## 20. Validation Results

```
BASELINE TESTS: 1292
FINAL TESTS:    1303
NEW TESTS:      11 (2 new route test files — org-members GET auth gap;
                    workspace-members GET/POST/DELETE auth + permission gaps)
FAILURES:       0

TSC:        PASS
LINT:       PASS (0 errors; 2 pre-existing, unrelated <img> warnings)
BUILD:      PASS
VERIFY.SH:  PASS WITH WARNINGS (security scanner's one flag on the fixed
            file reviewed above and confirmed a correct pattern, not a
            defect; all other warnings pre-existing/untouched)
```

**Live validation** (fresh dev server, cache cleared): home/`resume-analyzer`/`login`/`signup` all 200; `/recruiter`/`/settings/billing` unauthenticated correctly redirect (307); the two previously-vulnerable routes now correctly return `403 {"error":"Not authorized for this organization"}` for every unauthenticated request tested (org members GET, workspace members GET, workspace members POST) — confirming live that the fix closes the exact exposure found. `/terms` and `/privacy` confirmed live 404. No authenticated E2E was fabricated — no test credentials were available in this environment.

## 21. Final Classification

**A — Critical engineering blockers remain? No — the one critical defect found was fixed and validated within this milestone.**

Selecting from the required final decision set: **D — Only cosmetic/business/operational items remain.** The one genuine, critical engineering defect discovered by this audit (Section 17) has been fixed, tested, and validated. What remains is exclusively: two missing Stripe production secrets (operational), a stale AI provider key (operational, previously diagnosed), and the absence of legal pages (business/legal decision, explicitly not this audit's to invent). No further engineering workstream is justified by this audit's findings — **Milestone 2 is not proposed.**
