# Phase 18 — Milestone 5: Monetization Enforcement, Feature Gating & Billing UX

## 1. Classification

Product-level entitlement enforcement + billing UX. No new billing/entitlement engine, no new Stripe integration — this milestone closes the gap between what the Phase 18 M1 plan matrix *defines* and what the product *actually enforces* server-side, and extends the existing individual-user billing dashboard to show what it was already collecting but not displaying.

## 2. Complete entitlement coverage audit

25 registered `FEATURE_IDS` (the brief said 24; the actual registry has 25 — Resume: 9, Job: 2, Interview: 5, Recruiter: 9). Before this milestone, only 2 had a real server-side gate at all: `resume.ats.score` (`/api/ai/resume`) and `interview.mock` (`/api/ai/mock-interview`) — Phase 18 M1's own "representative integration." Every other feature with real monetization stakes (a `NONE` or `LIMITED` entry somewhere in `platform-plan-registry.ts`) had **no** `requireFeature()`/`requireQuota()` call anywhere in its route.

| Feature | UI entry | API entry | Before M5 | After M5 |
|---|---|---|---|---|
| resume.ats.score | Resume Analyzer | `/api/ai/resume` | requireQuota (ATS_CHECKS) — M1 | unchanged |
| resume.jd.match | Resume Analyzer | `/api/ai/resume/jd-match` | none | requireQuota (JD_MATCHES) |
| resume.optimize | Resume Analyzer (Optimizer tab) | `/api/ai/resume/jd-match/[id]/optimize` | none | requireFeature |
| resume.rewrite | Resume Rewriter | `/api/ai/resume-rewriter` | none | requireFeature + requireQuota (AI_REWRITES) |
| resume.ai_assistant | Chat widget (site-wide) | `/api/ai/chat` | none | requireFeature |
| resume.builder/templates/versions/export | Resume Versions | various | none | **not gated** — UNLIMITED on every plan, no monetization stakes (see §4) |
| job.match | Job Match tool | `/api/ai/job-match` | IP rate-limit only | + requireQuota (JD_MATCHES) |
| job.analyzer | Job Analyzer tool | `/api/ai/job` | none | requireQuota (JD_MATCHES) |
| interview.prepare | Interview Preparation | `/api/ai/interview-prep` | none | requireQuota (INTERVIEW_PREPARATIONS) |
| interview.mock | Mock Interview | `/api/ai/mock-interview` | requireQuota — M1 | unchanged |
| interview.debrief | Mock Interview Debrief | `/api/ai/mock-interview/[id]/debrief` | none | requireFeature |
| interview.progress | Interview Progress | `/api/ai/mock-interview/progress` | none | requireFeature |
| interview.study_plan | (bundled in interview-prep report) | — | none | **deferred** — no distinct route boundary exists yet (see §4) |
| recruiter.workspace/jobs | Recruiter Workspace | various | none | **not gated** — UNLIMITED on every plan |
| recruiter.candidates | Candidate Import | `/api/ai/recruiter/candidates/import` | none | checkQuota pre-check + per-candidate recordUsage (RECRUITER_CANDIDATES) |
| recruiter.ranking | Candidate Ranking | `/api/ai/recruiter/ranking` | none | **not gated** — never `NONE` on any plan (see §4) |
| recruiter.analytics | Recruiter Analytics | `/api/ai/recruiter/analytics` | none | requireFeature |
| recruiter.shortlist | Candidate status update | `/api/ai/recruiter/candidates/[id]/status` (status="Shortlisted") | none | requireFeature |
| recruiter.interview | Candidate status update / interview link | same route + `/api/ai/recruiter/candidates/[id]/interview-link` | none | requireFeature (both) |
| recruiter.export | Candidate/comparison export | `/api/ai/recruiter/export` | none | requireFeature + requireQuota (RECRUITER_EXPORTS) |
| recruiter.hiring_report | Hiring Decision Report export | `/api/ai/recruiter/export?type=hiring-report` | none | requireFeature |

## 3. Features already correctly protected (untouched)

`resume.ats.score` and `interview.mock` — M1's representative integrations, already correct, not modified. `/api/admin/platform/**` and the whole `/admin/**` tree — M3/M4's platform-admin authorization, unrelated to per-user monetization, not touched.

## 4. Genuine gaps discovered — and deliberately-not-implemented ones, with reasoning

