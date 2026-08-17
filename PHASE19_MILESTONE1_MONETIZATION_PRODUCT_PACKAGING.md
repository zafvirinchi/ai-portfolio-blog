# Phase 19 — Milestone 1: Monetization Product Packaging & Role-Based Billing Experience

## 1. Existing product inventory

Read directly from the existing registries — nothing assumed from naming. 25 features across 4 categories (`feature-registry.ts`'s existing `FeatureCategory`), 6 plans, 3 personas (`platform-schema.ts`).

| Category | Feature | Free | Paid ceiling | Quota-limited | Role |
|---|---|---|---|---|---|
| resume | ATS Score | LIMITED 5/mo | UNLIMITED (Premium) | ✅ ATS_CHECKS | Job Seeker |
| resume | JD Matching | LIMITED 5/mo | UNLIMITED (Premium) | ✅ JD_MATCHES (shared pool) | Job Seeker |
| resume | Resume Optimization | NONE | UNLIMITED (Pro+) | — (boolean) | Job Seeker |
| resume | Resume Rewriting | NONE | LIMITED 30/mo (Pro) → UNLIMITED (Premium) | ✅ AI_REWRITES | Job Seeker |
| resume | AI Resume Assistant | NONE | UNLIMITED (Pro+) | — (boolean) | Job Seeker |
| resume | Builder/Templates/Versions/Export | UNLIMITED | UNLIMITED | none | Job Seeker |
| job | Job Match | LIMITED 5/mo | UNLIMITED (Premium) | ✅ JD_MATCHES (shared pool) | Job Seeker |
| job | Job Analyzer | LIMITED 5/mo | UNLIMITED (Premium) | ✅ JD_MATCHES (shared pool) | Job Seeker |
| interview | Interview Preparation | LIMITED 3/mo | UNLIMITED (Premium) | ✅ INTERVIEW_PREPARATIONS | Job Seeker |
| interview | Mock Interview | LIMITED 2/mo | UNLIMITED (Premium) | ✅ MOCK_INTERVIEWS | Job Seeker |
| interview | Debrief / Progress / Study Plan | NONE | UNLIMITED (Pro+) | — (boolean) | Job Seeker |
| recruiter | Workspace / Job Management | UNLIMITED | UNLIMITED | none | Recruiter |
| recruiter | Candidate Import / Ranking | LIMITED 25/mo | UNLIMITED (Business) | ✅ RECRUITER_CANDIDATES (shared pool) | Recruiter |
| recruiter | Analytics / Shortlist / Interview Pipeline | NONE | UNLIMITED (Pro+) | — (boolean) | Recruiter |
| recruiter | Export | NONE | LIMITED 50/mo (Pro) → UNLIMITED (Business) | ✅ RECRUITER_EXPORTS | Recruiter |
| recruiter | Hiring Reports | NONE | UNLIMITED (Business only) | — (boolean, Business-exclusive) | Recruiter |
| admin | User/role management, entitlement overrides, usage/billing/audit visibility | n/a | n/a | n/a | Admin-only, not a plan tier |

Classification confirms: no feature name misled the actual entitlement (e.g. "Resume Builder" reads as a headline product but is UNLIMITED-everywhere with no monetization stakes — correctly identified in Phase 18 M5 and re-confirmed here, not re-litigated).

## 2. Existing plan audit

`PLATFORM_PLAN_DEFINITIONS` (Phase 18 M1) already implements almost exactly Step 2's suggested structure: `JOB_SEEKER_FREE/PRO/PREMIUM` and `RECRUITER_FREE/PRO/BUSINESS`. **No new plan was added, no plan renamed, no plan removed.** The existing 6-plan matrix is commercially coherent as-is — evaluated against Step 2's suggested tiers and found to already match:

- Job Seeker Free/Pro/Premium ↔ exactly the suggested Free/Pro/Career structure.
- Recruiter Free/Pro/Business ↔ exactly the suggested Free-Trial/Pro/Business-Enterprise structure, and correctly does **not** introduce organization-billing complexity — `RECRUITER_BUSINESS` is still an individual Stripe subscription on one Supabase user, entirely separate from Phase 14's per-organization billing (re-confirmed, unchanged).

## 3. Persona model

JOB_SEEKER, RECRUITER, ADMIN — unchanged from Phase 18 M1. ADMIN remains correctly non-commercial (`ADMIN_BYPASS`, no plan tier, ranked above every plan check in `getEntitlement()`).

## 4. Feature grouping

Step 4's suggested groups (Resume Intelligence / Job Matching / Interview Intelligence / Recruiter Intelligence) map almost exactly onto `FEATURE_REGISTRY`'s existing `category` field (`resume`/`job`/`interview`/`recruiter` — Phase 18 M1). No new grouping dimension was introduced — only the **display labels** were upgraded from Phase 18 M7's utilitarian names ("Resume Tools", "Recruiter Tools") to product-facing ones, now centralized in one place (`PlanComparison.tsx`'s exported `CATEGORY_LABEL`) instead of being duplicated inline in the billing page.

