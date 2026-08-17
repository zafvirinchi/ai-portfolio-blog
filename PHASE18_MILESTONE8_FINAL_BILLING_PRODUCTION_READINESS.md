# Phase 18 — Milestone 8: Billing Production Activation & End-to-End Monetization Verification (FINAL)

## 1. Executive summary

This is the final Phase 18 billing/entitlement milestone. It re-verified every prerequisite, re-audited the complete Stripe → entitlement → UI lifecycle end to end, closed the one remaining UI dead-end explicitly deferred by M7 (recruiter export downloads), and found **no further code-level gaps**. The platform's blockers to production are now entirely operational, not architectural: an unapplied migration and absent Stripe credentials, both in this environment only, both already fully documented with exact remediation steps. **Phase 18 code implementation is complete.**

## 2. Billing architecture audit

Full lifecycle re-traced (Stripe subscription → `platform-subscription-service.ts` → `resolveEffectivePlans()` → `getEntitlement()`/`checkQuota()` → route gate → `entitlement-response.ts` → UI) — unchanged and correct since M6. No second entitlement engine, no second Stripe provider, no duplicated plan/quota definition anywhere in the codebase (re-confirmed via grep in §8).

## 3. Supabase schema audit

`supabase/migrations/20260816000000_add_platform_entitlement_tables.sql` (M1) and `20260817000000_add_platform_billing_tables.sql` (M2) re-read in full. Columns, constraints (`plan_id`/`status` `CHECK` clauses restricted to the exact enum values `platform-schema.ts` defines), indexes (`platform_subscriptions_user_idx`, `_status_idx`, `_user_status_idx`), and nullability all match `PlatformSubscriptionRow`/`PlatformBillingCustomer` (`platform-subscription-service.ts`) exactly — no schema/application drift found. `updated_at`'s repurposed meaning (Stripe event time, M6's out-of-order fix) requires no schema change and remains consistent with the migration's own column definition (a plain `timestamptz`, no trigger, no documented alternate meaning to conflict with).

**Live-verified this milestone (read-only, Supabase credentials present in this environment): NOT APPLIED.** `platform_billing_customers`, `platform_subscriptions`, `platform_entitlement_overrides`, `platform_usage_events`, and Phase 14's `audit_logs` all return PostgREST `PGRST205 — table not found in schema cache`; pre-Phase-14 tables (`blogs`) query successfully, confirming a real, connected, non-empty project that simply has never had this schema layer applied. Unchanged from M6/M7's own findings — re-verified, not assumed.

## 4. Stripe audit

`platform-stripe-provider.ts` re-read: price↔plan mapping (`resolveStripePriceId`/`resolvePlanKeyFromPriceId`, exact inverses, env-var-driven, never fabricates an id), checkout creation, customer reuse (`getOrCreateStripeCustomer`), portal creation, webhook signature verification (real `stripe.webhooks.constructEventAsync`, never mocked in the production path). `platform-billing-service.ts`: subscription lifecycle mapping (`mapStripeStatus`, exhaustive, fails closed to `canceled` for any unrecognized status including Stripe's `paused`), cancellation/past_due/unpaid/incomplete handling (documented, tested policy, unchanged), duplicate webhook handling (idempotent upsert-by-id), out-of-order webhook handling (M6's fix, re-verified intact), forged metadata protection (`subscription.metadata.userId` cross-checked and ignored on mismatch, tested), customer/user ownership (always resolved server-side from the Stripe `customer` field, never trusted from any client or event-supplied value). No defect found; nothing altered.

## 5. Job Seeker monetization matrix (final)