**Implemented (18 routes, 15 features):** every route in the table above marked "after M5" with a real check.

**Deliberately left ungated, and why:**
- `resume.builder/templates/versions/export`, `recruiter.workspace/jobs`, `recruiter.ranking` — `UNLIMITED` (or never `NONE`) on **every** plan tier in the current registry. Adding a `requireFeature()` call here would always pass — it's a no-op that adds latency and false the appearance of enforcement without ever actually restricting anything. Not implemented.
- `interview.study_plan` — the study plan is bundled *inside* `interview-prep`'s report payload (`prepService.generate()`'s own output), not served by a separate route/action. `interview.prepare` already gates the report's generation. Gating "viewing the study plan tab" specifically would require a new route boundary that doesn't exist yet — flagged for M6, not invented here (Section 12: no premature rebuild).

**A judgment call worth flagging explicitly:** `resume.ai_assistant` is `NONE` on the Free tier and `UNLIMITED` on Pro/Premium — wiring this **blocks signed-in Free-tier users from the site-wide AI chat entirely** (anonymous visitors are completely unaffected — `getOptionalUserId()` is a no-op for them, live-verified in §22). This is a real, product-visible behavior change, authorized by the milestone's own Section 4 ("preserve existing behavior *unless the plan matrix explicitly says otherwise*") and the plan registry's own header comment calling these "provisional architecture defaults" meant to actually take effect once wired — but it's the single highest-traffic surface this milestone touches, so it's called out here rather than buried in a diff.

## 5. Server-side enforcement changes

