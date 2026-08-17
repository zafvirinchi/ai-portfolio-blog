# Phase 21 — Milestone 1: Production SaaS Product Readiness & Role-Based Experience Audit

**Scope:** Complete, audit-first review of the current repository's job-seeker, recruiter, admin, billing, navigation, AI-cost/security, persistence, and production-operations surfaces. No speculative features, no new plans/quotas/tables/APIs, no architecture redesign. Fixes were applied only where a defect was concrete, reproducible, low-risk, and fixable by reusing an existing pattern with zero schema/migration changes. Nothing was committed.

**Method:** Five parallel, independent research passes (job-seeker journey, recruiter journey, admin+billing lifecycle, navigation+AI call-graph, persistence+production-ops) each traced actual route handlers, service files, and React components — not filenames, not prior `PHASE*.md` claims taken on faith. Every finding reported below that led to a fix was independently re-verified by direct code reading before any edit was made. Real repository commands only (`npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build`); no invented tooling.

---

## 1. Executive Summary

This is a mature, previously-audited SaaS codebase (20+ prior `PHASE*.md` milestones) with genuinely strong entitlement discipline: a full LLM call-graph trace across ~30 generator functions and 12 feature families found **zero ungated/suspicious LLM call sites** — every real OpenAI call resolves to a verified `requireFeature`/`requireQuota` gate, a documented intentionally-anonymous policy, or structural unreachability without a session id minted by an already-gated route. The admin control plane (bootstrap, last-admin protection, self-lockout confirmation, IDOR, audit logging) was fully re-verified and found **defect-free**.

That said, this audit found and fixed **five concrete, reproducible defects** — two of which meet this milestone's own P0 bar (an unauthenticated cross-tenant private-data leak, and an uncontrolled-LLM-cost exposure reachable by any authenticated non-recruiter account) — plus **two more P0/P1-class findings that are real but were deliberately deferred** because a genuine fix requires a schema change or an infrastructure/policy decision, which this milestone's fix policy explicitly excludes. All five fixes reuse existing patterns already present elsewhere in the same codebase, ship with regression tests (except one pure-UI fix, for which this repo has no test infrastructure by design — verified via `tsc`/`eslint`/live server probe instead), and required zero new dependencies, zero migrations, zero new plans/quotas.

The product is **not** "genuinely ready with nothing further to do" — real, evidenced gaps remain (anonymous LLM-cost exposure on two routes; org-billing webhook duplicate-payment risk; a handful of P2 UX/discoverability issues). A Milestone 2 is justified and scoped in §18.

---

## 2. Actual Architecture (re-verified this milestone)

Confirmed directly against current source, not assumed from `CLAUDE.md`:

- Next.js 16.2.1 App Router, one `package.json`, no monorepo tooling, no NestJS, `src/proxy.ts` (not `middleware.ts`) doing session-cookie refresh only.
- **Two parallel billing systems**, confirmed still genuinely separate: organization-scoped (Phase 14 — `billing-service.ts`/`subscription-service.ts`/`stripe-provider.ts`, dynamic `price_data` checkout) and platform/per-user (Phase 18-20 — `entitlement-service.ts`/`platform-*.ts`, fixed Stripe Price IDs, governs every `/api/ai/**` feature). Separate webhook endpoints, separate secrets, separate `UpgradePrompt` components — confirmed via import grep, never cross-wired.
- **Two parallel recruiter subsystems**, confirmed still accurate: `src/app/api/ai/recruiter/**` (24 route files, per-recruiter-owned, session+entitlement gated) vs. `src/app/api/ai/recruitment/**` (Phase 13 legacy pipeline, deliberately unauthenticated, globally-scoped in-memory stores). One new defect was found *at the boundary* between these two systems (§9, §13) — not a re-litigation of the legacy subsystem's own unauthenticated design, which remains intentional per CLAUDE.md and 4+ prior audits.
- **No RLS anywhere** — confirmed: every ownership boundary is an application-level `.eq("user_id"|"recruiter_id", ...)` filter, enforced via `requireRecord()`-style helpers (`candidate-service.ts`'s private `requireRecord()`, `recruiter-job-service.ts`'s `getJob()`), never a database policy.
- 15 hand-written, timestamp-ordered, genuinely idempotent Supabase migrations (spot-checked 5 directly this milestone) — no migration tooling, manual SQL-Editor application only.
- Real env-var inventory (grepped fresh, not copied from docs): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, 4× `STRIPE_PRICE_*`, `PLATFORM_ADMIN_BOOTSTRAP_SECRET`, `AI_USAGE_ENFORCEMENT`, `NODE_ENV`. `OPENAI_BASE_URL` and `AI_USAGE_ENFORCEMENT` are read by code but not documented anywhere — a minor documentation gap, not a functional risk.
- Ephemeral, in-memory, 2-hour-TTL `Map` sessions for resume-rewriter, LinkedIn optimizer, cover-letter generator, interview-prep, and mock-interview — confirmed genuinely process-memory, not Supabase-backed. Resume Versions is a separate, genuinely persisted (Supabase) system, confirmed distinct.