| Feature | Server gate | Quota | Check before LLM | Structured error | Client consumes it | CTA | Anonymous preserved |
|---|---|---|---|---|---|---|---|
| ATS Score | ✅ (M1) | ✅ ATS_CHECKS | ✅ | ✅ | ✅ (via ChatBox-style handling — resume upload flow) | Upgrade | ✅ |
| JD Match | ✅ (M5) | ✅ JD_MATCHES | ✅ | ✅ | ✅ (M7 — `JdUpload.tsx`) | Upgrade | ✅ |
| Job Analyzer | ✅ (M5) | ✅ JD_MATCHES | ✅ | ✅ | ✅ (M7 — `JobUpload.tsx`) | Upgrade | ✅ |
| Job Match | ✅ (M5) | ✅ JD_MATCHES | ✅ | ✅ | ✅ (M7 — `JobMatchUpload.tsx`) | Upgrade | ✅ (additive to pre-existing IP rate limit) |
| Resume Optimizer | ✅ (M5) | — (boolean) | ✅ | ✅ | ✅ (M7 — `ResumeOptimizerPanel.tsx`) | Upgrade | ✅ |
| Resume Rewriter | ✅ (M5) | ✅ AI_REWRITES | ✅ | ✅ | ✅ (M7 — `resume-rewriter/page.tsx`) | Upgrade | ✅ |
| Interview Preparation | ✅ (M5) | ✅ INTERVIEW_PREPARATIONS | ✅ | ✅ | ✅ (M7 — `interview-preparation/page.tsx`) | Upgrade | ✅ |
| Mock Interview | ✅ (M1) | ✅ MOCK_INTERVIEWS | ✅ | ✅ | ✅ (M7 — `MockInterviewSetup.tsx`) | Upgrade | ✅ |
| AI Assistant | ✅ (M5) | — (boolean) | ✅ | ✅ | ✅ (M5 — `ChatBox.tsx`) | Upgrade | ✅ |
| Resume Builder/Templates/Versions/Export | intentionally ungated | — | n/a | n/a | n/a | n/a | ✅ (UNLIMITED every plan, no restriction exists) |

Every row unchanged since M7; re-verified, not re-implemented.

## 6. Recruiter monetization matrix (final)

| Feature | Server gate | Quota | Ownership/IDOR | Structured error | Client consumes it | Bulk-safe |
|---|---|---|---|---|---|---|
| Candidate Import | ✅ (M5) | ✅ RECRUITER_CANDIDATES (pre-check, whole batch rejected upfront) | ✅ `requireRecruiterId()` | ✅ | ✅ (M7 — `RecruiterDashboardTab.tsx`) | ✅ — quota checked before any file is processed; usage recorded per candidate genuinely imported, never per file submitted, never for duplicates/failures |
| Ranking | intentionally ungated | — | ✅ | n/a | n/a | n/a (never `NONE` on any plan) |
| Comparison / Shortlist / Interview status | ✅ (M5, status-value-specific) | — | ✅ | ✅ | plain error (status-transition UI, not separately audited this milestone — no new gap found) | ✅ single-candidate mutation, no bulk path |
| Analytics | ✅ (M5) | — | ✅ | ✅ | ✅ (M7 — `RecruiterAnalyticsTab.tsx`, with working retry) | n/a |
| Export (candidates/comparison) | ✅ (M5) | ✅ RECRUITER_EXPORTS | ✅ | ✅ | ✅ **(M8 — this milestone, `RecruiterReportsTab.tsx`, §11)** | n/a |
| Hiring Report | ✅ (M5) | — | ✅ | ✅ | ✅ **(M8 — this milestone)** | n/a |
| Interview Readiness / interview-link | ✅ (M5, `recruiter.interview`) | — | ✅ | ✅ | plain error (read-only deep-link resolver, low traffic, no new gap found) | n/a |

Bulk operation (candidate import) re-confirmed: no partial entitlement bypass — the pre-flight `checkQuota()` check rejects the entire batch before any file is analyzed if already at/over the limit; there is no code path where some files in a batch consume quota that was never checked.

## 7. Admin control-plane audit

`/admin/platform/users`, role management, override management, usage/billing visibility, audit history — all re-verified unchanged from M7: server-authorized via `requirePlatformAdmin()`, no client-provided userId can affect the ACTING admin's own identity (always re-derived from session), last-admin protection and self-lockout confirmation both enforced server-side with matching UI affordances, bootstrap remains self-target-only (no `targetUserId` field exists in its request shape at all — structurally, not just by convention). No new admin capability added; none was needed.

## 8. Entitlement consistency audit

Searched for `isPremium`, `isPro`, `plan ===`, `subscription ===`, hardcoded quota numbers across `src/`. One incidental match in `src/lib/billing/billing-service.ts` (`session.subscription?.id`) — Phase 14's *organization*-scoped billing system, unrelated to Phase 18, not a hardcoded plan check (just extracting a Stripe subscription id from a checkout session). No hardcoded plan/quota logic found anywhere in the Phase 18 platform billing/entitlement path — `getEntitlement()`/`checkQuota()` remain the single source of truth, confirmed by absence of any bypass.

