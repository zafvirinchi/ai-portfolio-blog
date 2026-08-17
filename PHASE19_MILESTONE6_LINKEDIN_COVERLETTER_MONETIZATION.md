# Phase 19 Milestone 6 — LinkedIn Optimizer & Cover Letter Monetization Governance

Audit-first, as chartered. No second billing/quota/usage-ledger system was created. No new database migration. No speculative Redis/rate-limiting infrastructure. No change to Stripe architecture. `UpgradePrompt` was reused, never duplicated. Nothing was committed.

## 1. Executive summary

Phase 19 Milestone 5 classified the platform **D** specifically because LinkedIn Optimizer (~16 routes) and Cover Letter Generator (7 routes) had zero entitlement, quota, or cost-control plumbing of any kind — a genuine, unbounded LLM-cost exposure. This milestone closes that gap.

The architecture audit (§2-4) found both features share the exact same ephemeral, in-memory, ID-keyed session shape already used — and already monetized — by `resume-rewriter`, `mock-interview`, and `interview-prep`. That meant the correct integration was not "add `requireFeature()` to 23 routes" but to find the one true billable boundary each feature already has and gate there, exactly mirroring the already-audited `resume.rewrite` precedent. Two new feature IDs (`resume.linkedin_optimizer`, `job.cover_letter`) and two new usage metrics (`LINKEDIN_OPTIMIZATIONS`, `COVER_LETTERS`) were added — the minimum necessary, reusing the existing 4-category taxonomy, the existing plan tiers, the existing `entitlement-service.ts` functions, the existing `UpgradePrompt` component, and the existing billing dashboard (which required zero new UI code to display the new features — it derives everything from the registry).

Both `POST /api/ai/linkedin` and `POST /api/ai/cover-letter` — the single route each subsystem's entire session hangs off of — now call `requireFeature()`/`requireQuota()` before creating a session and `recordUsage()` exactly once after. Every one of the ~20 remaining sub-action routes, and the chat/tool entry points Milestone 5's own bypass pattern specifically warned to check, are now provably unable to reach a real LLM call without first passing through that one gate — not by convention, but structurally: none of them can obtain a valid session ID any other way.

## 2. Existing architecture audit

Both `LinkedinService` and `CoverLetterService` (`src/lib/ai/linkedin/linkedin-service.ts`, `src/lib/ai/cover-letter/cover-service.ts`) are ephemeral, in-memory, TTL-expiring (`Map<string, {record, expiresAt}>`, 2-hour TTL) session stores — the identical architecture `rewrite-service.ts`/`session-service.ts`/`prep-service.ts` already use, never persisted to a database, never something this milestone's "no unnecessary migration" constraint could apply to.