---

## 3. Job-Seeker Journey Matrix

| Step | Classification | Evidence |
|---|---|---|
| Registration/login | COMPLETE | Real Supabase Auth flow (`src/app/(auth)/**`). |
| Persona selection | MISSING (by design) | No self-service role-picker; `RECRUITER`/`ADMIN` are admin-API-only (`persona-service.ts`). No user-facing "I'm a recruiter" onboarding flow exists. |
| Post-login dashboard | MISSING | No `/dashboard` route exists; `/resume-analyzer` functions as the de facto hub. |
| Resume upload / ATS analysis | COMPLETE | `requireQuota("ATS_CHECKS")` before the LLM call, `recordUsage` after success. |
| Resume Versions create (JD-matched) | **was DEFECT, now FIXED** | Missing platform `requireQuota("JD_MATCHES")`/`recordUsage` — see §13 Finding 1. |
| JD matching, resume optimization | COMPLETE | Correctly gated, `UpgradePrompt` wired. |
| Resume Versions — JD-optimize propose/apply | DEFECT (not fixed, deferred) | Routes correctly reject on quota exhaustion, but the UI renders the raw error string instead of `UpgradePrompt` — no upgrade CTA. §15. |
| Resume Rewriter, LinkedIn Optimizer, Cover Letter | COMPLETE | Session-start correctly gated; sub-actions correctly inherit protection via unguessable session id; chat-tool paths verified consistent with dedicated routes. |
| Interview Preparation | COMPLETE | Correctly gated; reuses one session resolution (no redundant identity calls). |
| Mock Interview | **was DEFECT, now FIXED** | Session id was never recoverable after a page refresh — see §13 Finding 3. |
| Billing checkout/portal/overview, upgrade UI | COMPLETE | Server-derived identity only; `UpgradePrompt` correctly routes each entitlement-error code. |

**Persistence**: Resume Versions = PERSISTED; resume analyzer result, JD match, resume-rewriter/LinkedIn/cover-letter/interview-prep/mock-interview sessions = EPHEMERAL (2h TTL, in-memory); mock-interview's *completed*-session breadcrumb list = CLIENT-LOCAL (`localStorage`, ids only). No ephemeral session's id was found to survive a refresh via `localStorage`/`sessionStorage` anywhere in the app prior to this milestone's mock-interview fix — CLAUDE.md's phrasing ("survives refresh via a client-held id/token") was more optimistic than the actual code; the correction is now reflected here.

---

## 4. Recruiter Journey Matrix

| Step | Classification | Evidence |
|---|---|---|
| Recruiter Workspace access gate | DEFECT (P3, not fixed) | `recruiter/layout.tsx` checks session only, not `RECRUITER` persona — see §15. |
| Dashboard, ranking | COMPLETE (was crash-prone on unauthorized visit — **now FIXED**, §13 Finding 5) | |
| Create/update job (JD parse) | **was DEFECT, now FIXED** | Zero entitlement/persona check despite a real LLM call — see §13 Finding 4. |
| Import candidates + duplicate detection | COMPLETE (minor granularity gap, not fixed) | Quota checked once per batch, not per file — bounded overage, §15. |
| Candidate evaluation/match, recommend, compare | COMPLETE | All correctly gated with `recruiter.analytics`, both REST and chat-tool paths. |
| Shortlist, bulk status change | COMPLETE | Bulk atomicity confirmed: whole batch rejected before any write if any id is unowned/missing; entitlement gate applied once per batch, not per item. |
| Interview readiness (both gated and legacy routes) | COMPLETE | The Phase 19 M3 fix (legacy route) re-verified still in place, with its own regression test intact. |
| Decision (hire/reject), decision history | COMPLETE | Persisted (`decision_history` JSONB), rendered in candidate detail. |
| Analytics, list/comparison/hiring-report exports | COMPLETE | Correctly gated, correct fetch+blob download pattern. |
| Legacy pipeline candidate-report export | **was DEFECT (P0-class), now FIXED** | Unauthenticated, unscoped, leaked private recruiter notes — see §13 Finding 2. |
| Single-candidate PDF export | DEFERRED (pre-existing, re-confirmed, not new) | No entitlement check; deterministic render, no LLM cost — a monetization gap, not a security defect; already knowingly accepted in `PHASE18_MILESTONE8`. |

