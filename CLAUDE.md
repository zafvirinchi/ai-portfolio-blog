@AGENTS.md

# Project Overview

A single Next.js application combining a personal portfolio/blog with a large suite of monetized, AI-powered job-search and recruiting products: resume analysis/rewriting/building, JD matching, interview preparation, mock interviews, LinkedIn/cover-letter generation, and a full recruiter workspace (candidate screening, ranking, analytics, exports). Layered on top: an organization-scoped SaaS system (Phase 14) and a separate, newer per-user platform entitlement/billing system (Phase 18-20) with Stripe subscriptions. Not a monorepo — one Next.js app, one `package.json`.

# Actual Technology Stack

Verified directly from `package.json` — do not assume anything not listed here:

- **Framework**: Next.js 16.2.1 (App Router). **Next.js 16 renamed `middleware.ts` to `proxy.ts`** — this repo uses `src/proxy.ts`, not `middleware.ts`. See `AGENTS.md` and `node_modules/next/dist/docs/` before assuming any Next.js API/convention from training data; this version has real breaking changes.
- **UI**: React 19.2.4, Tailwind CSS 4 (`@tailwindcss/postcss`, no `tailwind.config.js`-style JS-heavy config), `lucide-react` icons, `@dnd-kit/*` for drag-and-drop (resume builder section/entry reordering).
- **Language**: TypeScript 5, `strict: true`, path alias `@/* -> src/*`.
- **Data**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`) — Postgres + Auth + Storage. **No ORM.**
- **AI/LLM**: `openai` SDK (direct), plus `langchain`/`@langchain/core`/`@langchain/openai`/`@langchain/langgraph`/`@langchain/textsplitters` for the multi-agent chat graph. `chromadb` for RAG vector storage.
- **Billing**: `stripe` SDK — two independent integrations exist (organization-scoped and platform/per-user-scoped — see Entitlement/Billing section).
- **Documents**: `docx`, `pdfkit`, `exceljs`, `mammoth`, `pdf-parse` (resume/report generation and parsing).
- **Testing**: Vitest 4 only. **No Jest. No React Testing Library. No component/UI test infrastructure exists anywhere in this repo** — UI changes are verified by reading the code and live-probing a running `next dev` server, not by writing `.test.tsx` files.
- **Lint**: ESLint 9 flat config (`eslint.config.mjs`), extending `eslint-config-next` (core-web-vitals + typescript). **No Prettier, no repo-wide formatter** — do not introduce one.
- **Not present**: NestJS, any monorepo tool (Turborepo/Nx/Lerna/pnpm workspaces), Docker, a Supabase CLI project, a Postgres client library (`pg`/`node-postgres`), any migration runner. If a task description assumes any of these, verify against this file and the repo before acting on that assumption.

# Architecture

Standard Next.js App Router layering, consistently applied:

```
UI (Client/Server Components, src/app/**, src/components/**)
  -> API Route Handlers (src/app/api/**/route.ts)
    -> Service layer (src/lib/**/*-service.ts, one file per concern)
      -> Supabase (via supabaseAdmin, service-role) | OpenAI/LangChain | Stripe SDK
