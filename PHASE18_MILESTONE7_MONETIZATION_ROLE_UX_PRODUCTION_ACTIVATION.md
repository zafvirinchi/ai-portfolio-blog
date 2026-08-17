# Phase 18 — Milestone 7: Monetization Completion, Role-Based Plan UX & Production Activation Readiness

## 1. Executive summary

This milestone audited whether the entitlement engine built across M1–M6 actually reaches the user as a coherent experience. It does, mostly, at the data layer — but the single biggest genuine gap was that **every feature page which calls a `requireFeature()`/`requireQuota()`-gated route (Phase 18 M5) discarded the server's structured entitlement response and showed a bare error string**, with no upgrade path, no distinction between "not on your plan" and "you've used your quota," and no distinction between "sign in" and "upgrade." `UpgradePrompt` existed since M5 but was wired into exactly one surface (`ChatBox`). This milestone closes that gap across every job-seeker and recruiter feature entry point that actually gates on entitlement, adds `AUTH_REQUIRED` handling to `UpgradePrompt` itself, and uses an already-exported-but-never-called registry function (`listFeaturesByCategory`) to group the billing dashboard by product area instead of one flat list. No entitlement engine, plan registry, or Stripe code was touched — every value shown to the user still originates entirely server-side.

## 2. Plan/persona matrix

Derived from the existing, unmodified registries (`platform-schema.ts`, `platform-plan-registry.ts`, `feature-registry.ts`) — 25 features, 6 plans, 3 personas:

| Persona | Plan | Feature categories | Representative quotas | Upgrade path |
|---|---|---|---|---|
| Job Seeker | Free | resume (partial), job, interview (partial) | ATS 5/mo, JD 5/mo, Interview Prep 3/mo, Mock 2/mo | → Pro/Premium via `/settings/billing` |
| Job Seeker | Pro | + resume.optimize, resume.ai_assistant, resume.rewrite (30/mo) | ATS 50/mo, JD 50/mo, Interview Prep 15/mo, Mock 15/mo | → Premium |
| Job Seeker | Premium | everything UNLIMITED | — | current top tier |
| Recruiter | Free | recruiter.workspace/jobs (unlimited), candidates/ranking (25/mo) | Candidates 25/mo | → Pro/Business |
| Recruiter | Pro | + analytics, shortlist, interview pipeline, export (50/mo) | Candidates 200/mo, Exports 50/mo | → Business |
| Recruiter | Business | everything UNLIMITED incl. hiring reports | — | current top tier |
| Admin | n/a | `ADMIN_BYPASS` — every feature, `UNLIMITED`, no plan tier | — | not a commercial persona (Step 3 of the platform-schema design) |

No plan/feature was invented for this table — it is a direct read of the existing registries. No inconsistency was found between the plan registry, the entitlement matrix, and actual API enforcement (M5 already closed those gaps); the inconsistency that *was* found was entirely at the presentation layer (§4).

## 3. Existing architecture reused

`entitlement-service.ts`, `platform-plan-registry.ts`, `feature-registry.ts`, `entitlement-response.ts` (M5), `usage-event-service.ts`, `platform-admin-service.ts`, `platform-subscription-service.ts` — all read, none modified. `UpgradePrompt` (M5) was extended, not replaced. `listFeaturesByCategory()` (M1, exported, previously called nowhere in the app) is now actually used.

## 4. Genuine gaps discovered

1. **Dead-end monetization UX (the primary finding).** Nine distinct feature-page entry points parsed a 402/401 JSON error body, extracted only `.error`, and rendered it as plain red text — discarding `code`/`limit`/`used`/`period` entirely. A Free-tier user hitting a real quota/feature wall saw an error sentence with no actionable next step.
2. **`UpgradePrompt` had no distinct handling for `AUTH_REQUIRED`.** It would have shown "Upgrade required" with a "View plans & upgrade" CTA to a signed-out visitor — who cannot check out without a session in the first place (`initiateCheckout()` requires `requireUserId()`). A real dead end, not just imprecise copy.
3. **The billing dashboard's "Enabled Features" list was flat**, ignoring `FEATURE_REGISTRY`'s own existing `category` field and the exported-but-unused `listFeaturesByCategory()` helper — harder to scan for a multi-role user holding both Job Seeker and Recruiter features at once.