**Ownership/IDOR**: Every one of the 24 gated recruiter route files calls `requireRecruiterId()` and filters through an ownership-checked service method (`requireRecord()`-equivalent). A non-owned resource 404s, never a distinct 403 — confirmed for both candidate-detail and job-detail routes end to end. Cross-recruiter isolation holds everywhere in the gated system.

---

## 5. Admin Journey Matrix

**No defects found. Every item re-verified COMPLETE against current source**, not assumed from prior audits:

| Item | Status |
|---|---|
| Bootstrap secret comparison | Real `timingSafeEqual`, fixed-size dummy comparison on length mismatch (no timing oracle) |
| Bootstrap target restriction | Self-target-only by construction — no `targetUserId` field exists anywhere in the call chain |
| requireAdminRoute/requirePlatformAdmin | Re-derives role from `app_metadata.platform_roles` via service-role Admin API every call |
| User search/detail, role assignment/removal, override IDOR | Acting admin always session-derived; `[userId]` used only as a lookup target |
| **Last-admin protection** | Real, unconditional block at admin-count ≤ 1 |
| **Self-lockout protection** | Separate two-step confirmation guard for an admin removing their own role |
| Privilege escalation via chat tool | Zero role-mutation calls found anywhere in `src/lib/ai/**` |
| Auditability | Real `audit_logs` writes on every bootstrap/role/override mutation, not a claim |

---

## 6. Billing Lifecycle

### Platform system (per-user, fixed Price IDs) — **no code defects found**

Signature verification, customer→user mapping (DB-backed, not metadata-trusted), plan mapping, webhook idempotency (upsert-by-Stripe-id), **explicit out-of-order-event guard** (`eventCreatedAt >= existing.updated_at`), live entitlement reads (no stale cache), UI sync (bounded retry-poll bridging the webhook-delivery race), separate secrets, separate `UpgradePrompt` — all verified against current source and found correct.

### Organization system (org-scoped, dynamic `price_data`)

| Item | Status |
|---|---|
| Signature verification | COMPLETE |
| Customer/org mapping | COMPLETE but trusts `subscription.metadata.organizationId` directly, no DB cross-check (not externally exploitable — only reachable inside a signature-verified payload) |
| Subscription state idempotency | COMPLETE (upsert by `organization_id`) |
| **Payment/invoice idempotency** | **DEFECT — CODE BLOCKER, not fixed this milestone (needs a migration)**. See §13/§15. |
| **Out-of-order webhook guard** | **DEFECT — not fixed this milestone**. No equivalent to the platform system's `eventCreatedAt` guard. |
| Cancellation/resume, grace period | COMPLETE |

**CODE BLOCKER vs OPERATIONAL BLOCKER, explicitly separated**: the payment-idempotency and event-ordering gaps above are CODE BLOCKERS (present regardless of environment). Everything else billing-related that could not be verified — actual webhook delivery, real checkout→3DS→active transitions, Stripe Portal proration behavior — is an **OPERATIONAL BLOCKER**: no Stripe test/live keys, webhook secrets, or price IDs are configured in this environment, and none were fabricated. Live Stripe validation was not performed and is not claimed.

---

## 7. Navigation Audit