Every route above now derives identity via the existing `getOptionalUserId()` (anonymous-capable routes, no-op when there's no session — preserves every documented "fully anonymous" product family: mock-interview, interview-prep, job-match, job, resume-rewriter, resume/jd-match, chat) or `requireRecruiterId()` (recruiter routes, always-authenticated already). No route accepts a userId, planId, role, or quota value from the client. All gating reuses `requireFeature()`/`requireQuota()`/`checkQuota()`/`recordUsage()` from the existing `entitlement-service.ts` — no second entitlement helper was written.

## 6. Quota changes

No new quota logic in `entitlement-service.ts` (unmodified). Two route-level patterns:
- **Simple metered features** (`resume.jd.match`, `job.match`, `job.analyzer`, `interview.prepare`, `resume.rewrite`, `recruiter.export`): `requireQuota()`/`requireFeature()`+`requireQuota()` before the expensive call, `recordUsage()` only after genuine success.
- **Batch consumption** (`recruiter.candidates` import): a `checkQuota()` pre-check rejects the *entire* batch upfront if already at/over the limit (never burns OpenAI calls on files that would be rejected anyway), then `recordUsage()` is called once per candidate **genuinely added** (`result.imported`) — never for duplicates or failed files.
- `resume.rewrite` specifically needed **both** `requireFeature()` (catches Free's `NONE`) **then** `requireQuota()` (catches a real Pro-tier limit) — calling `requireQuota()` alone would have reported a Free user's rejection as `QUOTA_EXCEEDED` (0/0) instead of the more accurate `FEATURE_NOT_INCLUDED`.

## 7. Usage-event changes

None to `usage-event-service.ts` (audited, unmodified — already server-only, no client-controlled `userId`/`metric`, safe metadata, fails to zero rather than blocking, never throws). All new `recordUsage()` calls are new *callers*, reusing the existing writer.

## 8. Upgrade UX changes

New `src/components/billing/platform/UpgradePrompt.tsx` — the one shared component every entitlement rejection can render, always linking to `/settings/billing`. Deliberately **not** the same component as the pre-existing `src/components/dashboard/usage/UpgradePrompt.tsx` (found during the search this milestone required) — that one belongs to Phase 14's *organization*-scoped credit system and links to `/billing/plans`; reusing it here would send an individual JOB_SEEKER/RECRUITER user to the wrong billing flow. Wired into `ChatBox.tsx` (the highest-traffic surface touched) as a representative integration: a `FEATURE_NOT_INCLUDED`/`QUOTA_EXCEEDED` response now renders the upgrade card inline in the conversation instead of a plain error bubble. Accessible: `role="status"`/`aria-live="polite"`, focus-visible outlines, no color-only signaling (headline text states the situation explicitly), disabled+labeled retry state.

## 9. Billing dashboard changes

`/settings/billing` (audited — already had current-plan display, per-role plan grid, checkout/portal CTAs, graceful Free-state) was missing two things `getBillingOverview()` already returned but never rendered:
- **Usage This Month** — a new section rendering `overview.usage`, filtered to only the metrics this user's own roles could ever consume (`relevantMetricsForRoles()`, derived from the already-imported `PLATFORM_PLAN_DEFINITIONS` — `getBillingOverview()` itself returns all 7 metrics for every role, unfiltered, by M2 design).
- **Feature/quota lists per plan** in the comparison grid — previously just a plan name + upgrade button; now lists each plan's included features with limits, so a user can compare *before* upgrading (Section 8's explicit ask), derived entirely from `PLATFORM_PLAN_DEFINITIONS`/`FEATURE_REGISTRY`, no new catalog.

## 10. Plan comparison changes

Folded into the existing per-role grid on `/settings/billing` rather than a separate page/component (§9) — the milestone explicitly asked to reuse, not duplicate, the existing comparison UI once it existed.

## 11. Role/persona behavior

No hardcoded role→plan assumption was introduced or found. Every gate resolves entitlement via the real multi-role-aware `getEntitlement()`/`checkQuota()` (a user with both JOB_SEEKER and RECRUITER roles is evaluated correctly for each). ADMIN bypass (`isAdmin` → `UNLIMITED` in `getEntitlement()`/`checkQuota()`) is unmodified and untouched by any new call site — live-verifiable structurally: every new gate is a straight call to the existing, already-ADMIN-bypassing functions, no new code path exists that could accidentally re-check role independently.

## 12. Stripe boundary audit

No Stripe code was modified. Re-verified unchanged: browser never receives a secret (`platform-stripe-provider.ts` untouched), checkout/portal creation stays server-side (`/api/billing/platform/{checkout,portal}` untouched), webhook signature verification untouched, customer↔user mapping untouched. `/settings/billing` still makes zero direct Stripe calls from the browser — `getBillingOverview()` remains the only data source.

## 13. Files added

- `src/lib/billing/entitlement-response.ts` + `.test.ts`
- `src/components/billing/platform/UpgradePrompt.tsx`
- `src/app/api/ai/job/route.test.ts`
- `src/app/api/ai/resume-rewriter/route.test.ts`
- `src/app/api/ai/recruiter/candidates/import/route.test.ts`

## 14. Files modified

`src/app/api/ai/{chat,interview-prep,job,job-match,resume-rewriter}/route.ts`, `src/app/api/ai/mock-interview/{[sessionId]/debrief,progress}/route.ts`, `src/app/api/ai/recruiter/{analytics,export,candidates/import,candidates/[candidateId]/{status,interview-link}}/route.ts`, `src/app/api/ai/resume/jd-match/{route.ts,[jdMatchId]/optimize/route.ts}`, `src/components/ai/ChatBox.tsx`, `src/app/settings/billing/page.tsx`, `vitest.config.mts` (added a `resolve.alias` for `@` — see §17).

## 15. Files intentionally untouched

`entitlement-service.ts`, `usage-event-service.ts`, `platform-plan-registry.ts`, `feature-registry.ts` — all audited, all already correct, reused as-is. `/api/admin/platform/**`, all Stripe files, the recruiter status route's other 5 status values (no registry feature maps to them). `/api/ai/recruitment/**` (note: *recruitment*, not *recruiter*) — a separate, older, entirely unauthenticated in-memory system (`jobService.list()` takes no user argument at all) with no per-user scoping to hang an entitlement check on; flagged as a pre-existing, out-of-scope oddity rather than force-fit into this milestone's user-scoped model.

## 16. Migration status

**Migration required for M5: none.** Every change reuses `platform_usage_events` (M1's existing table) and existing service functions; no new column or table.

## 17. Tests added

18 new tests, 4 files: `entitlement-response.test.ts` (8 — the mapping contract for all 3 error codes plus pass-through). Three new **route-handler** tests — the first in this repo — enabled by a `resolve.alias` added to `vitest.config.mts` (routes import via `@/lib/...`, which vitest couldn't resolve before; purely additive, every existing relative-import test resolves exactly as before, confirmed by the full suite still passing). `job/route.test.ts` and `resume-rewriter/route.test.ts` **prove by actually calling the route** that the LLM/service-backed function (`jobService.parseFile`, `rewriteService.start`) is never invoked once `requireQuota()`/`requireFeature()` rejects — not just asserted from code-reading. `recruiter/candidates/import/route.test.ts` proves the batch-quota pre-check and per-candidate (not per-file) usage recording.

Mapped to the 20 enumerated scenarios: 1–7 and 11 are covered directly by the new route tests; 8–10 (spoofed userId/planId/persona) are structural — no route accepts any of these as input, and the existing `entitlement-service.test.ts`/`persona-service.test.ts` suites (unmodified, still passing) already prove the resolution functions never trust client input; 12 is covered by `entitlement-response.test.ts`; 13 (upgrade prompt renders correctly) is a UI-only concern outside this repo's route-only test convention, verified instead by direct code review + a live probe (§22); 14–15 (billing dashboard states) are pre-existing, already-passing behavior, unchanged; 16 (admin not blocked) is structural — every new gate calls the same ADMIN-bypassing `getEntitlement`; 17–20 (anonymous behavior, Stripe webhooks, recruiter/interview-prep regressions) are covered by the full, unmodified suite passing.

## 18. Final test count

**1094 / 1094 passing** (83 test files), up from the 1076 baseline — 18 new, zero modified, zero removed.

## 19. TypeScript result

`tsc --noEmit` — clean.

## 20. Lint result

`eslint .` — clean (the same one pre-existing, unrelated `<img>` warning from earlier milestones).

## 21. Build result

`npm run build` — succeeded (exit 0). Confirmed in the route manifest: every touched `/api/ai/**` route and `/settings/billing` compiled successfully.

## 22. Live validation performed

With the dev server running locally:
- `GET /settings/billing` unauthenticated → `307` to `/login` (unchanged).
- `POST /api/ai/recruiter/candidates/import`, `GET /api/ai/recruiter/analytics`, `GET /api/ai/recruiter/export` unauthenticated → `401`, the same pre-existing `requireRecruiterId()` message (unaffected by the new entitlement gates layered behind it).
- `POST /api/ai/resume-rewriter` with no `resumeId`, `POST /api/ai/job` with no file → pre-existing `400`/`422` validation errors, reached correctly *before* any entitlement check (proves the new gates didn't reorder existing input validation).
- `GET /api/ai/mock-interview/progress` (missing params) and `GET /api/ai/mock-interview/[id]/debrief` (nonexistent session) unauthenticated → pre-existing `400`/`404`, confirming the additive `getOptionalUserId()` gate is a genuine no-op for anonymous callers on both routes.
- `POST /api/ai/chat` unauthenticated with a real message → **`200` with a real, complete AI answer** — this environment does have working OpenAI credentials (unlike prior milestones), so this is a genuine, non-fabricated live proof that `resume.ai_assistant`'s new `requireFeature()` gate does not affect anonymous chat at all, end to end.

## 23. What remains blocked

Authenticated-user E2E (no real Supabase session/user exists in this environment to sign in as), any test of an actual Free-vs-Pro entitlement boundary against live data (no Supabase billing migration applied — M2's `20260817000000_add_platform_billing_tables.sql` remains manually unapplied, per standing instruction), and any Stripe checkout/portal E2E (unchanged from prior milestones, not attempted here).

## 24. Remaining security/monetization risks

- `resume.ai_assistant`'s new gate is a real, live-verified behavior change for signed-in Free-tier users (not anonymous) — worth the site owner's explicit awareness before any Free-tier signups happen for real (§4).
- `recruiter.shortlist`/`recruiter.interview` are gated at specific `CANDIDATE_STATUSES` string values (`"Shortlisted"`, `"Interview Scheduled"`) inside a shared status-update route — correct today, but silently stops enforcing if those exact status strings are ever renamed without updating the two `if` checks in `status/route.ts`. Not a table-driven mapping; flagged rather than hidden.
- `interview.study_plan` remains ungated (§4) — low risk today (no separate route to protect), but should be revisited once/if a distinct study-plan endpoint is built.

## 25. Recommended Phase 18 Milestone 6

Apply the M2 billing migration and the M1 entitlement migration in a real environment, then run the authenticated E2E this milestone explicitly couldn't: a real Free-tier account hitting each new `QUOTA_EXCEEDED`/`FEATURE_NOT_INCLUDED` boundary end-to-end, confirming the UpgradePrompt → `/settings/billing` → checkout path works with real Stripe test credentials. Also a good time to revisit `interview.study_plan` and the two status-value-embedded recruiter gates once real usage data shows whether they matter in practice.