**Critical distinction found between the two, driving different gate placement (§5):**
- `LinkedinService.start()` is **not async and performs zero LLM work** — it only creates the record. All 7 real generations happen on separately-callable follow-up methods.
- `CoverLetterService.start()` **is async and performs the real, primary LLM call** synchronously (`generateValidatedLetter()` → `generateCoverLetter(ctx)`, producing all 3 style variants in one call — confirmed by the file's own pre-existing comment: "One structured-output call — 3 letter variants together").

## 3. LinkedIn route/call graph

16 routes, all mapped directly from source (not estimated):

| Route | Service method | LLM call? |
|---|---|---|
| `POST /api/ai/linkedin` | `start()` | No |
| `POST .../headline` | `generateHeadlineForStyle()` | **Yes** |
| `POST .../headline/accept` | `acceptHeadline()` | No |
| `POST .../about` | `generateAboutForStyle()` | **Yes** |
| `POST .../about/accept` | `acceptAbout()` | No |
| `POST .../experience` | `generateExperienceSection()` | **Yes** |
| `POST .../projects` | `generateProjectsSection()` | **Yes** |
| `POST .../skills` | `generateSkillsSection()` | **Yes** |
| `POST .../recommendations` | `generateRecommendations()` | **Yes** |
| `POST .../banner` | `generateBannerAndBios()` | **Yes** |
| `POST .../career-interests` | `updateCareerInterests()` | No (user input only) |
| `POST .../featured` | `computeFeatured()` | No (deterministic) |
| `GET .../score` | `computeScore()` | No (deterministic) |
| `GET .../seo` | `computeSeo()` | No (deterministic) |
| `GET .../export` | `.get()` | No |
| `GET .../[linkedinId]` | `.get()` | No |

**True count of billable operations: 7 distinct LLM-backed generators, but 1 billable unit per session** (§5's reasoning) — not 16, not 7. Chat/tool entry point: `resume.tool.ts`'s `handleLinkedinMessage()` calls the same 5 of these 7 generators (about/headline/experience/skills/recommendations) plus the deterministic `computeSeo()`, always via an already-`.get()`-verified `linkedinId` (§11).

## 4. Cover Letter route/call graph

7 routes:

| Route | Service method | LLM call? |
|---|---|---|
| `POST /api/ai/cover-letter` | `start()` | **Yes — the primary generation** |
| `GET .../[coverLetterId]` | `.get()` | No |
| `POST .../letter` | `regenerateLetter()` | **Yes** |
| `POST .../letter/accept` | `acceptLetterVariant()` | No |
| `POST .../email` | `generateEmail()` | **Yes** |
| `POST .../linkedin` | `generateLinkedinMessages()` | **Yes** |
| `GET .../export` | rendering of already-generated content | No |

**True count: 4 distinct LLM-backed operations, 1 billable unit per session** for the same reason as LinkedIn (§5). Chat/tool entry point: `handleCoverMessage()` calls `generateEmail()`/`generateLinkedinMessages()`/`regenerateLetter()`, always via an already-`.get()`-verified `coverLetterId`.

## 5. Commercial policy decision

Used the existing product's own pricing philosophy, not an invented one — `platform-plan-registry.ts`'s own header comment already declares every limit in the file a "PROVISIONAL ARCHITECTURE DEFAULT, not a commercial pricing decision," so adding provisional, clearly-labeled defaults for these two features extends that same, already-declared posture rather than inventing a new category of uncertainty.

**LinkedIn Optimizer** (`resume.linkedin_optimizer`, category `resume`): closest architectural and commercial analog is `resume.rewrite` — both are comprehensive, session-based, multi-section AI generations layered on top of a resume.
- Free: **NONE** (mirrors `resume.rewrite`/`resume.optimize`/`resume.ai_assistant` — this registry consistently keeps the "full comprehensive deliverable" tier of feature off Free)
- Pro: **LIMITED, 30/month** (mirrors `resume.rewrite`'s Pro number exactly — same "charge once per session regardless of internal sub-generation count" shape, so the cost-per-charged-unit is the same order of magnitude)
- Premium: **UNLIMITED**

**Cover Letter Generator** (`job.cover_letter`, category `job`): categorized under `job`, not `resume`, because every cover letter is generated against one specific job application (requires a `jdMatchId`), matching `job.match`/`job.analyzer`'s scope rather than LinkedIn's standing, job-agnostic profile.
- Free: **LIMITED, 3/month** (mirrors `interview.prepare`'s Free-tier number — a comparably substantial single-shot generation, and unlike LinkedIn, cover letters are needed repeatedly *during* an active search, matching the "keep trying" usage shape `job.match`/`interview.prepare` already have real Free access for)
- Pro: **LIMITED, 30/month** (mirrors `resume.rewrite`'s Pro generosity — daily-application-level usage isn't unreasonable during an active search)
- Premium: **UNLIMITED**

Per Step 2's own instruction, this milestone did **not** stop and refuse to implement pending a business decision — the categorical policy (which tier gets access at all) is directly derivable from precedent, and the exact numeric caps are explicitly flagged in code comments as provisional defaults for business review, exactly matching how every other number in this registry was originally introduced.

## 6. Feature registry changes

`platform-schema.ts`'s `FEATURE_IDS`: added `resume.linkedin_optimizer`, `job.cover_letter` (2 new, the minimum for 2 genuinely distinct product capabilities — not one per route).
`feature-registry.ts`'s `FEATURE_REGISTRY`: added matching entries (`category`, `label`, `primaryPersona: "JOB_SEEKER"`).
`platform-plan-registry.ts`: added entitlement entries to the 3 `JOB_SEEKER_*` plan objects only — the 3 `RECRUITER_*` plans were left untouched, since `getFeatureEntitlement()`'s own `?? NONE` fallback already makes an absent key default to `NONE`, matching how every existing JOB_SEEKER-only feature (e.g. `resume.rewrite`) is already handled for RECRUITER plans.

## 7. Usage metric changes

`platform-schema.ts`'s `USAGE_METRICS`: added `LINKEDIN_OPTIMIZATIONS`, `COVER_LETTERS` (2 new, MONTH period). Considered and rejected reusing `AI_REWRITES`: both new features are genuinely distinct product surfaces from `resume.rewrite` with their own user-facing identity — pooling them would make a user's billing dashboard show "AI Rewrites" for a LinkedIn optimization, a misleading conflation with no genuine semantic overlap (unlike `JD_MATCHES`' deliberate, documented pooling across `resume.jd.match`/`job.match`/`job.analyzer`, which really are the same underlying analysis reached from 3 entry points). No duplicate metric was created for the same billable operation in either direction.

## 8. Entitlement enforcement design

**LinkedIn** (`src/app/api/ai/linkedin/route.ts`): gated at `start()` — the single route every one of the 7 real generators structurally requires a session ID from. `start()` itself performs no LLM work, so `recordUsage()` fires immediately after it succeeds, exactly mirroring `resume-rewriter/route.ts`'s own identical pattern (its `start()` is also LLM-free).
**Cover Letter** (`src/app/api/ai/cover-letter/route.ts`): gated at `start()` — here the real LLM call happens synchronously inside `start()` itself, so the gate directly wraps the actual expensive operation, and `recordUsage()` fires only after that generation genuinely succeeded.
Both use the identical `getOptionalUserId()` → conditional `requireFeature()`+`requireQuota()` → operation → conditional `recordUsage()` shape as `resume-rewriter`/`mock-interview`/`jd-match` — no new pattern invented. Anonymous callers are completely unaffected (a no-op, preserving today's existing anonymous-usable behavior exactly, per Step 4's explicit instruction not to silently convert anonymous users into paid ones).

## 9. LLM call protection

Neither `linkedinService.start()` nor `coverLetterService.start()` has any other caller anywhere in the repository (confirmed by exhaustive grep, §15) — meaning an unentitled caller (rejected by `requireFeature`/`requireQuota`) never receives a `linkedinId`/`coverLetterId` at all, and every one of the ~20 remaining sub-action routes and both chat-tool handlers require an already-`.get()`-verified, real session ID before doing anything. **An unentitled request therefore cannot reach any of the 11 real LLM-backed generator functions across both features, through any known path** — proven structurally, not just by convention.

## 10. Usage accounting

Walked through Step 6's own 10-point checklist against the actual code:

1. **Rejected request = zero LLM calls** — yes; `requireFeature`/`requireQuota` throw before `start()` is ever called (both routes), verified by test (§16).
2. **Successful request = exactly one usage event** — yes; `recordUsage()` is called exactly once, only after `start()`'s success is already known.
3. **LLM failure doesn't consume quota** — yes; if `start()` throws (e.g. cover letter's own internal generation-repeatedly-ungrounded error), the catch block returns before `recordUsage()` is ever reached.
4. **Retry can't double-charge** — yes; internal retries inside `generateValidatedLetter()`/the individual generator functions are invisible to the route handler, which calls `recordUsage()` once regardless of how many attempts happened inside.
5. **Internal multi-agent/multi-variant calls don't multiply charges** — yes; Cover Letter's 3 style variants come from ONE `generateCoverLetter(ctx)` call, charged as ONE unit — this is the "one user-visible generation, not multiple billable operations" case Step 5/6 explicitly asked to resolve, and it resolves the same way the chat route's own multi-agent fan-out already does (Phase 19 M2's precedent).
6. **Streaming can't bypass recording** — not applicable; neither route streams a response.
7. **Legacy routes can't bypass the gate** — confirmed; no legacy/duplicate `start`-equivalent route exists for either feature (unlike the JD-optimize legacy-duplicate case Phase 19 M5 found) — exhaustively swept, §15.
8. **Regeneration routes can't bypass the gate** — `letter/route.ts` (regenerate), `about`/`headline`/`experience`/etc. all require an already-gated session ID; they are deliberately NOT independently re-gated, mirroring `resume-rewriter`'s own already-audited "charge once per session" design exactly, not an oversight.
9. **Bulk routes can't bypass the gate** — neither feature has a bulk endpoint; not applicable.
10. **Alternate API routes can't bypass the gate** — confirmed via the exhaustive sweep (§15): every real generator function has exactly one importer (its own service file) plus the gated route/chat-tool consumers.

## 11. Chat/agent bypass audit

Milestone 5's chat bypass (recruiter `compare`/`recommend`) was possible because `recruiterId` was directly the caller's own `authUser.id` — no minted, gate-protected token stood between identity and the expensive operation. **LinkedIn and Cover Letter are structurally different**: `resume.tool.ts`'s `handleLinkedinMessage(linkedinId, ...)`/`handleCoverMessage(coverLetterId, ...)` both start by calling `.get(id)` and bail out immediately if no real record exists (`chat/route.ts:77-89` sources `linkedinId`/`coverLetterId` straight from the client-sent chat body, but that value only unlocks anything if it resolves to a genuine, previously-minted session — and minting one now requires passing the gate). Confirmed by direct read of both handler functions and of `resume.tool.ts`'s complete import list: **neither `linkedinService.start()` nor `coverLetterService.start()` is ever called from the chat-tool file** — chat can only continue an already-gated session, never create one. No code change was needed in `resume.tool.ts`; this is a structural property of the fix in §8, not a separate defense.

## 12. UI / UpgradePrompt integration

`LinkedinSetupForm.tsx` and `CoverLetterSetupForm.tsx` (the two components that call the now-gated `start` routes) were updated identically: `readEntitlementError()` parses a rejected response first; if it's a real entitlement shape, `UpgradePrompt` renders (with `onRetry` wired to the same start handler) instead of the raw error string; anything else falls through to the pre-existing generic error banner (now also carrying `role="alert"`, matching every other error banner in the app). No raw JSON is ever shown, no navigation-away-from-the-app occurs — both symptoms are structurally impossible here since these were already `fetch()`-based `POST` handlers, not `<a href>` navigations (unlike Phase 19 M5's export-link finding). No new `UpgradePrompt` logic was written — both components import and reuse the exact same `@/components/billing/platform/UpgradePrompt` every other gated feature in this app uses.

## 13. Billing dashboard verification

`/settings/billing` required **zero new code to display these features** beyond one label-map entry (§7's `USAGE_METRIC_LABEL` addition, presentation-only text, not a second source of truth). Verified by re-reading `getBillingOverviewUncached()`: it iterates `FEATURE_IDS` generically, so the 2 new feature IDs are automatically included in every `BillingOverview.features` response; `relevantMetricsForRoles()` iterates `PLATFORM_PLAN_DEFINITIONS[planKey].features` for a user's own roles, so `LINKEDIN_OPTIMIZATIONS`/`COVER_LETTERS` automatically appear in the Usage section for any JOB_SEEKER account the moment their plan grants either feature a real (non-NONE) entitlement; `CATEGORY_LABEL`/`CATEGORY_ORDER` in `PlanComparison.tsx` already cover both `resume` and `job` categories, so the plan-comparison grid picks up both new rows with no changes there either. Confirmed via the full existing test suite re-running clean (no hardcoded feature list anywhere broke).

## 14. Security / identity audit

- **Unauthenticated users cannot masquerade as paid users**: `getOptionalUserId()` resolves the real Supabase session server-side; a `null` result takes the same no-op path every anonymous caller already had, never a paid path.
- **`userId` cannot be supplied to obtain another user's entitlement**: neither route ever reads `userId`/`platformUserId` from the request body — confirmed by re-reading both routes' full destructuring (`resumeId`/`rewriteId`/`jdMatchId`/etc. for LinkedIn; `jdMatchId`/`companyName`/`style`/`length` for Cover Letter — no identity field in either).
- **Plan/quota/feature ID cannot be client-supplied**: `requireFeature`/`requireQuota` are always called with a hardcoded feature ID/metric literal in the route source, never anything derived from the request.
- **Admin override remains server-controlled**: unaffected — both routes go through the exact same `entitlement-service.ts` functions every other gated route uses, which already resolve ADMIN bypass/overrides entirely server-side.
- **Cross-user usage cannot occur**: `recordUsage(platformUserId, metric)` always uses the same `platformUserId` resolved from the session at the top of the request, never a value that could diverge mid-request.
- **Request-scoped memoization cannot leak entitlement state**: unaffected by this milestone — `checkQuota()`/`getEntitlement()` are unchanged; the `withEntitlementCache()` isolation already proven safe (Phase 19 M4/M5's own dedicated tests, still passing) applies identically here since these routes call the exact same functions.

## 15. Alternate-route sweep

Exhaustive, repository-wide, run **after** implementation as chartered:

- `grep -rn "linkedinService\."` across the entire `src/` tree: 25 hits total — every one is either the gated `start()` route, a `[linkedinId]` sub-route requiring an already-minted ID, or `resume.tool.ts`'s chat handler (also requiring an already-`.get()`-verified ID). No other caller exists.
- `grep -rn "coverLetterService\."`: 12 hits total, identical shape — the gated `start()` route, `[coverLetterId]` sub-routes, and the chat handler.
- Every raw generator function (`generateAbout`, `generateHeadline`, `generateExperience`, `generateProjects`, `generateSkills`, `generateRecommendationMessages`, `generateBanner`, `generateCoverLetter`, `generateApplicationEmail`, `generateLinkedinMessages`) individually grepped: **each has exactly one importer, its own owning service file** — no route or tool ever imports a raw generator directly, bypassing the service layer.
- `grep -rl "\"use server\""` across the whole repo: **zero results** — no Next.js Server Action exists anywhere that could call these services outside the route layer.

**No unexplained caller remains.**

## 16. Tests

**10 new tests**, 2 new files (both added to `vitest.config.mts`'s explicit allowlist), directly mirroring `resume-rewriter/route.test.ts`'s established mocking pattern:

- **`linkedin/route.test.ts`** (5 tests): anonymous caller reaches `start()` unaffected; a Free-tier user is rejected by `requireFeature()` before `requireQuota()` or `start()` ever run (proving no LLM call is reachable); a Pro-tier user at their limit is rejected by `requireQuota()` before `start()` runs; usage is recorded exactly once for an allowed session; a `resumeId` validation failure rejects at 400 before any entitlement check.
- **`cover-letter/route.test.ts`** (5 tests): same shape, plus a dedicated test proving a Free-tier user *under* their limit is correctly **allowed** through to real generation (since, unlike LinkedIn, Cover Letter has real Free-tier access — this is the one place the two features' commercial policies genuinely differ, and it's the test that would catch a copy-paste inversion of that difference).

Not tested separately: forged-identity/cross-user scenarios — structurally impossible per §14 (no code path reads identity from the body at all, so there is nothing a forged value could influence), consistent with how no other route in this codebase has a dedicated "test for this" either.

**Full suite: 1159 / 1159 passing** (90 test files), up from the 1149 baseline this milestone started with.

## 17. Live probes

Dev server run locally; every probe below is a real HTTP response.

- `POST /api/ai/linkedin` with no `resumeId` → `400` (validates before any entitlement check).
- `POST /api/ai/linkedin` anonymous, bogus `resumeId` → `422 "Resume not found or expired"` — **not** `401`/`402`, confirming anonymous access is fully preserved and the request reaches real service logic, not blocked by the new gate.
- `POST /api/ai/cover-letter` with no `jdMatchId` → `400`.
- `POST /api/ai/cover-letter` anonymous, bogus `jdMatchId` → `422 "JD match result not found or expired"` — same confirmation.
- `POST /api/ai/linkedin/bogus-id/headline` → `422 "LinkedIn optimizer session not found or expired"` — no LLM call reachable, safe generic message, no stack trace.
- `POST /api/ai/cover-letter/bogus-id/linkedin` → `422 "Cover letter session not found or expired"` — same.
- `GET /api/billing/platform/overview` (unauthenticated, sanity check the billing route is unaffected) → `401`.

No real LLM call was triggered by any probe (every probe was deliberately shaped to fail at a pre-LLM validation/lookup step) — `OPENAI_API_KEY` is configured in this environment, so live probes were designed not to spend real API budget, consistent with "no new LLM calls for implementation/testing."

**AUTH_E2E**: not attempted — no authenticated account exists in this environment (unchanged status, every prior milestone).
**STRIPE_E2E**: not applicable — no Stripe code touched this milestone.

## 18. Genuine fixes

1. `POST /api/ai/linkedin` — added `requireFeature`/`requireQuota`/`recordUsage`, closing the entire LinkedIn Optimizer subsystem's unbounded-cost exposure at its one true boundary.
2. `POST /api/ai/cover-letter` — same, closing the entire Cover Letter Generator subsystem's exposure.
3. `LinkedinSetupForm.tsx`/`CoverLetterSetupForm.tsx` — wired `UpgradePrompt` for structured entitlement rejections, replacing a plain error string.
4. `/settings/billing` — one label-map entry added so the 2 new metrics render with real names instead of raw enum strings (everything else is automatic via the registry).

## 19. Deferred findings

1. **Anonymous callers remain fully unmetered for both features** — a deliberate, consistent extension of the existing policy every sibling ephemeral tool (`resume-rewriter`, `mock-interview`, `jd-match`, `interview-prep`) already has, not a new gap; adding anonymous rate-limiting is explicitly out of this milestone's scope ("no speculative Redis/rate limiting").
2. **Exact numeric quota limits (30/month, 3/month, etc.) are provisional defaults**, explicitly labeled as such in code, following this registry's own pre-existing convention for every other number in it — recommended for business/product review, not an engineering gap.
3. **Session-repeatable sub-operation cost** (a user can regenerate the same LinkedIn headline or cover letter many times within one already-charged session) — the same already-accepted, already-classified-MEDIUM trade-off Phase 19 M3/M4/M5 documented for `resume.rewrite`/`interview.mock`, now symmetrically extended to these two features rather than newly introduced.

## 20. Final classification

**B — Production ready with operational prerequisites.**

Milestone 5's specific reason for **D** — LinkedIn Optimizer and Cover Letter sitting entirely outside monetization governance, a genuine unbounded-cost exposure — is resolved: both are now gated at their one true billable boundary, with usage correctly and exactly-once recorded, structured errors correctly surfaced through the existing `UpgradePrompt`, the billing dashboard automatically reflecting both, and an exhaustive alternate-route/chat-tool sweep finding zero remaining bypass. This was not assumed from passing tests alone — every claim above traces to a specific file read, live probe, or test result.

What remains is exactly the same operational trio every milestone since Phase 18 M6 has carried forward, unrelated to this milestone's own work: Supabase migrations not yet applied, Stripe credentials not yet provisioned, admin bootstrap secret not yet set. None of these are code defects; all three are pre-launch operational checklist items with a known, already-documented resolution path.

## 21. Recommended next phase

1. **Operational activation** (unchanged recommendation from every prior milestone): apply the pending Supabase migrations, provision Stripe credentials, set the bootstrap secret.
2. **Business review of the 2 new provisional limits** (§5/§19) — confirm or adjust the 30/month and 3/month defaults against real usage data once live.
3. Given every "D-level" and "top finding" from Phase 19 M3-M6 is now closed, a natural next milestone is a **holistic post-launch monitoring pass** once real traffic exists: verify the provisional quota numbers (here and across the rest of the registry) against actual usage patterns, and revisit the `recruitment/**` subsystem's blanket-open design only if real abuse evidence emerges (per M3/M5's own consistent reasoning) — not before.

---

## Machine-readable recap

```
STATUS: LINKEDIN + COVER LETTER BROUGHT UNDER MONETIZATION GOVERNANCE
TESTS: 1159/1159 passing (90 files, +10 new)
TSC: CLEAN
LINT: CLEAN (1 pre-existing unrelated warning)
BUILD: SUCCESS
LIVE_PROBES: PASS (anonymous access preserved; bogus-session sub-routes rejected safely; no LLM call triggered by any probe)
AUTH_E2E: NOT ATTEMPTED (no authenticated account in this environment — disclosed, not fabricated)
STRIPE_E2E: NOT APPLICABLE (no Stripe code touched this milestone)
MIGRATIONS: NOT APPLIED (unchanged, re-confirmed via live Supabase REST probe)
LINKEDIN_GOVERNED: YES — gated at the one structural boundary (start()), all 7 generator sub-actions and the chat-tool path provably unreachable without it
COVER_LETTER_GOVERNED: YES — gated at the one structural boundary (start()), all 4 generator sub-actions and the chat-tool path provably unreachable without it
LLM_BYPASSES: NONE FOUND (exhaustive alternate-route + chat/tool sweep, zero unexplained callers)
USAGE_ACCOUNTING: EXACTLY-ONCE, PROVEN BY TEST (rejected requests never call start(); successful requests record exactly one unit; internal multi-variant/retry fan-out never multiplies charges)
GENUINE_FIXES: 4 (LinkedIn route gate; Cover Letter route gate; 2 UI UpgradePrompt integrations; 1 billing-dashboard label addition)
DEFERRED: 3 (anonymous traffic remains unmetered by consistent existing design; provisional numeric limits need business confirmation; session-repeatable sub-operation cost — all three explicitly reasoned, none newly introduced)
CLASSIFICATION: B — Production ready with operational prerequisites (the D-level blocker from Milestone 5 is resolved; only the pre-existing operational trio remains)
```