- Resume Analyzer and JD/Job Match are the only two features with a direct primary-nav link; Resume Versions, Resume Rewriter, LinkedIn Optimizer, Cover Letter, Interview Prep, and Mock Interview are all reachable only via a chain of indirect, context-gated links starting from Resume Analyzer (Mock Interview is 4 clicks deep from any nav entry point).
- **No discoverable Login/Signup entry point exists anywhere in site navigation** (`Navbar.tsx`/`Footer.tsx`) — confirmed by exhaustive grep. The only paths in are a direct URL or a reactive post-401 redirect. This is the single largest IA gap found (P2, not fixed — a product/copy decision, not a code defect per se).
- `/recruitment` (legacy pipeline UI) has zero links anywhere in the app — a complete, working 7-tab workspace with no discoverable entry point. Given the subsystem's documented intentionally-unauthenticated design, this may be a deliberate mitigation rather than an oversight; reported per the audit's "implemented but invisible" check, not flagged for a fix.
- Settings sub-pages (Profile/Security/Sessions/Team/Organization/Audit/Activity) are reachable only by first clicking a nav link labeled "Billing."
- One genuine dead-code finding: `src/lib/ai/resume-enterprise/**` (an LLM-invoking module) has zero callers anywhere in the codebase — no exposure, but real unused surface area.
- Recruiter Workspace and platform billing both have real primary-nav entries; org billing (`/billing`) does not, reachable only via a cross-link inside `/settings/*`.

---

## 8. AI/LLM Cost Audit

Every LLM-invoking function across 44 files in `src/lib/ai/**` was enumerated; every caller of every one was traced repo-wide (not just the "obvious" route), per `.claude/skills/ai-review/`'s established methodology. **Total: ~30 distinct generator functions across 12 feature families reviewed. Total UNGATED/SUSPICIOUS entitlement findings: 0.**

The one previously-documented bypass class this repo's own history warns about (Phase 19 M5 — a chat-tool intent handler reaching an LLM call without the same gate as its dedicated REST route) was specifically re-checked for `resume.tool.ts`'s recruiter, rewrite, cover-letter, and LinkedIn intents, and confirmed still fixed, not merely assumed fixed.

The two real defects found in this milestone (recruiter job-creation, resume-versions JD-match) were **entitlement bypasses**, not call-graph bypasses in the Phase 19 M5 sense — both routes had zero alternate caller, they simply never had a gate at all. Both are now fixed (§13).

**The one genuine, unresolved cost-exposure finding**: anonymous-abuse rate limiting. Exactly one route in the entire application (`/api/ai/job-match`) has real per-IP rate limiting (`job_match_requests` table + `rate-limiter.ts`, 3/day). `/api/ai/resume` (resume upload+analyze, multiple OpenAI calls per request) and `/api/ai/chat` (up to ~6 LLM calls per anonymous message via multi-agent fan-out) are both fully anonymous-capable with no rate limit, no CAPTCHA, and no input-size cap — only a `requireQuota()` call that is a documented no-op with no session. This is a real P0-class exposure (§13) that was **not fixed** this milestone — see §15 for why.

---

## 9. Security Audit

Beyond the AI-cost call-graph trace above:

- **Cross-tenant data leak (recruitment legacy export route) — FIXED.** See §13 Finding 2. This is the most severe finding of this entire audit: an unauthenticated route exposed any recruiter's confidential candidate notes for any `recruiter_candidates.id`, with zero pipeline-membership check that its own sibling routes already had.
- **IDOR**: confirmed clean everywhere else checked — every gated recruiter/admin route resolves the acting identity server-side and filters/validates ownership before any read or write.
- **Auth bypass via chat tool**: none found (re-verified for recruiter/rewrite/cover-letter/LinkedIn intents; admin role-mutation confirmed unreachable from any chat path).
- **Client-controlled identity**: none found trusted for an authorization decision anywhere audited.
- **Dynamic execution / hardcoded secrets**: out of scope for this pass (covered by the existing `security-check.mjs` governance hook from the prior Claude Code governance-layer work); nothing new surfaced incidentally.

---

## 10. Persistence Audit