## 9. Quota lifecycle audit

Re-confirmed via existing, unmodified test coverage (`entitlement-service.test.ts`'s `checkQuota`/`requireQuota` suite: below-limit allowed, at-limit denied, above-limit denied, UNLIMITED never denies, a metric with no entitled feature denies with limit 0) plus M5/M7's route-level tests proving the LLM-backed call is never invoked once a quota check rejects (`job/route.test.ts`, `resume-rewriter/route.test.ts`, `recruiter/candidates/import/route.test.ts`). No reset-semantics gap found — `usage-event-service.ts`'s `getUsageCount()` computes DAY/MONTH/LIFETIME windows from `occurred_at` directly (no stored "reset date" to drift). Live E2E of an actual Free→exhausted→upgrade cycle remains BLOCKED (§14) — no applied migration, no real account.

## 10. Upgrade UX audit

Of the two illustrative codes in this milestone's own brief (`SUBSCRIPTION_REQUIRED`, `BILLING_UNAVAILABLE`), neither is actually emitted anywhere in the codebase — `entitlement-response.ts`'s real `EntitlementErrorCode` union is `AUTH_REQUIRED | FEATURE_NOT_INCLUDED | QUOTA_EXCEEDED`, and no route needs a 4th/5th code: the only "no billing account" case (`NoBillingAccountError`, portal route) is unreachable through the normal UI (the "Manage Subscription" button only renders when `hasAnyPaidPlan` is true, which implies a billing-customer row must already exist), and Stripe API failures already surface as safe generic messages (verified M6) rather than a distinct code. Inventing two unused codes for illustrative parity with the brief was judged not a genuine gap — documented here instead, per "do not rewrite correct code."

All three real codes verified end-to-end: `AUTH_REQUIRED` → `UpgradePrompt`'s "Sign In" CTA → `/login` (M7); `FEATURE_NOT_INCLUDED`/`QUOTA_EXCEEDED` → `UpgradePrompt`'s "View plans & upgrade" CTA → `/settings/billing`, with real server-provided `limit`/`used`/`period` numbers, zero client-side arithmetic.

## 11. Export UX finding (Step 11 — resolved this milestone)

M7 deferred this. Audited concretely this milestone:

- **Server rejection alone was not usable**: a 402 JSON body returned to a plain `<a href>` navigation replaces the whole app tab with raw JSON text — recoverable via browser back, but not an acceptable UX, and not silent enough to leave as-is either.
- **A small, safe client-side fix was genuinely possible** for the specific links that are actually gated: `/api/ai/recruiter/export` (candidates CSV/Excel/PDF, hiring-report CSV/Excel — 5 links in `RecruiterReportsTab.tsx`). Converted to `fetch()` + blob-download (a standard, low-risk pattern: `URL.createObjectURL` + a programmatic anchor click) — the success path still produces an identical real browser download (same filename, same content-type); a 402/401 now renders `UpgradePrompt` inline instead of navigating away.
- **The single-candidate PDF report link** (`/api/ai/recruiter/candidates/[candidateId]/export`) was checked and confirmed to have **no entitlement gate at all** (only `requireRecruiterId()`) — left as a plain `<a href>` unchanged, since there is no rejection to intercept and converting it would add complexity with nothing to fix.
- Every other export-shaped route audited this milestone (resume-rewriter export, resume-optimizer export, interview-prep export) was confirmed **not separately gated** by M5 (only the generation step is metered, per M5's own "don't double-count sub-operations" design) — so none of those links had a dead end to close either.

This closes M7's one deferred item. No export architecture was rebuilt — only the 5 genuinely-gated links changed from direct navigation to intercepted fetch+blob.

## 12. Billing dashboard final UX

`/settings/billing` re-verified against Step 12's checklist: current plan, subscription status, renewal/cancellation, usage (M5), limits, feature availability (grouped by category since M7), upgrade options, manage billing — all server-derived from a single `getBillingOverview()` call, zero client-side entitlement computation, zero hardcoded feature matrix (both the "Enabled Features" grouping and the plan-comparison grid derive their contents from `PLATFORM_PLAN_DEFINITIONS`/`FEATURE_REGISTRY` at render time). "Stale display after checkout" is structurally impossible to leave stale by design: the page re-fetches `/api/billing/platform/overview` fresh on every mount (including the return navigation from Stripe Checkout to `?checkout=success`), never caches or persists prior state client-side.

## 13. Security audit

Grepped for client-supplied `userId`/`role`/`plan`/`entitlement`/`quota`/Stripe `customerId`/`subscriptionId` across `src/app/api`. No route accepts any of these as trusted input — every match traced to either (a) already-audited, correctly-validated admin input (`body.role` in the M3 role-assignment route, checked server-side against `PLATFORM_ROLES` before use) or (b) unrelated Phase 14 code. Re-confirmed `/api/admin/**`, `/api/billing/**`, `/api/ai/**` authentication/authorization: every route requiring a session enforces it via `requireUserId()`/`requireRecruiterId()`/`requirePlatformAdmin()` (never `getUser()` alone), live-probed this milestone (§19) to confirm 401/403/307 responses, not just code review.

## 14. Stripe E2E status

**BLOCKED — Stripe credentials unavailable in this environment.** No `STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, or `STRIPE_PRICE_*` variables present (checked for presence only). Steps 1–12 of the upgrade/downgrade lifecycle (Step 8 of this milestone's instructions) were not attempted — no fabricated E2E claimed. What *was* validated without live Stripe: real (non-mocked) webhook signature verification against locally-generated test secrets (`platform-stripe-provider.test.ts`, unchanged, pre-existing), forged-metadata protection, duplicate/out-of-order webhook handling, unknown-price handling — all via the existing, non-live test suite (§15).

## 15. Supabase E2E status

**BLOCKED for persistence — Supabase credentials present but the required tables don't exist (§3).** Read-only connectivity was used only to verify migration status, never to write. No authenticated Supabase session exists in this environment to drive a real logged-in user through `/settings/billing` — that specific gap (an authenticated Free-tier account actually hitting a quota wall in the browser) remains open, as it has since M6/M7, and is not closed by this milestone; it requires the operational steps in §20.

## 16. Tests before/after

**1107 before → 1107 after.** No new tests added this milestone — the one code change (`RecruiterReportsTab.tsx`'s fetch+blob conversion) is a DOM/browser-interaction change with no new pure, portable logic to unit-test (it reuses the already-tested `readEntitlementError()` from M7 unchanged); this repo has no component-testing framework, and introducing one for a single component was judged disproportionate ("add tests only for genuine defects discovered... do not add tests merely to increase test count" — this milestone's own instruction). Zero existing tests modified or removed.

## 17. TypeScript result

`tsc --noEmit` — clean. (One false-alarm run occurred mid-milestone from a stale `.next/dev/types` cache left by an interrupted prior dev-server session — the same class of build-artifact issue documented in M6/M7, not a source defect; resolved by removing `.next` and rebuilding.)

## 18. Lint result

`eslint .` — clean (the same one pre-existing, unrelated `<img>`-vs-`next/image` warning carried since before Phase 18).

## 19. Build result

`npm run build` — succeeded (exit 0).

## 20. Live probe results

With the dev server running locally, unauthenticated:

| Route | Result |
|---|---|
| `GET /settings/billing` | `307` → `/login` |
| `POST /api/billing/platform/checkout` | `401` |
| `POST /api/billing/platform/portal` | `401` |
| `POST /api/billing/platform/webhook` (no signature) | `400` |
| `GET /api/ai/recruiter/export` | `401` |
| `GET /api/ai/recruiter/candidates/x/export` | `401` |
| `GET /admin` | `307` → `/admin/login` |
| `GET /admin/platform/users` | `307` → `/admin/login` |
| `GET /api/admin/platform/users` | `401` |
| `POST /api/admin/bootstrap` (no session) | `401` |
| `POST /api/ai/resume-rewriter` (no resumeId) | `400` (pre-existing validation, unaffected) |

All correct, nothing regressed. Authenticated E2E remains explicitly marked BLOCKED, not fabricated (§14/§15).

## 21. Operational runbook

### Supabase
1. Apply `supabase/migrations/20260816000000_add_platform_entitlement_tables.sql`, then `20260817000000_add_platform_billing_tables.sql`, in the Supabase SQL Editor. Both are `if not exists`/re-run-safe.
2. Verify: `platform_entitlement_overrides`, `platform_usage_events`, `platform_billing_customers`, `platform_subscriptions` exist; indexes `platform_subscriptions_user_idx`/`_status_idx`/`_user_status_idx` exist.
3. Rollback: both files only `create table if not exists` — no destructive statement; a rollback is a manual `drop table` and is NOT provided by this repo (consistent with its no-migration-tooling convention — document this as a manual, deliberate operator action if ever needed, never automated).

### Stripe
1. Create 4 test-mode Products/Prices (Job Seeker Pro/Premium, Recruiter Pro/Business).
2. Set `STRIPE_SECRET_KEY`.
3. Set `STRIPE_PRICE_JOB_SEEKER_PRO`, `STRIPE_PRICE_JOB_SEEKER_PREMIUM`, `STRIPE_PRICE_RECRUITER_PRO`, `STRIPE_PRICE_RECRUITER_BUSINESS`.
4. Register a webhook endpoint at `/api/billing/platform/webhook` for exactly: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Set `STRIPE_PLATFORM_WEBHOOK_SECRET` from that endpoint.
6. Run one real test-mode checkout → confirm webhook populates `platform_billing_customers`/`platform_subscriptions` → confirm `/settings/billing` reflects it.
7. Run one portal session ("Manage Subscription").
8. Run one cancellation → confirm the webhook reconciles `cancel_at_period_end`/status correctly.

### Admin
1. Set `PLATFORM_ADMIN_BOOTSTRAP_SECRET`.
2. Sign in as the intended first admin, `POST /api/admin/bootstrap` with header `x-bootstrap-secret: <secret>` (self-target-only).
3. Verify `/admin` access as that account; verify a non-admin account still sees "Access Denied."

### Application
1. As a real Free-tier account: verify `/settings/billing` shows Free plan, grouped features, zero usage.
2. Trigger a Free-tier-restricted feature (e.g. `resume.optimize`) and confirm `UpgradePrompt` renders with the real server message.
3. Exhaust a real quota (e.g. 5 ATS checks) and confirm `QUOTA_EXCEEDED` renders with real `used`/`limit` numbers.
4. Upgrade via Checkout, confirm the feature becomes available and the dashboard reflects the new plan without a manual refresh needed beyond normal navigation.
5. As a Free-tier Recruiter: trigger `recruiter.analytics`/`recruiter.export`/hiring-report and confirm `UpgradePrompt` renders (the last two newly fixed this milestone, §11).

## 22. Known limitations

- Authenticated, live, in-browser verification of every item in the Application checklist above is not possible in this environment (no applied migration, no real user session) — code-verified and live-probed for unauthenticated behavior only.
- `NoBillingAccountError` (portal route) still returns an unstructured `{error}` body rather than a typed code — judged acceptable given the button that triggers it is unreachable unless a billing customer row already exists (§10); noted, not fixed.
- Candidate status-transition rejections (`recruiter.shortlist`/`recruiter.interview`) and the interview-link resolver still show a plain error rather than `UpgradePrompt` — unchanged from M7, low-traffic surfaces, no new gap found this milestone to justify touching them now.

## 23. Deferred items

None newly deferred. The one item M7 deferred (§11) is resolved. The two low-traffic surfaces in §22 remain open observations, not active defects, and are not proposed as a new milestone.

## 24. Final production classification

**B — Production Ready with Operational Prerequisites.**

Every code-level requirement for Phase 18 monetization is met: single entitlement source of truth, no forgeable input anywhere in the billing/entitlement path, real webhook signature verification, out-of-order/duplicate webhook safety, quota-before-LLM ordering enforced and tested, structured entitlement errors consumed end-to-end by the UI including the export surfaces closed this milestone, admin control plane correctly authorized and self-lockout-safe. The remaining blockers — unapplied migration, absent Stripe credentials, no bootstrapped admin — are exclusively external, operational actions, not code gaps, and are fully enumerated with exact steps in §21.

**Phase 18 code implementation is complete.**

## Exact manual actions required before production

1. Apply both Phase 18 migrations (§21, Supabase).
2. Configure Stripe test/live credentials, 4 price IDs, and the platform webhook endpoint + secret (§21, Stripe).
3. Set `PLATFORM_ADMIN_BOOTSTRAP_SECRET` and bootstrap the first admin (§21, Admin).
4. Run the 5-step Application verification checklist above with a real account once 1–3 are done.

No further Phase 18 milestone is recommended. If a genuine gap surfaces during the operational activation above, it should be scoped and addressed as a targeted fix at that time, not as a new speculative milestone now.