## 5. Commercial plan recommendation

No change recommended to the plan/price matrix itself. The existing 6 plans, their features, and their quotas are commercially sound and already match the milestone brief's own suggested structure almost verbatim. The gap was never in *what* is packaged — it was in *how clearly* it was presented (§7–§9, §13).

## 6. Current-vs-recommended matrix

| Dimension | Current (before this milestone) | Recommended | Status |
|---|---|---|---|
| Plan structure | 6 plans, 2 role families | unchanged | ✅ already correct |
| Feature grouping | flat lists (M5), categorized but plainly labeled (M7) | product-facing category names | ✅ implemented this milestone |
| Plan comparison | inlined in one page, flat per-plan feature list | reusable component, grouped by category | ✅ implemented this milestone |
| "What plan unlocks this?" | absent | shown on `FEATURE_NOT_INCLUDED` | ✅ implemented this milestone |
| Navigation to Recruiter/Billing | absent from primary nav | discoverable link | ✅ implemented this milestone |
| Chat quota ceiling | none at all (true unlimited call volume for any paid/admin account) | recommend a generous ceiling as a cost-safety net | ⚠️ recommended, not implemented (§10) |

## 7. Billing dashboard audit

`/settings/billing` re-verified against Step 5's 9-point checklist: current plan, subscription status, usage, feature categories, limits, upgrade options, manage billing — all present and server-derived since Phase 18 M2/M5/M7. Two items refined this milestone: **feature categories** now use the same product-facing labels as the comparison grid (§4), and **"what changes after upgrade"** is now concretely answerable by the grouped, per-plan feature/limit lists in the extracted `PlanComparison` component (comparing the current-plan card to the next tier's card shows exactly what's added). No marketing language not backed by a real entitlement was added anywhere — every limit, "Unlimited" label, and feature name still originates from `PLATFORM_PLAN_DEFINITIONS`/`FEATURE_REGISTRY` at render time.

**Role/persona indicator** (Step 3/5): already adequate without a new UI element — `overview.plans` is per-role, and the page already renders one "Current Plan" card and one comparison section *per role the user actually holds* (`ROLE_LABEL` badge on each), which functions as the persona indicator. A multi-role user sees both roles' cards side by side, never conflated into one. No dedicated "you are a Job Seeker" banner was added — judged redundant given the per-role cards already convey this at a glance.

## 8. Upgrade UX audit

All 6 questions from Step 7 re-verified:

| Question | Before | After |
|---|---|---|
| Why am I blocked? | ✅ (heading + server message, M5/M7) | unchanged |
| What feature am I trying to use? | ✅ (`featureLabel`, M5/M7) | unchanged |
| **What plan unlocks it?** | ❌ generic "Upgrade required" only | ✅ **"Available on {Plan Name}"** — this milestone |
| What quota is remaining? | ✅ (`used`/`limit`/`period`, M5) | unchanged |
| What happens after upgrading? | implicit (via plan comparison) | unchanged, reinforced by §7 |
| Where do I upgrade? | ✅ (`/settings/billing` or `/login`, M7) | unchanged |