| Workflow | Classification | Refresh/restart/logout/device-switch |
|---|---|---|
| Resume Versions, recruiter jobs/candidates/decisions, billing/subscription state (both systems), admin overrides/audit log | PERSISTED | Survives all five |
| Resume analyzer result, JD match, resume-rewriter/LinkedIn/cover-letter/interview-prep sessions | EPHEMERAL | Lost on refresh (id never URL/storage-carried); server record survives up to 2h if the id itself is somehow retained |
| Mock interview sessions | EPHEMERAL — **was unrecoverable on refresh, now FIXED** | Session id now round-trips through the URL; server record (already 2h TTL) is now actually reachable after a refresh |
| Chat conversation history | CLIENT-LOCAL, in-memory only (not even `localStorage`) | Lost instantly on any refresh/navigation |
| Mock interview's completed-session breadcrumb list | CLIENT-LOCAL (`localStorage`, ids only, matching 2h TTL) | By design |

**Product-critical finding, now fixed**: Mock Interview was the single highest-time-investment ephemeral workflow (multi-question, per-answer LLM evaluation, final debrief) with a completely unrecoverable session id — an accidental refresh mid-interview silently lost the entire transcript even though the server-side record was still alive. This is fixed (§13 Finding 3). The analogous, lower-stakes gap remains for resume-rewriter/LinkedIn/cover-letter (single-shot generations, not multi-turn) — correctly deferred as lower urgency, §15.

---

## 11. Production Operations

| Item | Status |
|---|---|
| Migrations | ENGINEERING COMPLETE — 15 files, spot-checked idempotent |
| Env vars | ENGINEERING COMPLETE (code side); PRODUCTION CONFIGURATION REQUIRED (deployment side) — real list in §2 |
| Stripe configuration (both systems) | PRODUCTION CONFIGURATION REQUIRED — code correct, needs real keys/secrets/price IDs |
| Admin bootstrap | ENGINEERING COMPLETE — real timing-safe secret comparison; operator must still choose a strong secret value (not validated for strength) |
| Deployment config | N/A by design — no `vercel.json`/`Dockerfile`, deliberate per CLAUDE.md |
| Error logging/observability | console.error only — no Sentry/Datadog/etc. dependency exists. PRODUCTION CONFIGURATION REQUIRED if desired; not a defect, an absence |
| Backups/recovery | Nothing in-repo — implicit "Supabase's own backups" assumption, zero runbook or acknowledgment |
| Rate limiting / anonymous abuse | Real gap on 2 of 3 comparable anonymous AI routes — see §8, §13, §15 |
| AI cost ceiling | Model tier uniformly pinned (`gpt-4o-mini`/`text-embedding-3-small`) — a real, if implicit, per-call cost ceiling. No per-request input-size/token cap found anywhere in the resume/JD/mock-interview/LinkedIn/cover-letter services. |

---

## 12. Commercial Readiness