Everything else audited (Steps 6, 7 minus §10's export gap, 8, 9, 11) was found **already correct** — see the per-section notes below.

## 5. Changes implemented

- **`src/lib/billing/entitlement-client-error.ts`** (new) — the client-safe counterpart to M5's `entitlement-response.ts`; `readEntitlementError(body, fallback)` returns a typed `{code, message, limit, used, period}` or `null`, reused by every component below instead of each re-implementing its own parsing.
- **`UpgradePrompt.tsx`** — added `AUTH_REQUIRED` handling: heading "Sign in required", CTA "Sign In" → `/login`, instead of the upgrade CTA.
- **Nine feature components wired to render `UpgradePrompt` on an entitlement rejection**, instead of a plain error string: `JobMatchUpload.tsx` (job.match), `JobUpload.tsx` (job.analyzer), `JdUpload.tsx` (resume.jd.match), `ResumeOptimizerPanel.tsx` (resume.optimize), `MockInterviewSetup.tsx` (interview.mock), `resume-rewriter/page.tsx` (resume.rewrite — the session-start action only; sub-operations on an already-started session were never separately gated by M5 and still aren't), `interview-preparation/page.tsx` (interview.prepare), `RecruiterDashboardTab.tsx` (recruiter.candidates import), `RecruiterAnalyticsTab.tsx` (recruiter.analytics, with a working `onRetry`). The three `XMLHttpRequest`-based upload components (`JobMatchUpload`, `JobUpload`, `JdUpload`) needed a small `ApiError` class to carry the parsed JSON body through the reject path, since a plain `Error` only preserves `.message`.
- **`/settings/billing`** — "Enabled Features" now groups by `FEATURE_REGISTRY`'s existing category (Resume/Job/Interview/Recruiter) via `listFeaturesByCategory()`, instead of one flat badge list.

## 6. Job-seeker monetization audit

ATS scoring, JD matching, resume optimization/rewriting, interview prep, mock interview, AI assistant — all confirmed server-gated since M5 (`requireFeature`/`requireQuota`, quota checked strictly before the LLM call, `recordUsage` only on genuine success). This milestone's contribution is exclusively the UI-side upgrade path (§5) — no server-side change was needed or made. Resume Builder/Templates/Versions/Export remain intentionally ungated (UNLIMITED on every plan — M5's own documented finding, re-confirmed, no monetization stakes to enforce).

## 7. Recruiter monetization audit

Candidate import, analytics, shortlist/interview status transitions, export, and hiring reports — all confirmed server-gated since M5. **One deferred gap found and explicitly not fixed**: `RecruiterReportsTab.tsx`'s candidate/comparison/hiring-report exports use plain `<a href>` downloads, not `fetch()` — a 402 entitlement rejection currently returns as a raw JSON blob via direct browser navigation rather than any in-page message. Converting these to JS-triggered blob downloads (the only way to intercept and display the response) is a materially different interaction pattern with its own regression risk (browser download-manager integration, "save as," etc.) for what is fundamentally a file-download feature — judged out of proportion for this milestone's "minimal changes" mandate and left for a dedicated follow-up rather than rebuilt hastily. `recruiter.ranking`/`recruiter.workspace`/`recruiter.jobs` remain intentionally ungated, unchanged from M5 (never `NONE` on any plan — no restriction exists to enforce).

## 8. Admin audit

`/admin/platform/users` and `/admin/platform/users/[userId]` re-verified: `requirePlatformAdmin()` gates both (M4, unchanged); `PlatformRoleManager.tsx` and `PlatformOverrideManager.tsx` are the only mutating surfaces, both round-tripping through the real, server-authorized `/api/admin/platform/users/[userId]/{roles,overrides}` routes and calling `router.refresh()` afterward — never computing or caching entitlement client-side. Self-removal requires an explicit confirmation checkbox before the button even enables; the last-ADMIN block (`LastAdminError`, M3) surfaces as a clear, actionable server message, unchanged. Billing information on the detail page is read-only (subscriptions/usage/audit log render server data with no mutating action attached to any of it). Bootstrap (M4) re-confirmed unchanged: self-target-only, no `targetUserId` field exists anywhere in its request shape. No genuine gap found; no code change made here.

## 9. Multi-role behavior

`getBillingOverview()`'s `plans`/`roles` arrays are already per-role (M2); `/settings/billing` already rendered one plan card and one plan-comparison section *per role* the user actually holds, correctly, before this milestone. `getEntitlement()`'s cross-role union (`mostPermissive` across all of a user's resolved plans — e.g. a JOB_SEEKER+RECRUITER account sees both families' features) is a **documented, intentional M1 design choice**, re-confirmed here, not a bug: the "Enabled Features" list correctly shows both a Job Seeker feature and a Recruiter feature side by side for a user who genuinely holds both entitlements. No "active role" model was introduced, per the explicit instruction not to.

## 10. Upgrade/quota UX

Every entitlement rejection surfaced through the nine wired components now distinguishes `AUTH_REQUIRED` / `FEATURE_NOT_INCLUDED` / `QUOTA_EXCEEDED` (§4/§5) and offers the correct action (Sign In / Upgrade / retry where retrying is meaningful — wired for `RecruiterAnalyticsTab`, omitted elsewhere where a stale form resubmission wouldn't make sense). All displayed numbers (`limit`/`used`/`period`) come verbatim from the server's own `entitlement-response.ts` body — the client performs zero quota arithmetic of its own. `UpgradePrompt` remains `role="status"`/`aria-live="polite"`, keyboard-reachable, no color-only signaling, unchanged accessibility posture from M5.

## 11. Stripe activation checklist

Using the exact environment-variable names already defined in `platform-stripe-provider.ts` — none invented:

1. Create 4 Stripe Products/Prices (Job Seeker Pro, Job Seeker Premium, Recruiter Pro, Recruiter Business) in test mode.
2. Set `STRIPE_SECRET_KEY`.
3. Set `STRIPE_PRICE_JOB_SEEKER_PRO`, `STRIPE_PRICE_JOB_SEEKER_PREMIUM`, `STRIPE_PRICE_RECRUITER_PRO`, `STRIPE_PRICE_RECRUITER_BUSINESS`.
4. Register a webhook endpoint at `/api/billing/platform/webhook` for exactly `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` (the only four this handler processes — M6's own explicit instruction against over-subscribing).
5. Set `STRIPE_PLATFORM_WEBHOOK_SECRET` from that endpoint's signing secret.
6. Run one real checkout in Stripe test mode → confirm `platform_billing_customers`/`platform_subscriptions` populate via webhook → confirm `/settings/billing` reflects it.
7. Run one portal session ("Manage Subscription") in test mode.
8. Run one cancellation → confirm the webhook reconciles `cancel_at_period_end`/`canceled_at` correctly.

None of steps 1–8 were performed by this milestone — no Stripe credentials are available in this environment (§17).

## 12. Supabase activation checklist

1. Apply `supabase/migrations/20260816000000_add_platform_entitlement_tables.sql` (M1) in the Supabase SQL Editor.
2. Apply `supabase/migrations/20260817000000_add_platform_billing_tables.sql` (M2).
3. Verify tables: `platform_entitlement_overrides`, `platform_usage_events`, `platform_billing_customers`, `platform_subscriptions`.
4. Verify indexes: `platform_subscriptions_user_idx`, `platform_subscriptions_status_idx`, `platform_subscriptions_user_status_idx` (defined in the M2 migration file).
5. Verify columns match `PlatformSubscriptionRow`/`PlatformBillingCustomer` (`platform-subscription-service.ts`) exactly — both files are re-run-safe (`if not exists`).

Neither migration was applied by this milestone (confirmed still unapplied — see §17); no auto-apply was attempted, per standing instruction.

## Platform Admin checklist

1. Set `PLATFORM_ADMIN_BOOTSTRAP_SECRET` (the actual variable name — `src/lib/billing/platform-admin-bootstrap-service.ts`).
2. Sign in as the intended first admin, then `POST /api/admin/bootstrap` with header `x-bootstrap-secret: <secret>` (self-target-only — grants ADMIN to the caller's own session, M4).
3. Verify `/admin` access as that account.
4. Verify a non-admin account still receives the "Access Denied" panel at `/admin` (M4).

## Application checklist

- Verify `/settings/billing` for a real Free account: current plan, grouped enabled features, usage, upgrade grid (§5/§10).
- Verify the upgrade flow: click "Upgrade" → real Stripe Checkout → return to `/settings/billing?checkout=success`.
- Verify feature gating: as Free, trigger `resume.optimize`/`resume.ai_assistant`/etc. and confirm `UpgradePrompt` renders (not a plain error) — code-verified and build-verified this milestone; not live-authenticated-verified (§17).
- Verify quotas: exhaust `resume.ats.score` (5/mo Free) and confirm `QUOTA_EXCEEDED` renders with the real used/limit numbers.
- Verify recruiter monetization: Free-tier `recruiter.analytics`/`recruiter.export` rejections render `UpgradePrompt`.
- Verify job-seeker monetization: same, across all nine wired surfaces (§5).

## 13. Security findings

None new. No route touched this milestone accepts a client-supplied userId, planId, entitlement, or quota value — every change in this milestone is presentation-only, reading server-returned JSON fields (`code`/`limit`/`used`/`period`) that were already safe to expose (established in M5's `entitlement-response.ts` design: never a Stripe id, never internal pricing config). Verified once more explicitly for this milestone: no new endpoint, no new mutation, no authorization change.

## 14. Test results

**1107 / 1107 passing** (84 test files), up from the 1099 baseline — 8 new tests, all in `entitlement-client-error.test.ts` (the one genuinely new piece of testable pure logic this milestone added — `readEntitlementError()`'s recognition of all three codes, rejection of unrecognized/malformed shapes, and safe handling of non-object bodies). No React component-level tests were added — this repo has no such testing convention anywhere in Phase 1–18 (confirmed again this milestone; `src/lib/**` pure-logic tests only), and introducing one was out of scope ("do not introduce another testing framework"). The nine UI wiring changes were instead verified via `tsc`, `eslint`, a full production build, and live route probing (§16). Zero existing tests modified or removed.

## 15. TypeScript / lint / build results

`tsc --noEmit` — clean. `eslint .` — clean (the same one pre-existing, unrelated `<img>` warning from earlier milestones). `npm run build` — succeeded (exit 0); `.next` was removed and rebuilt clean first, since a prior interrupted dev-server session had corrupted its cached dev types (a build-artifact issue, not a source issue — the same class of false alarm documented in M6).

## 16. Live probe results

With the dev server running locally, unauthenticated:

- `GET /settings/billing` → `307` to `/login`
- `GET /recruiter` → `307` to `/login`
- `POST /api/billing/platform/checkout` → `401`
- `POST /api/billing/platform/portal` → `401`
- `POST /api/billing/platform/webhook` (no signature header) → `400`
- `GET /api/ai/recruiter/analytics` → `401`
- `GET /api/admin/platform/users` → `401`
- `POST /api/ai/job` (no file) → `422` (pre-existing validation, unaffected)
- `POST /api/ai/chat` with a real message → **`200` with a genuine, complete AI answer** — this environment has working OpenAI credentials, so this is a live, non-fabricated confirmation that the anonymous chat path (and by extension every other `getOptionalUserId()`-gated anonymous route) remains completely unaffected end to end.

All match documented, pre-existing behavior; nothing regressed.

## 17. Stripe credential status

**Unavailable**, unchanged from M6 — `.env.local` has no `STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, or `STRIPE_PRICE_*` variables (checked for presence only, values never read or displayed). No Stripe E2E was attempted or claimed. Supabase credentials remain present in this environment (unchanged from M6); not used to write anything this milestone, and the platform migrations remain confirmed unapplied (re-verified consistent with M6's finding — no new check was needed since nothing in this milestone touches persistence).

## 18. Known limitations

- `RecruiterReportsTab.tsx`'s export/hiring-report downloads still show no in-page entitlement UX on rejection (§7) — the one explicitly deferred gap.
- The nine UI fixes are verified by type-checking, linting, building, and live-probing the anonymous path; they are **not** verified against a real authenticated Free-tier account actually hitting a quota wall in the browser, since no such account exists in this environment (no applied migration, and this milestone does not create test users).
- Sub-operations on an already-started resume-rewrite session (section rewrite, whole-resume rewrite, accept/reject) still show a plain error on failure, not `UpgradePrompt` — correct, since M5 never separately gates them (only the session-start action consumes quota), so they cannot receive an entitlement rejection in the first place; noted for completeness, not a gap.

## 19. Deferred work

`RecruiterReportsTab.tsx`'s download-based export UX (§7/§18) — recommended as a small, standalone follow-up (convert to blob-download + fetch, or accept the current UX and only improve the *route's* error body, e.g. a friendlier plain-text 402 page instead of raw JSON for a browser-navigated download).

## 20. Final production classification

**B — Production Ready, with Operational Prerequisites.** Unchanged from M6's classification: the monetization UX and enforcement code are now coherent end-to-end (including the upgrade-path gap this milestone closed), but full production readiness still depends entirely on the four external, operational steps in §11/§12/Platform Admin checklist — none of which are code work.

## 21. Exact manual actions required

1. Apply both Phase 18 migrations (§12).
2. Configure Stripe test/live credentials, price IDs, and the platform webhook endpoint (§11).
3. Set `PLATFORM_ADMIN_BOOTSTRAP_SECRET` and bootstrap the first admin (Platform Admin checklist).
4. Run one real Stripe test-mode checkout → webhook → `/settings/billing` round trip, and one real Free-tier account hitting a quota wall in the browser, to close the two verification gaps in §18 that this environment could not close.

No further Phase 18 code work is identified as required — the recommended next step is operational activation (the four items above) plus, only if capacity allows, the small deferred `RecruiterReportsTab.tsx` UX item (§19). No new Phase 18 milestone is recommended unless a genuine new gap surfaces during that activation.