All 11 `UpgradePrompt` call sites (`ChatBox`, `JobMatchUpload`, `JobUpload`, `JdUpload`, `ResumeOptimizerPanel`, `MockInterviewSetup`, `resume-rewriter`/`interview-preparation` pages, `RecruiterDashboardTab`, `RecruiterAnalyticsTab`, `RecruiterReportsTab`) now pass `featureId` through, computed via `findCheapestPlanGranting()` — a pure, static registry lookup (§13 confirms this is not a client-side entitlement decision; the user's actual access remains 100% server-derived).

## 9. Multi-role analysis

Re-confirmed, unchanged from Phase 18 M7's own finding: `getEntitlement()`'s cross-role union (`mostPermissive` across all of a user's resolved plans) is the existing, intentional, tested design — a JOB_SEEKER+RECRUITER user's entitlements are the union of both roles' plans, never conflated or duplicated. Billing: one Stripe customer per Supabase user (`platform_billing_customers`, unique on `user_id`), but subscriptions are per-role-family (`platform_subscriptions.plan_id` scoped to one family; `pickBestSubscriptionForRole()` never crosses families) — so a user CAN hold two simultaneous, independent subscriptions (e.g. Job Seeker Pro AND Recruiter Pro) under one Stripe customer, exactly as Phase 18 M2 designed. The billing dashboard already represents this correctly (one card/section per role). No change needed or made.

## 10. LLM cost analysis

Classified every LLM-consuming route by call volume per request, from each route's own existing implementation/comments:

| Feature | Cost | Basis |
|---|---|---|
| Job Analyzer | LOW | 1 structured-output call |
| Resume Optimize (ephemeral) | LOW–MEDIUM | 1 structured-output call |
| JD Match / Job Match | MEDIUM | 2 calls (parse + match/optimize, or resume-extract + match) |
| Resume Analysis (ATS) | HIGH | "several OpenAI calls internally" (route's own comment) |
| Interview Preparation | HIGH | full multi-stage pipeline — layout, question/answer/topic detection, generation |
| Resume Rewrite (whole-resume) | MEDIUM per call, HIGH cumulative | 1 call per invocation, but section-by-section re-rewrites compound |
| Mock Interview | MEDIUM per turn, HIGH cumulative | 1 call to start, additional calls per answer/hint/evaluation across a session |
| Recruiter Candidate Import | **HIGHEST — per file, batched** | each file = one full resume-analysis call chain (several calls), up to 10 files per request |
| AI Assistant (chat) | HIGH per turn, **no quota ceiling at all** | "planner, tools, generation, multi-agent" — potentially several calls per single message |

## 11. Quota recommendations

**No quota was changed.** Per Step 10's explicit instruction, this section is a recommendation only:

- Every metered feature already has a quota tied to real cost (§10 confirms the existing limits target the genuinely expensive operations — ATS/JD/Interview Prep/Mock Interview/Rewrite/Candidate Import all already have a ceiling).
- **The one real gap**: `resume.ai_assistant` (chat) has a boolean gate (NONE/UNLIMITED) with **no usage metric at all** — a Pro/Premium/Admin account has genuinely unbounded call volume, unlike every other HIGH-cost feature. Recommend introducing an `AI_CHAT_MESSAGES` usage metric with a generous daily/monthly ceiling (e.g. 500/day) purely as an abuse/cost safety net, not a product restriction — sized so no real usage pattern would ever hit it. This is a recommendation for a future milestone, not implemented here (no concrete abuse was observed; Step 10 explicitly forbids speculative rate-limiting changes without one).
- Recruiter candidate import already has the strongest existing protection (batch-level pre-check before any file is processed, per-candidate usage recording, Phase 18 M5) — no further change recommended.

## 12. Navigation/discoverability audit

**One genuine, real gap found and fixed.** The primary site `Navbar` linked to `/resume-analyzer` and `/job-match` but had **zero link to `/recruiter` (the entire Recruiter workspace) or `/settings/billing`** anywhere. Traced further: `/recruiter` was reachable only by typing the URL directly (a self-referential link exists only *within* a candidate's own detail page, not from anywhere entry-level); `/settings/billing` was reachable only *reactively*, after already being blocked by an `UpgradePrompt` — never proactively, so a user couldn't check their plan or usage without first hitting a paywall. Fixed with two new static links (`Navbar.tsx`) — safe regardless of session state, since both destinations already redirect an unauthenticated visitor to `/login` on their own (unchanged, pre-existing behavior), exactly like the existing `/resume-analyzer`/`/job-match` links.

Every other monetized feature was confirmed discoverable via the existing "funnel" cross-links from `/resume-analyzer`'s results page (`resume-rewriter`, `linkedin-optimizer`, `interview-preparation`, `cover-letter` — all pre-existing, unchanged) — this is a legitimate, intentional product flow ("Build → Optimize → Match → Prepare → Practice," §14), not a dead end. No server-side enforcement was touched or weakened by this audit.

## 13. Changes implemented

1. **`src/components/billing/platform/PlanComparison.tsx`** (new) — the plan comparison grid extracted from `/settings/billing/page.tsx` into a genuinely reusable component (Step 6), now grouping each plan's included features by product category instead of one flat list.
2. **`findCheapestPlanGranting(featureId)`** added to `platform-plan-registry.ts` — a pure, static lookup answering "which named tier includes this feature" (Step 7). Never computes a user's actual entitlement; that remains exclusively server-derived.
3. **`entitlement-client-error.ts`** — `EntitlementErrorInfo` extended with `featureId`, threaded from the server's existing `entitlement-response.ts` body.
4. **`UpgradePrompt.tsx`** — now shows "Available on {Plan Name}" for `FEATURE_NOT_INCLUDED` rejections, computed from #2.
5. **11 components** wired to pass `featureId` into `UpgradePrompt` (mechanical prop addition, no logic change): `ChatBox`, `JobMatchUpload`, `JobUpload`, `JdUpload`, `ResumeOptimizerPanel`, `MockInterviewSetup`, `resume-rewriter`/`interview-preparation` pages, `RecruiterDashboardTab`, `RecruiterAnalyticsTab`, `RecruiterReportsTab`.
6. **`Navbar.tsx`** — added `/recruiter` and `/settings/billing` links (§12).
7. **`/settings/billing/page.tsx`** — refactored to use `PlanComparison`; local `ROLE_LABEL`/`CATEGORY_LABEL`/`CATEGORY_ORDER`/`planKeysForRole` duplicates removed in favor of the single source now in `PlanComparison.tsx`.

No entitlement engine, plan registry structure, quota value, Stripe provider, or subscription service was touched. No second registry/enum/quota system was created — every change above reads from or extends the existing single source of truth.

## 14. Tests

6 new tests added, for genuine new logic only (Step 12's own instruction: "add tests only for genuine implementation changes"):
- `platform-plan-registry.test.ts` — 5 new tests for `findCheapestPlanGranting()`: resolves to FREE when already granted there, skips to the first paid tier that grants a Free-excluded feature, resolves to a Business-exclusive tier correctly, never crosses plan families, and is cross-checked against `getFeatureEntitlement()` for every real `FeatureId` in the registry (never names a plan that doesn't actually grant the feature).
- `entitlement-client-error.test.ts` — updated existing assertions for the new `featureId` field, plus 1 new test for malformed-`featureId` handling.

No test was added for the `Navbar.tsx`/`PlanComparison.tsx`/`UpgradePrompt.tsx` UI changes themselves — this repo has no component-testing framework (confirmed again this milestone), and introducing one was out of scope; verified instead via `tsc`, `eslint`, a full build, and live route/nav probing (§18).

## 15. TypeScript result

`tsc --noEmit` — clean.

## 16. Lint result

`eslint .` — clean (the same one pre-existing, unrelated `<img>` warning carried since before Phase 18).

## 17. Build result

`npm run build` — succeeded (exit 0).

## 18. Live probes

CODE VERIFIED (via `tsc`/`eslint`/build) and LIVE-PROBED (dev server, unauthenticated) — clearly distinct from LIVE STRIPE VERIFIED / LIVE SUPABASE VERIFIED, neither of which was attempted (credentials remain unavailable/migration remains unapplied, unchanged from Phase 18 M6–M8):

| Check | Result |
|---|---|
| Homepage HTML contains `href="/recruiter"` | ✅ confirmed present |
| Homepage HTML contains `href="/settings/billing"` | ✅ confirmed present |
| `GET /settings/billing` unauthenticated | `307` → `/login` |
| `GET /recruiter` unauthenticated | `307` → `/login?redirect=/recruiter` |
| `GET /api/billing/platform/overview` unauthenticated | `401` |
| `GET /api/ai/recruiter/export` unauthenticated | `401` |

All correct; the two new nav links do not weaken any server-side gate — both destinations still redirect/reject exactly as before.

## 19. Operational blockers

Unchanged from Phase 18 M6–M8, not re-litigated: platform billing migration unapplied, Stripe credentials unavailable, first platform admin not bootstrapped. This milestone did not touch persistence, Stripe, or admin bootstrap in any way, so none of these statuses changed as a result of this work.

## 20. Deferred items

The `AI_CHAT_MESSAGES` quota recommendation (§11) — a genuine, identified gap (chat has no usage ceiling at all, unlike every other HIGH-cost feature) but deliberately not implemented this milestone per Step 10's explicit instruction against speculative quota/rate-limit changes without a concrete defect. Recommended as the one candidate item for a future milestone, if product/cost data ever shows it's needed.

## 21. Recommended Phase 19 Milestone 2

Only if usage data eventually shows a real need: add the `AI_CHAT_MESSAGES` quota ceiling identified in §10/§11/§20, reusing the existing `entitlement-service.ts`/`usage-event-service.ts` machinery exactly as every other metered feature already does — no new system required. Otherwise, no further gap was identified in this milestone significant enough to justify a dedicated follow-up on its own.