**Job seeker**: can sign up (1), use Free features (5), hit a quota and see a real `UpgradePrompt` on almost every gated feature (6-7), and upgrade (8) — with one confirmed gap (Resume Versions' JD-optimize flow shows a raw error instead of an upgrade CTA, §15) and one now-fixed gap (mock-interview session loss on refresh no longer burns a second quota unit). Understanding the product (1) is weakened by the missing dashboard and the absent Login/Signup nav entry (§7).

**Recruiter**: can create a job, import candidates, evaluate/shortlist/decide, analyze, and export (2-9) — with the job-creation entitlement gap now fixed (previously any account, not just recruiters, could trigger unlimited free LLM calls). Understanding recruiter limits (10) is undermined by the single-candidate export still being silently free (deferred, pre-existing, not new).

**Admin**: every item (bootstrap through audit) verified COMPLETE with no gaps found.

---

## 13. Findings by Severity

**P0 — Security / data-loss / uncontrolled-cost blocker**

1. **[FIXED]** Legacy recruitment pipeline export route (`src/app/api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/export/route.ts`) exposed any recruiter's confidential candidate notes to any caller — no session, no pipeline-membership check — for any `recruiter_candidates.id`, regardless of ownership or pipeline membership. Fixed by adding the same `pipelineService.getByJobAndCandidate()` check its own sibling route already has.
2. **[FIXED]** `POST /api/ai/recruiter/jobs` and `PATCH /api/ai/recruiter/jobs/[jobId]` ran a real LLM call (JD parsing) for any authenticated account, including one with no `RECRUITER` plan at all — unlimited, untracked. Fixed with `requireFeature(recruiterId, "recruiter.jobs")` (an existing, `UNLIMITED`-on-every-recruiter-plan feature id — no new quota introduced).
3. **[DEFERRED — see §15]** `/api/ai/resume` and `/api/ai/chat` are anonymous-capable, multi-LLM-call-per-request routes with zero rate limiting or input-size bound (contrast with `/api/ai/job-match`, which has both). Real, evidenced, unbounded-cost exposure.

**P1 — Core customer journey blocker**

4. **[FIXED]** `POST /api/ai/resume/versions` ran the full JD-match LLM pipeline with no platform entitlement/quota check — an authenticated job seeker could run unlimited JD analyses through this specific entry point, bypassing the 5/month cap enforced everywhere else. Fixed by adding the same `requireQuota`/`recordUsage` calls every sibling route already has.
5. **[FIXED]** Mock Interview's session id was never recoverable after a page refresh, even though the server-side session survives up to 2 hours — the single highest-time-investment ephemeral feature in the product had no recovery path, silently losing an in-progress transcript. Fixed by round-tripping `sessionId` through the URL and restoring via the already-existing `GET /api/ai/mock-interview/[sessionId]` route.
6. **[DEFERRED — see §15]** Organization-billing webhook redelivery can create duplicate `payments`/`invoices` rows (no idempotency check before insert), directly inflating the admin-facing Total Revenue/ARPU figures and the organization's own invoice history.

**P2 — Significant usability or operational problem**

7. **[FIXED]** Recruiter Workspace (`refreshCandidates`/`refreshDashboard`/`refreshRanking`) crashed to Next.js's unstyled default error page for an unauthorized/expired-session visitor, instead of a real message — three functions were missing the `response.ok` check their own sibling `refreshJobs` already had.
8. **[DEFERRED]** Resume Versions' JD-optimize propose/apply flow shows a raw error string on quota rejection instead of `UpgradePrompt`.
9. **[DEFERRED]** No out-of-order webhook guard in the organization billing system's subscription upsert (the platform system has one; the org system doesn't).
10. **[DEFERRED]** Candidate import quota is checked once per batch, not per file (bounded overage).
11. **[DEFERRED]** No discoverable Login/Signup link anywhere in site navigation.

**P3 — Enhancement / polish**

12. Single-candidate PDF export remains entitlement-free (pre-existing, re-confirmed, not new).
13. `/recruiter` layout gate checks session only, not `RECRUITER` persona.
14. `/recruitment` legacy UI has no nav entry point anywhere (possibly intentional).
15. Settings sub-pages reachable only via a nav link labeled "Billing."
16. `src/lib/ai/resume-enterprise/**` is dead code (zero callers, real LLM-integration surface area).
17. Org billing webhook trusts `subscription.metadata.organizationId` without a DB cross-check (not externally exploitable).
18. Chat conversation history has zero persistence, not even `localStorage` (consistent with the ephemeral-by-design family, but total and instant loss on any navigation).

**OPERATIONAL** (code correct, environment/configuration required): Stripe keys/webhook secrets/price IDs for both systems; a strong `PLATFORM_ADMIN_BOOTSTRAP_SECRET` value; external observability tooling if desired; a backup/recovery runbook if desired beyond Supabase's own.

---

## 14. Fixes Made This Milestone

All five fixes reuse an existing pattern already present elsewhere in the codebase. Zero new dependencies, zero migrations, zero new plans/quotas/tables/APIs.