```

Two parallel, deliberately-separate subsystems exist for several concerns (organization-scoped vs. per-user "platform" scoped) — see the Entitlement/Billing section. This is not duplication to be "cleaned up" — it is a real architectural decision with its own documentation trail; do not merge them without being explicitly asked to.

# Repository Structure

```
src/
  app/                    Next.js App Router
    (site)/               Public marketing/product pages (route group, no URL segment)
    (auth)/                Login/register/forgot-password/etc. (route group)
    admin/                 Admin CMS UI (blog/interview content authoring + platform admin)
    api/                   All backend logic lives in route.ts handlers here
      ai/                  Every AI-powered feature's routes (resume, job, interview-prep,
                            mock-interview, linkedin, cover-letter, recruiter, recruitment, chat, ...)
      admin/                Admin-only routes (requireAdminRoute() gated)
      billing/              Both billing systems' routes (org + platform)
      saas/, organization/, usage/, auth/, contact/, ingestion/
    settings/, billing/, invite/, auth/   Account-level pages
  components/              React components, organized by feature area (mirrors src/lib/ai/**)
  lib/
    ai/                    Every AI engine/service — one subdirectory per product feature
    auth/                  Enterprise auth: sessions, JWT, MFA, OAuth/SSO, RBAC, security events
    billing/               BOTH billing systems (org-scoped legacy + platform/per-user) — see below
    saas/                  Organization/workspace/team/tenant-context/audit
    supabase/              admin.ts (service-role client), storage.ts
    analytics/, admin/, utils/
    supabase-server.ts, supabase-browser.ts, supabase.ts, auth.ts, constants.ts
  types/                    Shared TS types (blog/project/interview/admin/ai)
  hooks/                    (currently empty — no custom React hooks in active use)
  proxy.ts                  Next.js 16 "Proxy" (formerly middleware) — Supabase session refresh only
supabase/migrations/        15 hand-written, timestamp-ordered .sql files — see Supabase section
PHASE*.md                   Historical per-milestone audit/build reports at repo root (documentation
                             trail, not source code — useful for "why" context, never assume they
                             describe the CURRENT state without verifying against actual source)
```

# Application Boundaries

- **Two billing systems, not one**: `src/lib/billing/{billing-service,subscription-service,stripe-provider,credit-service,plan-service,...}.ts` is the **organization**-scoped system (Phase 14) — `organizations`/`plans`/`subscriptions`/`payments` tables, dynamic Stripe `price_data` checkout. `src/lib/billing/{entitlement-service,platform-*,feature-registry}.ts` is the **platform** (per-Supabase-user) system (Phase 18-20) — `platform_*` tables, fixed Stripe Price IDs, the one that governs every `/api/ai/**` feature. **Never conflate these** — they have separate plan catalogs, separate Stripe webhook endpoints, separate UpgradePrompt components (`src/components/dashboard/usage/UpgradePrompt.tsx` vs `src/components/billing/platform/UpgradePrompt.tsx`), and separate error shapes.
- **Two recruiter-adjacent subsystems**: `src/app/api/ai/recruiter/**` (newer, per-recruiter-owned, consistently entitlement-gated) vs. `src/app/api/ai/recruitment/**` (older, Phase 13, deliberately unauthenticated pipeline system — documented as intentional across 4+ separate audits; do not "fix" its auth model without explicit instruction).
- **AI feature families are mostly ephemeral/session-based, not persisted**: resume-rewriter, mock-interview, interview-prep, LinkedIn Optimizer, Cover Letter Generator all use an in-memory `Map<id, {record, expiresAt}>` store per service (2-hour TTL), keyed by an unguessable `randomUUID()` — no database table, no cross-request persistence. This is deliberate, not a shortcut. The one entitlement gate for each of these families lives at the *session-start* route; per-session sub-actions are intentionally not re-gated (see Entitlement section).
- **Resume Versions** (`src/lib/ai/resume-versions/**`, `src/app/api/ai/resume/versions/**`) is a *different*, persisted (Supabase-backed) resume system from the ephemeral resume analyzer/rewriter — do not conflate "resume" as one subsystem.

# Frontend Conventions

- App Router only; `"use client"` only on components that need interactivity/state — most pages fetch via `fetch()` from a client component's `useEffect`/handler against the app's own `/api/**` routes, not Server Actions (no `"use server"` file exists anywhere in this repo).
- Tailwind utility classes inline; no CSS Modules, no styled-components, no separate design-token file beyond `tailwind.config.ts` (minimal) and `globals.css`.
- Every entitlement-gated feature's client component follows one established pattern: `readEntitlementError()` (from `@/lib/billing/entitlement-client-error`) parses a rejected response, then renders `@/components/billing/platform/UpgradePrompt` — never a raw error string for a structured entitlement rejection, never `<a href>` navigation to an API route that can return a 402 (use `fetch` + blob-download instead; see `@/lib/billing/export-download.ts`).

# Next.js Conventions

- Route handlers: `export async function GET/POST/PATCH/DELETE(req: Request, { params })`, `params` is a `Promise` (Next 15+/16 convention) — always `await params`.
- Dynamic route segments use `[id]`/`[candidateId]` etc.; parallel/intercepting routes are not used anywhere in this repo.
- `src/proxy.ts` (not `middleware.ts`) only refreshes the Supabase session cookie — it does not implement route protection; every route protects itself via its own server-side identity resolution (see Authentication section). Do not add authorization logic to `proxy.ts`.
- No Server Actions (`"use server"`) exist anywhere — all mutations go through `fetch()` to a Route Handler.

# Backend/API Conventions

- One `route.ts` per endpoint, no shared router abstraction, no NestJS-style controllers/modules/decorators (none exist).
- Standard shape: parse/validate body -> resolve identity server-side -> (if monetized) `requireFeature`/`requireQuota` -> call one `*-service.ts` function -> (if monetized) `recordUsage` -> `NextResponse.json(...)`, with a `catch` mapping known error classes to specific status codes (`entitlementErrorResponse()` first, then feature-specific errors, then a generic 422/500 fallback). Follow this exact shape for any new route; do not invent a different error-handling convention.
- Server-only Supabase access always goes through `supabaseAdmin` (`src/lib/supabase/admin.ts`, service-role key, bypasses RLS — **no table in this project has RLS enabled**; every ownership/authorization check is enforced in application code, not the database). Never construct a second Supabase client ad hoc in a route.

# AI/LLM Architecture

- `src/lib/ai/openai.ts` is the one metered OpenAI client wrapper — real LLM calls go through it (directly, or via LangChain's `@langchain/openai` for the multi-agent chat graph).
- Chat is a LangGraph `StateGraph` (`src/lib/ai/graph/**`): `START -> planner -> [tool?] -> promptBuilder -> generation -> END`, strictly acyclic. The `generation` node can invoke `multiAgentCoordinator.run()` (up to 2 parallel specialist agents + a summarizer, `src/lib/ai/multi-agent/**`) — a single user chat message can fan out into up to ~6 LLM calls, metered as **exactly one** `AI_CHAT_MESSAGES` usage unit (never per internal call).
- Tool-calling for chat lives in `src/lib/ai/tools/resume.tool.ts` — a single large dispatcher covering resume/JD/interview/rewrite/LinkedIn/cover-letter/recruiter/recruitment/billing/organization intents via request-scoped `AsyncLocalStorage` contexts (one per feature, e.g. `recruiterRequestContext`, `linkedinRequestContext`). **Any new tool-callable action that reaches a real LLM call must be independently entitlement-checked inside the tool handler** — a chat tool bypassing its own dedicated route's gate has been a real, previously-found defect class in this repo (Phase 19 M5). Never assume the route-level gate protects a chat-reachable path; trace the actual call graph.
- Every "ephemeral session" AI feature (resume-rewriter, mock-interview, interview-prep, LinkedIn, cover-letter) follows the same shape: one `start()`-equivalent call creates the session (may or may not itself be the real LLM call — check each service, they differ), and follow-on sub-actions operate on the already-created session without re-checking entitlement — this is intentional, matching the "charge once per session" commercial model, not a gap.
- Prompt-injection defense: user-controlled content (resume text, JD text, candidate data) is delimited and never directly interpolated into a system-level instruction without going through the existing sanitization/prompt-construction helpers already in each feature's own prompt-building file (see `src/lib/ai/prompt-security.ts` and the numerous `PHASE13_MILESTONE2*_*SECURITY*.md` audit reports for the established pattern). Follow the existing pattern for that feature area; do not invent a new one.

# Supabase/Data Access Rules

- `supabaseAdmin` (service-role) is used everywhere on the server; `supabase-browser.ts` (anon key) only in client components that need a real user-driven Auth flow (login/register/MFA); `supabase-server.ts`'s `createSupabaseServerClient()` is used in Server Components/layouts for reading the session (its cookie-write is a documented no-op there — `proxy.ts` is what actually persists a refreshed token).
- **No RLS anywhere in this project.** All authorization is application-level. Never assume a Supabase query is safe merely because a table has RLS — check the actual server-side ownership filter (`.eq("user_id", ...)`, `.eq("recruiter_id", ...)`) in the calling service function instead.
- Migrations are 15 hand-written, timestamp-prefixed `.sql` files under `supabase/migrations/`, each idempotent (`if not exists`/`on conflict do nothing`). **There is no migration tooling in this repo** (no Supabase CLI project, no `pg` dependency) — every migration file's own header says so explicitly: they are applied manually, in filename order, via the Supabase SQL Editor. Never assume a migration has been auto-applied; verify live before relying on a table's existence, and never write application code that assumes a table exists without a graceful "table not found" fallback (the existing pattern: catch any Supabase error and degrade to a safe default — see `usage-event-service.ts`/`platform-subscription-service.ts` for the established idiom).
- `interview_questions`, `admin_users`, `blogs` (and related CMS baseline tables) pre-date this migrations folder and are not created by any tracked file — do not assume every table the app uses has a corresponding migration in `supabase/migrations/`.

# Authentication & Authorization

Multiple identity layers coexist — know which one a given route actually uses:

- **Supabase Auth** is the root identity source for everything (`auth.users`, real sessions/cookies).
- **Platform personas** (`JOB_SEEKER`/`RECRUITER`/`ADMIN`, `src/lib/billing/persona-service.ts`) live in `auth.users.app_metadata.platform_roles` — writable only via the Supabase Admin API (service-role), never client-writable. A user can hold multiple roles simultaneously.
- **Organization/enterprise auth** (`src/lib/auth/**`) is a separate, fuller system: sessions, JWT, MFA, OAuth/SSO, RBAC, security events/alerts, audit — layered on top of Supabase Auth for the SaaS/organization product surface.
- **The one absolute rule across every one of these layers**: identity is always resolved server-side from a real, verified session (`requireUserId()`, `getOptionalUserId()`, `requireRecruiterId()`, `requirePlatformAdmin()`, `getTenantContext()`, etc.) — **never** from a request body, query parameter, or URL path segment claiming to be the acting user. A path parameter naming a *target* (e.g. `/api/admin/platform/users/[userId]/roles`) is fine — the *acting* admin is still independently resolved from the session.
- Recruiter ownership: every recruiter-scoped query filters by the session-derived `recruiterId` (`.eq("recruiter_id", recruiterId)`), enforced inside the service layer's `requireRecord()`-style helper, not the route. A candidate/job belonging to another recruiter returns "not found," never a distinct 403 that would confirm existence.
- Admin bootstrap (`/api/admin/bootstrap`, `platform-admin-bootstrap-service.ts`) is a special, narrowly-scoped self-target-only mechanism (requires both a real session AND `PLATFORM_ADMIN_BOOTSTRAP_SECRET`, timing-safe compared) — it can only ever promote the caller's own account, never anyone else. Do not extend it into a general role-assignment API.

# Entitlement/Billing/Quota Rules

- **Single source of truth for the platform system**: `src/lib/billing/platform-schema.ts` (`FEATURE_IDS`, `USAGE_METRICS`, plan keys — all typed unions, a typo is a compile error) -> `feature-registry.ts` (category/label/persona metadata) -> `platform-plan-registry.ts` (`PLATFORM_PLAN_DEFINITIONS`, the actual per-plan access/limit/period matrix — every number in this file is a documented **provisional default**, not settled pricing) -> `entitlement-service.ts` (`requireFeature`, `requireQuota`, `checkQuota`, `recordUsage`, `getEntitlement`, `resolveEffectivePlans`, `getBillingOverview`). Every enforcement point in the app calls into this chain; never duplicate a limit/plan constant anywhere else (grep before adding one — this has been verified clean repeatedly).
- **Enforcement pattern, apply exactly**: `getOptionalUserId()` (or `requireUserId()`/`requireRecruiterId()` where the feature has no anonymous path) -> if a session resolved, `requireFeature()` then `requireQuota()` **before** the expensive operation -> run the operation -> `recordUsage()` **after** success only. Anonymous callers are a deliberate no-op for most JOB_SEEKER-side ephemeral tools — preserve that; do not silently require auth on a route that's currently anonymous-capable, and do not silently make a currently-gated route anonymous.
- **One usage unit per user-visible operation**, never per internal LLM sub-call — this already governs chat's multi-agent fan-out and Cover Letter's multi-variant generation. If a change would cause an operation to record usage more than once, or record it before success is confirmed, that is a genuine defect.
- Request-scoped memoization (`withEntitlementCache()`, `AsyncLocalStorage`-based) exists specifically to avoid re-querying Supabase ~75 times per billing-dashboard load — it is deliberately request-scoped only (fresh `Map` per call), never module-global, never cross-request, never cross-user. Do not add a persistent/shared cache in this layer.
- Structured entitlement errors are exactly three real codes: `AUTH_REQUIRED`, `FEATURE_NOT_INCLUDED`, `QUOTA_EXCEEDED` (`entitlement-response.ts`/`entitlement-client-error.ts`). **`BILLING_UNAVAILABLE` is not a code this system emits** — do not invent it or code against it.
- Admin (`ADMIN` role) always bypasses every plan/quota check entirely, regardless of what other roles the account also holds — this is intentional and role-count-agnostic by construction; do not special-case multi-role admin accounts.

# Recruiter Security / Ownership Rules

- Every recruiter-scoped Supabase query must filter by the session-derived `recruiterId`. The established helper pattern is a private `requireRecord(candidateId, recruiterId)` inside the service class that throws a not-found error unless the row matches both id and owner — reuse it, don't inline a fresh `.eq()` chain per route.
- Bulk operations (bulk status change, candidate import) must gate the *entire batch* once, not per-item, and must not allow a partial-success write that bypasses the gate for some items.
- `recruiter.*` feature checks (`recruiter.analytics`, `.export`, `.shortlist`, `.interview`, `.hiring_report`) are reused across every entry point that reaches the same underlying LLM/export operation — including the chat tool path. When adding a new recruiter action reachable from more than one route (dedicated REST route + chat tool), gate every entry point with the identical feature check, not just the first one found.
- The `src/app/api/ai/recruitment/**` legacy pipeline subsystem is intentionally unauthenticated (multiply-documented architectural decision going back to Phase 13) — do not add authentication to it as a side effect of an unrelated change; if a genuine cost/IDOR defect is found in it, fix that specific route only, matching the pattern already used for its one previously-fixed route (`interview-readiness`).

# Interview/Session Architecture

- Mock Interview, Interview Preparation, LinkedIn Optimizer, Cover Letter Generator, Resume Rewriter: all ephemeral, in-memory, TTL-expiring (2 hours), keyed by an unguessable UUID minted only by that feature's own gated `start()` route. Every sub-action route/chat-tool-handler requires an already-valid session id — an unentitled caller can never obtain one, so gating the start route alone protects the whole session by construction. Do not add redundant per-sub-action entitlement checks unless a specific sub-action is proven independently reachable without a valid session id.
- These stores are process-memory (`Map`), not Supabase-backed — they do not survive a server restart and are not shared across server instances. Do not assume persistence for any of these features without checking the specific service file.

# Testing Standards

- **Vitest only**, run via `npm test` (= `vitest run`). Config: `vitest.config.mts`, with an **explicit `include` allowlist** — every new test file must be added to that list or it will never run, silently.
- No component/UI testing library exists — do not add React Testing Library, Enzyme, or `.test.tsx` files; UI changes are verified by direct code reading plus live-probing a running `next dev` server.
- Route handler tests mock `@/lib/supabase-server` (calls `cookies()`), `@/lib/supabase/admin` (constructs a real client at import time, crashes without real env values), `@/lib/saas/tenant-context` (calls `cookies()` at runtime), and often `@/lib/ai/openai` (constructs a real client at import time) — this is the established, required pattern for any new route test; skipping these mocks causes import-time crashes, not test failures.
- `vi.hoisted()` is required for any fake error class referenced inside a `vi.mock()` factory, due to hoisting.
- Never weaken, delete, or skip an existing test to make a change pass. Never reduce test coverage of an entitlement/security-relevant path.

# Build/Lint/TypeScript Commands

Use exactly these — do not invent alternatives:

```
npm run dev      # next dev
npm run build    # next build (production build)
npm run start    # next start (serve a production build)
npm run lint     # eslint
npm test         # vitest run (full suite)
npx tsc --noEmit # TypeScript check — there is no "typecheck" package script; use this directly
```

If `tsc` reports spurious errors after an interrupted dev server session, `rm -rf .next` first — a stale `.next/dev/types` artifact is a known, recurring, unrelated cause, not a real regression.

# Development Workflow

- This repository's actual working convention (evidenced by 20+ `PHASE*.md` reports at the repo root): **audit existing code before changing it**, identify genuine defects with concrete evidence (a failing test, a reproducible bypass, a live-probed incorrect response) rather than speculative improvement, fix minimally and reuse existing patterns/infrastructure, add regression coverage for every genuine fix, run full validation (tests/tsc/lint/build) before declaring anything done, and write up findings. Follow this same discipline for new work.
- Prefer the smallest change that reuses an existing service/helper/pattern over introducing a new one. Before adding anything new, grep for whether an equivalent already exists.

# Security Requirements

1. Server-derived identity must never come from client-supplied `userId`/`recruiterId`/any identity claim in a request body or query parameter.
2. Never trust `userId`, `recruiterId`, `plan`, `role`, `entitlement`, `quota`, or `ownership` values supplied by the client, anywhere.
3. Preserve existing IDOR protections (ownership-filtered queries, `requireRecord()`-style helpers).
4. Preserve the existing "404, not 403, for a non-owned resource" behavior wherever it's already established (avoids confirming existence to an unauthorized caller).
5. Entitlement checks must complete **before** any expensive LLM operation runs — never after, never in parallel where the LLM call could win a race.
6. Usage must never be double-counted because of internal AI-agent/multi-call fan-out — one user-visible operation is one usage unit.
7. Never introduce a second entitlement/billing/quota/usage-ledger system — extend the existing one.
8. Never introduce a duplicate AI engine/generator when an existing one already covers the capability.
9. Never introduce an LLM call that isn't necessary for the feature — prefer deterministic/pure logic when the task doesn't genuinely require model reasoning (many "scoring"/"analytics"/"SEO" features in this repo are deliberately deterministic, zero-LLM-cost).
10. Prefer the deterministic path whenever one already exists for the task at hand.
11. Preserve Stripe webhook signature verification (`constructEventAsync`, raw body never parsed first) and event-ordering protection (the Stripe event's own `created` timestamp gates writes, not wall-clock time) exactly as implemented.
12. Never expose a secret to client-side code — no `NEXT_PUBLIC_`-prefixed secret/API-key/webhook-secret/admin-secret variable, ever.
13. Never weaken authentication/authorization/entitlement/ownership checks to make a test or a task "pass."
14. Never remove or weaken an existing test to make a milestone/change pass.
15. Never silently swallow or skip a stale/error state — surface it (a safe default is fine; silence is not).
16. Preserve existing Supabase ownership boundaries exactly as implemented (no table has RLS — the application-level filter *is* the boundary).
17. Never write application code that assumes a migration has been applied without a graceful fallback; never modify a migration file's already-applied semantics.
18. Never commit or push anything automatically.

# Performance Requirements

- Avoid N+1-shaped Supabase query patterns (the established fix, already applied where discovered: request-scoped memoization via `withEntitlementCache()`, not a persistent cache).
- Avoid redundant identity/session resolution within a single request (calling `requireUserId()`-equivalent more than once per request when the same session is available is a known defect class already fixed once in this repo — don't reintroduce it).
- Do not add caching, memoization, or a rate limiter "for performance" without evidence of an actual, measured cost — this repo's own convention is evidence-based optimization only.

# Error Handling

- Map known error classes to specific HTTP statuses (401 no session, 403 wrong role but real session, 402/404 as established per feature, 400 validation, 422/500 generic fallback) — follow the exact pattern already used in the route you're editing or its nearest sibling, don't invent a new status-code convention.
- Never leak a stack trace, a Supabase error detail, a Stripe secret, or an internal id to a client response — the established pattern is a safe, generic message plus a server-side `console.error` with the real detail.
- A logging/usage-recording failure must never break the feature it's observing (fail open on *logging*, fail closed on *entitlement*) — this asymmetry is deliberate, preserve it.

# Code Review Rules

Use the `pr-review`, `api-review`, `architecture-review`, and `ai-review` skills under `.claude/skills/` for any non-trivial change touching API routes, entitlement/billing, Supabase access, or LLM calls. In particular: **never assume a route being protected means the underlying operation is protected** — trace the actual call graph for every caller (dedicated route, chat tool, alternate/legacy route, bulk route) before concluding an expensive operation is safe.

# Git Rules

- Never commit or push automatically, under any circumstance, unless explicitly asked in that specific turn.
- Prefer new commits over amending; never force-push without explicit instruction.
- Never use `--no-verify` or otherwise bypass hooks/checks.

# Deployment/Production Rules

- No committed deployment config exists (no `vercel.json`, no `Dockerfile`) — the README references Vercel as the default target for a Next.js app; `npm run build` + `npm run start` also works for a self-hosted deployment. Do not invent a deployment pipeline unless asked.
- Production activation requires manual steps outside this repo's own tooling: apply all 15 Supabase migrations in filename order via the SQL Editor (no automated runner exists), configure Stripe (secret key, platform webhook secret + endpoint registration, 4 price IDs), configure `PLATFORM_ADMIN_BOOTSTRAP_SECRET`, and bootstrap the first admin. See the `PHASE20_MILESTONE*.md` reports for the exact, current-as-of-audit runbook.

# Forbidden Changes

Unless explicitly instructed in that specific turn, do not:

- Rebuild, replace, or merge the organization-scoped and platform-scoped billing/entitlement systems into one.
- Add a second migration-running mechanism (Prisma, Drizzle, a custom runner) — this repo's manual-SQL-Editor convention is deliberate.
- Add Redis, a distributed lock, or any new persistent/shared cache for entitlement or rate-limiting purposes.
- Enable RLS on any table as a "fix" — it would conflict with every service-role-based access pattern already in place.
- Add authentication to `src/app/api/ai/recruitment/**` (the legacy pipeline) as a side effect of unrelated work.
- Introduce a formatter/style tool (Prettier, Biome) that isn't already configured.
- Auto-commit, auto-push, or force-push.
- Weaken, delete, or skip a test to make a change pass.