| # | File(s) | Fix | Regression test |
|---|---|---|---|
| 1 | `src/app/api/ai/resume/versions/route.ts` | Added `requireQuota(userId, "JD_MATCHES")`/`recordUsage` around the JD-matched create path, mirroring `/api/ai/resume/jd-match/route.ts` exactly. | `src/app/api/ai/resume/versions/route.test.ts` (3 tests) |
| 2 | `src/app/api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/export/route.ts` | Added `pipelineService.getByJobAndCandidate(jobId, candidateId)` existence check, mirroring the sibling `recommendation/route.ts`, before calling the internal-only export helper. | `.../export/route.test.ts` (2 tests) |
| 3 | `src/app/(site)/mock-interview/page.tsx` | Round-trips `sessionId` through the URL on session start; restores from `GET /api/ai/mock-interview/[sessionId]` on mount when present; clears the param on a stale/expired id. | No `.test.tsx` infrastructure exists in this repo by design (CLAUDE.md Testing Standards) — verified via `tsc --noEmit` (clean), `eslint` (clean), and a live dev-server probe of both the plain and session-recovery URL shapes (200 in both cases; the restore fetch itself is client-side JS, not independently observable via `curl`). Full authenticated browser E2E (start a real session, refresh, confirm recovery) was **not** performed — no browser automation tool was available in this session, and fabricating that claim would violate this milestone's explicit instruction not to claim unverified E2E. |
| 4 | `src/app/api/ai/recruiter/jobs/route.ts`, `src/app/api/ai/recruiter/jobs/[jobId]/route.ts` | Added `requireFeature(recruiterId, "recruiter.jobs")` before the JD-parsing LLM call (POST always; PATCH only when `jobDescriptionText` changes). | `jobs/route.test.ts` (2 tests), `jobs/[jobId]/route.test.ts` (3 tests) |
| 5 | `src/app/(site)/recruiter/page.tsx` | Added the missing `if (response.ok)` guard to `refreshCandidates`/`refreshDashboard`/`refreshRanking`, matching the pattern `refreshJobs` already had. | Same testing-infrastructure note as fix 3 — verified via `tsc`/`eslint` clean. |

`vitest.config.mts`'s explicit test-file allowlist was updated to include all 4 new test files (a new test file not listed there silently never runs, per this repo's own established convention).

---

## 15. Deferred Findings (valid, but out of this milestone's fix bar)

- **Anonymous rate-limiting gap (`/api/ai/resume`, `/api/ai/chat`)** — P0. A real fix requires either a new per-IP-tracking table (mirroring `job_match_requests`, which would be a new migration) or an in-memory-only limiter (a real architectural decision this milestone's fix policy doesn't authorize unilaterally, and CLAUDE.md's own "no rate limiter without evidence" instruction — now satisfied by this audit's evidence, but the actual infrastructure choice belongs to a deliberate Milestone 2 decision, not a silent fix here).
- **Org-billing webhook payment/invoice idempotency** — P1. A real fix requires a unique index on `payments.provider_payment_id` (mirroring the exact precedent already established for `credit_transactions.request_id`/`usage_tracking.request_id`). This milestone's fix policy explicitly excludes migration changes; an application-level check-then-insert guard without the DB constraint would not actually be atomic under concurrent redelivery — shipping it here would create false confidence rather than a real fix, so it was not applied.
- **Resume Versions JD-optimize missing UpgradePrompt** — P2. Contained to 2 React component call sites (`JdOptimizationReview.tsx`); deferred for scope discipline in an already-large fix set, not for risk reasons.
- **Ephemeral session-recovery gap for resume-rewriter/LinkedIn/cover-letter** — P2/P3. Same root cause as the now-fixed mock-interview defect, but these are single-shot generations (lower loss-on-refresh stakes than a multi-turn interview) — the mock-interview fix addressed the one genuinely product-critical instance.
- **Org-billing out-of-order webhook guard** — P2. Requires porting the platform system's `eventCreatedAt` comparison pattern into the org system's `upsertFromProvider()`.
- **Candidate-import per-file quota granularity, Login/Signup nav entry, settings-page discoverability, single-candidate export entitlement, `/recruiter` persona gate, dead code removal** — P2/P3, all scoped and named in §13, none security-critical, all reasonable Milestone 2 candidates.

---

## 16. Operational Blockers (not code defects)

- Live Stripe validation (webhook delivery, checkout/3DS transitions, Portal proration) for both billing systems — no test/live keys configured in this environment; not fabricated.
- Production observability (external error tracking) and a documented backup/recovery runbook — currently absent by omission, not by a coded decision; adding either is an infrastructure choice outside this milestone's audit-first scope.
- A strong, operator-chosen `PLATFORM_ADMIN_BOOTSTRAP_SECRET` value — the code correctly requires and timing-safe-compares it, but does not (and should not) enforce a specific strength policy.

---

## 17. Validation Results

**Baseline (before any fix this milestone):**
```
TSC:    PASS
LINT:   PASS (1 pre-existing warning, 0 errors — unrelated <img> usage in a blog page)
TESTS:  PASS — 1159/1159 (90 test files)
BUILD:  PASS (Next.js 16.2.1, Turbopack)
```

**Post-fix (after all 5 fixes + 4 new regression test files, 10 new tests):**
```
TSC:    PASS
LINT:   PASS (same 1 pre-existing warning, 0 errors — unchanged, unrelated to this milestone)
TESTS:  PASS — 1169/1169 (94 test files) — +10 tests / +4 files, exactly matching the 4 new
        regression-test files added this milestone (3 + 2 + 2 + 3 tests)
BUILD:  PASS (Next.js 16.2.1, Turbopack) — full route manifest generated (182+ routes),
        no new type errors, no new build warnings
```

Both runs used this repository's real, unmodified package scripts (`npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build`) — nothing invented, nothing skipped.

**Live probes performed**: a local `next dev` server was started and smoke-tested for the pages touched by the two UI fixes — `/mock-interview` (plain, and with a URL-supplied `sessionId` that doesn't exist server-side, to exercise the stale-id-clearing path), `/resume-analyzer/versions`, and `/recruiter` (redirected 307 to the login flow, as expected for an unauthenticated request) — all returned the expected server-rendered response with no crash. This confirms server-side rendering and routing are intact; it does **not** constitute authenticated browser E2E (starting a real mock-interview session, refreshing mid-session, and confirming client-side JS restores it), which was not performed — no browser-automation tool was available in this session, and CLAUDE.md's UI-verification convention (no `.test.tsx` infrastructure exists by design) was followed instead via `tsc`/`eslint` plus this server-level probe. This limitation is stated explicitly per this milestone's own instruction not to claim unverified E2E.

No Stripe E2E and no Supabase DDL validation were performed or are claimed, per §6/§16.

---

## 18. Recommended Milestone 2

Justified — three real, evidenced findings remain unresolved at P0/P1 severity, each requiring a genuine schema or infrastructure decision this milestone's fix policy correctly excluded from a same-pass fix:

1. **Anonymous LLM-cost rate limiting** (P0, §13 Finding 3, §15) — decide and implement a per-IP limiter for `/api/ai/resume` and `/api/ai/chat`, most likely by generalizing the existing `job_match_requests`/`rate-limiter.ts` pattern (a new, narrowly-scoped migration, following that exact precedent).
2. **Org-billing webhook payment/invoice idempotency** (P1, §13 Finding 6, §15) — add a unique index on `payments.provider_payment_id` (mirroring `credit_transactions.request_id`'s existing precedent) and switch `paymentService.record()`/`invoiceService.create()` to upsert-or-skip-on-conflict.
3. **Org-billing out-of-order webhook guard** (P2, §13 Finding 9) — port the platform system's `eventCreatedAt` comparison into `subscription-service.ts`'s `upsertFromProvider()`.

A smaller cluster of P2/P3 findings (§13, items 8/10/11/12/13/14/15/16) are reasonable to batch into the same milestone or a follow-up, at the user's discretion — none are blocking on their own.

---

# PHASE CLASSIFICATION:
- **B** — Well-architected, previously-audited codebase with strong entitlement discipline (0 ungated LLM call sites out of ~30 reviewed; admin journey fully defect-free) and two genuine P0-class defects found and fixed this milestone; not "A" because a real, evidenced P0 (anonymous rate limiting) and P1 (webhook idempotency) remain open, and per-instruction were not silently fixed with a non-atomic workaround.

# CODE STATUS:
- **NEEDS FIXES** — 5 concrete defects fixed this milestone with regression tests; 3 P0/P1/P2 findings remain deferred pending a Milestone 2 schema/infrastructure decision (§18).

# OPERATIONAL STATUS:
- **PREREQUISITES** — code is production-correct for both billing systems and admin bootstrap, but requires real Stripe keys/webhook secrets/price IDs, a strong `PLATFORM_ADMIN_BOOTSTRAP_SECRET` value, and (optionally) external observability/backup tooling before a live launch. None of this was fabricated or claimed as verified.

# CUSTOMER JOURNEY:
- **PARTIAL** — all three personas (job seeker, recruiter, admin) can complete their core journey end to end today, but with real, named gaps: no discoverable Login/Signup nav entry, no post-login dashboard, one missing upgrade-prompt wiring (Resume Versions JD-optimize), and the lower-stakes ephemeral-session-loss pattern still present for 3 of 4 non-mock-interview feature families.

# NEXT MILESTONE:
- Yes — see §18. Three genuine P0/P1/P2 findings justify a scoped Milestone 2; this is not manufactured work.
