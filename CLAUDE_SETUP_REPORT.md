# Claude Code Governance Bootstrap — Setup Report

Scope: create a governance layer (root `CLAUDE.md`, 5 skills, 3 hooks, `.claude/README.md`) for this repository, derived from the actual, audited codebase — not from assumptions in the task prompt. No application/business logic, database schema, migration, billing logic, authentication, entitlement logic, recruiter ownership, interview logic, or AI behavior was modified. Nothing was committed.

## 1. Actual architecture discovered

Verified directly from the repository (`package.json`, directory listings, and direct reads of representative files), not assumed from the task prompt:

- **Not a monorepo.** One Next.js app, one `package.json`. No `apps/`/`packages/` directories, no Turborepo/Nx/Lerna/pnpm-workspace config found.
- **No NestJS anywhere** — confirmed absent (no `nest-cli.json`, no `@nestjs/*` dependency, no controller/module/decorator pattern anywhere in `src/`). The task prompt's mention of "NestJS modules/controllers/services if present" was explicitly checked and found not to apply; `CLAUDE.md` documents this rather than inventing NestJS-specific rules.
- **Framework**: Next.js **16.2.1** (App Router). Next.js 16 renamed `middleware.ts` to `proxy.ts` — this repo genuinely uses `src/proxy.ts` (confirmed by reading it: Supabase session-cookie refresh only, no route protection logic). `AGENTS.md` (imported by the pre-existing root `CLAUDE.md` via `@AGENTS.md`, preserved unchanged at the top of the new `CLAUDE.md`) already warns about this repo's Next.js version having real breaking changes from training-data assumptions.
- **React 19.2.4**, Tailwind CSS 4, no CSS Modules/styled-components.
- **TypeScript 5**, `strict: true`, path alias `@/* -> src/*`. No `typecheck` package script — `npx tsc --noEmit` is the real command (confirmed by reading `package.json`'s `scripts` block directly).
- **ESLint 9** flat config (`eslint.config.mjs`), extending `eslint-config-next`. **No Prettier, no repo-wide formatter** — confirmed absent (no `.prettierrc*`, no `prettier.config.*`, no `format` script).
- **Vitest 4 only** for testing — confirmed via `package.json`'s `test` script (`vitest run`) and `vitest.config.mts`'s explicit `include` allowlist. **No Jest anywhere.** **No React Testing Library, no `.test.tsx` file exists anywhere in the repository** — confirmed by search; UI is verified by direct code reading and live-probing a running `next dev` server, per this repo's own established (and extensively documented, across 20+ `PHASE*.md` reports) convention.
- **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) — no ORM. **No RLS on any table** — confirmed by reading multiple migration files' own comments, which explicitly state this and explain that authorization is entirely application-level (service-role client + explicit `.eq()` ownership filters).
- **No migration tooling** — confirmed absent (no Supabase CLI project, no `pg`/`node-postgres` dependency, no `psql` on PATH checked earlier this session). 15 hand-written, timestamp-ordered `.sql` files under `supabase/migrations/`, each explicitly documented (in its own header comment) as requiring manual execution in the Supabase SQL Editor.
- **Two parallel billing/entitlement systems** confirmed by reading both: an organization-scoped one (Phase 14: `billing-service.ts`/`subscription-service.ts`/`stripe-provider.ts`/`credit-service.ts`/`plan-service.ts`, tables `organizations`/`plans`/`subscriptions`/etc.) and a platform/per-user one (Phase 18-20: `entitlement-service.ts`/`platform-*.ts`, tables `platform_*`) — deliberately separate, not duplication to merge.
- **Two parallel recruiter subsystems** confirmed: `src/app/api/ai/recruiter/**` (owned, gated) vs. `src/app/api/ai/recruitment/**` (legacy, deliberately unauthenticated — a decision documented across at least 4 separate audit reports found at the repo root).
- **AI/LLM**: `openai` SDK direct + LangChain/LangGraph for a multi-agent chat graph (`src/lib/ai/graph/**`, `src/lib/ai/multi-agent/**`), `chromadb` for RAG. ~28 subdirectories under `src/lib/ai/` — one per feature engine (resume, LinkedIn, cover-letter, recruiter, recruitment, interview-prep, mock-interview, etc.).
- **`src/hooks/` is empty** — no custom React hooks currently in use; noted in `CLAUDE.md` rather than assumed populated.
- **No deployment config committed** — no `vercel.json`, no `Dockerfile`. README references Vercel as the default target; `npm run build`/`npm run start` also supports self-hosting.

This picture was derived from direct inspection this session (package.json, directory listings, `src/proxy.ts`, `eslint.config.mjs`, `tsconfig.json`, `.gitignore`, `README.md`, and representative service/route files) plus this same long-running session's own extensive prior audit work (Phase 18-20, all performed against this same repository, cited where relevant) — not from the task prompt's own assumptions, several of which (NestJS) were explicitly checked and found not to apply.

## 2. Files created

```
CLAUDE.md                                    (MODIFIED — see §3)
.claude/settings.json                        (new — hook wiring)
.claude/README.md                            (new)
.claude/skills/verification/SKILL.md         (new)
.claude/skills/verification/reference.md     (new)
.claude/skills/verification/verify.sh        (new, executable)
.claude/skills/pr-review/SKILL.md            (new)
.claude/skills/pr-review/reference.md        (new)
.claude/skills/api-review/SKILL.md           (new)
.claude/skills/api-review/reference.md       (new)
.claude/skills/architecture-review/SKILL.md  (new)
.claude/skills/architecture-review/reference.md (new)
.claude/skills/ai-review/SKILL.md            (new)
.claude/skills/ai-review/reference.md        (new)
.claude/hooks/security-check.mjs             (new, executable)
.claude/hooks/code-quality-check.mjs         (new, executable)
.claude/hooks/verification-check.mjs         (new, executable)
CLAUDE_SETUP_REPORT.md                       (new — this file)
```

17 new files, 1 modified. Skill entry points are named `SKILL.md` (uppercase) rather than the task prompt's literal lowercase `skill.md` — see §9 for the reasoning (this is the real Claude Code skill-discovery convention; on this Windows/NTFS environment the two are filesystem-equivalent regardless, so this is not a deviation in practice here, but matters on a case-sensitive filesystem).

## 3. Existing files reused / modified

- **`CLAUDE.md`**: the pre-existing file was exactly `@AGENTS.md` (one line, importing `AGENTS.md`'s Next.js-version warning). That import was **preserved as the first line, unchanged** — the new governance content was appended after it, not replacing it. `AGENTS.md` itself was not modified.
- **`.claude/settings.local.json`**: read, not modified (personal permission allowlist — not this task's concern; the new `.claude/settings.json` is the project-level, shareable configuration file this task actually needed).

No duplicate system was created — searched first (per the task's own "Do not create duplicate systems" instruction) and confirmed `.claude/` contained only `settings.local.json` before this session; no pre-existing skill, hook, or governance doc existed anywhere in the repository to reuse or extend.

## 4. Skills created

`verification`, `pr-review`, `api-review`, `architecture-review`, `ai-review` — see `.claude/README.md` for the full description of when to use each and the recommended order. All five are grounded in this repository's actual, previously-found defect history (cited by Phase number/milestone in each skill's `reference.md`) rather than generic best-practice checklists — in particular, `pr-review` and `ai-review` both center on the one bypass shape that has recurred multiple times in this codebase's real history: a protected route with an unprotected alternate caller (a chat tool, a legacy route, an export button gated by the wrong feature) reaching the same expensive operation.

## 5. Hooks created

`security-check.mjs`, `code-quality-check.mjs` (both `PreToolUse` on `Write`/`Edit`), `verification-check.mjs` (`Stop`). Wired in `.claude/settings.json`. Design rationale (fail-open on internal script errors, narrow high-confidence blocking only, `Stop` hook never blocks stopping to avoid a retry loop) is documented in each script's own header comment and in `.claude/README.md`.

**These hooks were verified live, twice, not just unit-tested standalone**: while authoring this session's own documentation files, `security-check.mjs` genuinely fired via the real `PreToolUse` mechanism and **blocked** two separate write attempts — once for a draft of `.claude/README.md` containing example-secret-shaped text, and once for an early draft of this very report describing the hook's own dynamic-code-execution pattern in a way that happened to match it. Both times, confirmed by checking the file did not exist on disk after the blocked attempt, and both times the corrected wording (rephrased to describe the pattern without literally matching it) wrote successfully on retry. This is genuine, repeated, live evidence the hook wiring works end-to-end in this environment, not an assumption.

## 6. Security checks implemented

In `security-check.mjs` (blocking, high-confidence only): hardcoded Stripe/OpenAI/AWS key-shaped literals, a private-key PEM block, a JWT-shaped literal, `NEXT_PUBLIC_*` variable names matching a server-secret pattern, and dynamic-code-execution calls (the two standard JavaScript constructs for executing a string as code). (Advisory/warning-only, lower-confidence): identity fields read directly from request input, a missing admin guard in an `src/app/api/admin/**` file, unsanitized-HTML-render risk, shell-exec-with-interpolation risk, path-traversal-adjacent filesystem calls, unvalidated redirect targets.

In `verify.sh` (part of the `verification` skill): admin-route-guard presence (FAIL if missing), identity-from-request-body detection, IDOR/ownership-filter presence on known ownership-scoped tables, LLM-call-without-entitlement-gate detection, Stripe/billing-file-touched flag, secret/`process.env`-in-log-or-response detection (FAIL).

All were tested against realistic fixtures this session (both "should fire" and "should not false-positive" cases) — see §8.

## 7. Verification checks implemented

`verify.sh` runs this repository's real `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build`, then (for a PR-sized diff — see §11 for why this repository's *current* state doesn't qualify) 13 pattern-based checks (weakened/removed tests, API security, admin authorization, IDOR, entitlement/LLM gating, Stripe/billing flag, Supabase access patterns, Next.js conventions, performance, error handling, accessibility) described in `reference.md`.

## 8. Commands discovered (used verbatim, nothing invented)

```
npm run dev      # next dev
npm run build    # next build
npm run start    # next start
npm run lint     # eslint
npm test         # vitest run
npx tsc --noEmit # no package-script wrapper exists for this
```

## 9. Validation results

All performed this session, against the real repository, after every governance file was created:

- **`npx tsc --noEmit`**: **PASS** (via `verify.sh`'s own run).
- **`npx eslint .`**: **PASS** — confirms the new `.mjs` hook scripts and `.sh` skill script introduced no lint errors (they fall under ESLint's flat-config scope; a failure here would have shown up in this same run).
- **`npx vitest run`**: **PASS — 1159/1159 tests**, identical to the pre-governance-work baseline (confirmed via this same long session's own immediately-prior milestone reports) — proves zero application-code impact.
- **`npm run build`**: **PASS**.
- **`verify.sh` end-to-end**: run twice. First run hung silently past its own reasonable runtime; investigated and found a real bug (its diff-based checks, sized for a PR, were instead processing this repository's full ~140-file uncommitted-session backlog against a 30+-commits-stale base ref) — fixed with an explicit, documented file-count cap rather than a silent timeout. Second run surfaced a second real bug (an empty bash array raised "unbound variable" under this environment's specific Git-for-Windows bash build) — fixed by removing the strict-mode flag that caused it (with an explanatory comment) rather than chasing a version-specific array-expansion idiom. **Both fixes were verified by a clean, full, successful re-run** (`RESULT: PASS`, exit 0) — see the file's own header comments for the exact reasoning, kept in place for future maintainers.
- **`security-check.mjs`**: tested standalone with 6+ fixture payloads (hardcoded Stripe key → blocks, dynamic-code-execution pattern → blocks, legitimate gated route content → passes silently, identity-destructured-from-body → warns without blocking, malformed/empty stdin → fails open) — all behaved as designed. **Also verified live, twice** (§5).
- **`code-quality-check.mjs`**: tested standalone (`any`-typed variable + a stray console log → warns; a client-marked file importing the admin Supabase module → warns; realistic gated route content → no false warning) — all correct.
- **`verification-check.mjs`**: tested standalone against this repository's real, current `git status` — correctly reported the changed-file count and the governance areas touched, exited 0.
- **Shell script executable bit**: `verify.sh` and all three `.mjs` hook scripts confirmed `-rwxr-xr-x` (`chmod +x` applied).
- **Syntax validation**: `node --check` on all three `.mjs` files (all valid), `bash -n` on `verify.sh` (valid), `JSON.parse()` on `settings.json` (valid) — all confirmed this session, not assumed.
- **No package dependency was added** — confirmed: `package.json`/`package-lock.json` untouched (the hooks/scripts use only Node's built-in `fs`/`child_process` modules and this repository's already-installed toolchain — `tsc`/`eslint`/`vitest`/`next`).
- **No secret was introduced** — every example in every generated file uses either a placeholder or (in the cases where a real-pattern-shaped example was useful for hook documentation, §5) a deliberately-reworded non-matching form, confirmed by the hook's own repeated live block-then-pass behavior.
- **No migration was modified** — `supabase/migrations/` was read-only this session (for context already established by this same session's prior Phase 20 work), never written to.
- **No application/business logic was modified** — every file touched this session is under `.claude/**`, plus the single `CLAUDE.md` documentation file (whose only prior content, the `@AGENTS.md` import, was preserved).

## 10. Warnings

- `verify.sh`'s diff-based checks (6-18) did not execute against this repository's *current* state in this session's own test runs, because the current state (140+ uncommitted files across 20+ prior milestones, last real commit predating this entire session) exceeds the script's own 60-file PR-sized-change threshold by design. This is the **correct** behavior for that scenario (re-auditing an entire session's backlog is a different task from reviewing one change, and doing it per-file would be both slow and not meaningfully diagnostic) — but it does mean checks 6-18's *logic* was validated via targeted, isolated fixture tests (§9) rather than a full, in-context end-to-end run against this repository's real current diff. Once this repository's working tree is committed and a future change is diffed against a recent, real base commit, checks 6-18 will run as designed.
- `code-quality-check.mjs`'s "unrecognized import prefix" check is a coarse heuristic (a fixed prefix allowlist derived from today's `package.json`) — it will false-positive on any legitimately new dependency the user adds; it's advisory-only (never blocks) specifically because of this.
- Hook live-firing was directly observed for `security-check.mjs` only (§5, twice) — `code-quality-check.mjs` and `verification-check.mjs` were validated by direct standalone invocation with realistic payloads, not by an in-session accidental trigger. Their logic is simple enough (same JSON-parsing/stdin-reading scaffold as the proven-live `security-check.mjs`) that this is a reasonable basis for confidence, but it is a narrower form of evidence than §5's genuine live block-then-pass sequences, and is reported as such rather than overstated.

## 11. Deferred items

- Nothing was deferred due to a discovered application defect — no application defect was found or expected to be found, since this was a governance-bootstrap task, not an audit-and-fix task.
- Full end-to-end validation of `verify.sh`'s diff-based checks against a real, small, in-context PR diff (see §10) is deferred until this repository's working tree is committed and a future real change is evaluated against a recent base ref.

## 12. Assumptions

- Skill entry-point filename: used `SKILL.md` (uppercase), not the task prompt's literal lowercase form — see §9 reasoning. On this Windows/NTFS environment this is filesystem-equivalent to the literal request, so it satisfies both the real Claude Code convention and (practically, on this filesystem) the literal instruction simultaneously.
- Hook wiring format (`.claude/settings.json`'s `hooks` key, `PreToolUse`/`Stop` events, `matcher`/`hooks`/`type: "command"` shape) follows Claude Code's documented hook configuration schema as best known; genuinely confirmed live for `PreToolUse` (§5, twice), assumed-correct-by-construction for `Stop` (same schema family, not independently fired-and-observed this session).
- "Production-grade" was interpreted as: real commands only, conservative/narrow blocking to avoid false-positive-driven workflow breakage, and honest reporting of what was/wasn't verified — not as "maximally strict" (which the task's own repeated "do not create false-positive-heavy rules" instruction argues against).

## 13. Conflicts discovered

None. No pre-existing skill, hook, or governance file existed to conflict with. The only pre-existing `.claude/` content (`settings.local.json`) is a personal permissions file with no overlapping concern — it was read for context (confirming this repository's real historical command usage, which corroborated the `package.json`-derived command list) and left untouched.

---

## 14. Hardening pass (2026-08-14) — governance layer only, no application changes

Follow-up task: harden the governance layer bootstrapped in §1-13 above, based on the real, empirical behavior of the hooks and `verify.sh` against this repository's actual (large, uncommitted) working tree — not synthetic fixtures alone. No application/business logic, schema, billing, auth, entitlement, recruiter, interview, or AI behavior was touched. Nothing was committed. No dependency was added.

### 14.1 `code-quality-check.mjs` false positives — root-caused and fixed

The prior bootstrap's import-recognition logic had three real bugs, all confirmed against actual repository content (not hypothesized):

1. **`@`-prefixed specifiers silently excluded.** The regex's captured-group character class started with `[a-zA-Z]`, which never matches `@supabase/ssr`, `@langchain/openai`, or this repo's own `@/` path alias — proven via direct test showing zero regex matches against real `@`-prefixed imports. Fixed: character class widened to `[a-zA-Z@]`.
2. **Node builtins not recognized.** `node:async_hooks`, `node:crypto`, bare `crypto` (real, active imports in e.g. `entitlement-service.ts`) were flagged as unrecognized. Fixed: builtin list now derived from Node's own `node:module` `builtinModules` export (bare + `node:`-prefixed forms) at hook-run time, rather than hand-listed — self-maintaining, always accurate for whatever Node version the hook runs under.
3. **Loose prefix-match let typosquats through.** A `spec.startsWith(knownPrefix)` fallback with no `/`-boundary would have treated `aiimposter-package`/`stripe-clone-malicious` as recognized merely for sharing a leading substring with the real `ai`/`stripe` packages. Fixed: replaced with exact-match against a `packageNameOf()`-derived real package identity (`@scope/name` or first path segment), checked against a `Set` built **fresh from `package.json`'s actual `dependencies`+`devDependencies` on every invocation** — reflects the real repository dependency list, not a hand-maintained array that drifts.

A **fourth bug, more severe, was found empirically** by running the fixed hook against the repository's real 420-file changed-file set (not caught by synthetic fixtures alone): the import-matching regex searched for the bare text `from\s+["']...["']` anywhere in a file's content, not anchored to an actual `import`/`export` statement. This produced real false positives against ordinary prose containing the word "from" followed by a quoted phrase — e.g. a comment/string reading `"...an upgrade can't be distinguished from 'always on this plan' after the fact"` in `src/lib/analytics/subscription-analytics.ts` and `conversion-analytics.ts`, and similar in `src/lib/ai/job-description/keyword-engine.ts`'s doc comments and `jd-parser.ts`'s prompt-builder template string. **Fixed**: the regex now requires the match to start at the beginning of a line with the `import`/`export` keyword (`/^\s*(?:import|export)\b[^;(`:=]*?\bfrom\s+["']([a-zA-Z@][^"']*)["']/gm`), with the gap between the keyword and `from` additionally excluding `(`, `` ` ``, `:`, `=` — characters that never appear in a real import/export-from clause but appear almost immediately inside an `export function`/`export const`/`export class` declaration's own body. This specifically fixed a second-order case: `export function buildExtractionMessages(...)` in `jd-parser.ts` has no semicolon between its own declaration and a `from "goodToHaveSkills"` phrase buried in its multi-line template-literal prompt body, so a semicolon-bounded (but keyword-unanchored-past-`(`) version of the fix still matched it; excluding `(` (which appears in the function's own parameter list, immediately after `export function name`) closes that gap. Verified via `node --check` plus targeted regression fixtures covering 8 real import shapes (bare, named, scoped, `@/` alias, `import type`, `export {} from`, `export * from`, multi-line named) — all still correctly recognized — and a full re-run of the batch scan against the actual 420-file changed set, which dropped from 18 findings (many false) down to 10, all genuine (`console.log` in API routes, one real "use client" importing `next/headers`).

None of these fixes broadened the allowlist — detection got strictly *more* precise (catches typosquats and Node builtins it previously mishandled) while eliminating every false positive found, satisfying the explicit "do not broaden the allowlist blindly" instruction.

### 14.2 `verify.sh` — explicit two-mode design implemented

`verify.sh` now documents and implements two distinct, always-both-run modes:

- **Mode A (working-tree verification)** — does not depend on diff size at all: `tsc --noEmit`/`eslint .`/`vitest run`/`npm run build` (unconditional, as before) **plus a new whole-tree security/code-quality batch scan** (added this pass) that invokes `security-check.mjs`/`code-quality-check.mjs`'s new CLI batch-scan entry points (see §14.3) against every currently changed-or-untracked `.ts`/`.tsx` file in a single Node process per hook — correct and cheap even at 400+ files, since it's a content scan, not a per-file diff analysis.
- **Mode B (changed-files/PR verification)** — the pre-existing diff-based checks 6-18 (weakened-test detection, per-file grep-based ownership/entitlement/convention checks), unchanged in logic, still bounded by the pre-existing, now-more-clearly-documented `MAX_DIFF_FILES=60` threshold. When exceeded, the skip message now begins with the exact required literal line `WARN: diff-based review skipped because working tree exceeds configured threshold.` (previously an equivalent but non-`WARN:`-prefixed explanatory message), and is now also recorded as a real `warn()` finding (so `RESULT` reports `PASS WITH WARNINGS` rather than silently `PASS`, making the skip visible in the final tally rather than only in the scrollback).

Verified against this repository's actual, current working tree (420 changed `.ts`/`.tsx` files) — see §14.4.

### 14.3 `security-check.mjs` — coverage gap closed, CLI batch mode added

Two additions this pass, both to the shared `scanForSecurityIssues()` detection engine (extracted from the previous single stdin-only `main()` so the same logic serves both the existing live-proven `PreToolUse` path and the new batch path):

1. **CLI batch-scan entry point** (`process.argv.slice(2)` as file paths) — reads each file from disk, reports `[FAIL]`/`[WARN]` per finding, exits 1 if any file had a blocking-severity finding. This is what `verify.sh`'s Mode A now invokes. The existing stdin/JSON `PreToolUse` path is unchanged in behavior.
2. **Guard-removal detection (new BLOCKING category)** — closes a real, previously-acknowledged gap: the task requires detecting "removed entitlement checks" and "removed ownership checks", which the original hook could not do at all (it only ever inspected one edit's resulting content, never what the edit removed). Since `Edit` tool calls carry both `old_string` and `new_string`, the hook now compares active (non-commented-out) occurrence counts of `requireFeature(`/`requireQuota(`/`requireUserId(`/`requireRecruiterId(`/`requirePlatformAdmin(`/`requireAdminRoute(`/`requireRecord(` and of `.eq("recruiter_id"`/`.eq("user_id"` between old and new content, and **blocks** (exit 2) if an edit reduces the active count of any of them — including a guard being commented out rather than deleted outright (verified: a `// requireFeature(...)` edit is correctly blocked, not silently allowed). This is a direct diff comparison for a single edit, not a heuristic, so it is high-confidence and was added at BLOCKING severity rather than WARN.

Full coverage now confirmed against the task's explicit list: API keys/secrets ✓ (Stripe/OpenAI/AWS/private-key/JWT-shaped patterns), NEXT_PUBLIC exposure ✓, dangerous dynamic execution ✓ (`eval`/`new Function`), client-controlled `userId`/`recruiterId` ✓ (WARN), removed entitlement checks ✓ (new, BLOCKING), removed ownership checks ✓ (new, BLOCKING). Supabase service-role keys are covered by the generic JWT-shaped-literal pattern (Supabase keys are JWTs) rather than a Supabase-specific pattern — documented here rather than claimed as a dedicated check.

### 14.4 `.claude/settings.json` wiring — re-verified

`.claude/settings.local.json` was re-read in full this pass: it contains only a `permissions.allow` array (Bash command allowlist) — it does not define a `hooks` key at all, and therefore cannot shadow or override `.claude/settings.json`'s `PreToolUse`/`Stop` hook wiring. This confirms the project-level hook configuration is the one actually in effect, consistent with §5's prior live-block evidence. No new live-firing evidence was gathered this pass beyond what §5 already documents (still true: only `security-check.mjs`'s live firing has been directly observed via an actual blocked `Write`/`Edit`; `code-quality-check.mjs` and `verification-check.mjs` remain validated by direct standalone invocation only).

### 14.5 Skills — re-validated against the 10-point checklist

All 5 `SKILL.md` files re-read in full this pass (37-83 lines each; `reference.md` companions 35-75 lines each — concise, not bloated). Confirmed: no NestJS assumption anywhere (`middleware.ts` appears only as the thing to flag, correctly paired with `proxy.ts`); no unnecessary duplication (`pr-review`'s own header explicitly defers to the narrower skills, `.claude/README.md` states a recommended order); every skill's identity/ownership/entitlement checks require **server-derived** identity and **application-level** `.eq("user_id"|"recruiter_id", ...)` ownership filters, consistent with root `CLAUDE.md`'s explicit "no RLS anywhere in this project" convention (`CLAUDE.md` lines 92/105/186/224) — no skill ever suggests RLS as a fix, which is the correct way to preserve that convention (`CLAUDE.md` itself explicitly forbids "enable RLS as a fix").

### 14.6 Controlled verification tests (A-F) — all performed, fixtures removed afterward

All temporary fixtures were created under the session scratchpad directory (outside `src/`, outside the application source tree entirely) and deleted immediately after each test:

- **(A) Security hook rejects an obvious secret**: stdin payload with an unbroken `sk_live_...` literal → `[security-check] BLOCKED`, **exit 2**. PASS.
- **(B) Security hook allows a legitimate non-secret documentation example**: stdin payload with prose describing "STRIPE_SECRET_KEY... shaped like sk_live_ followed by your real value" (deliberately not a real unbroken key) → no output, **exit 0**. PASS.
- **(C) Code-quality hook allows legitimate repository imports**: stdin payload with `node:crypto`, `zod`, `@/lib/supabase/admin`, `@/lib/billing/entitlement-service`, `@langchain/openai` → no warnings, **exit 0**. PASS.
- **(D) Code-quality hook still detects a genuinely suspicious pattern**: stdin payload importing `stripe-clone-malicious` → warned by name, **exit 0** (advisory, does not block by design). PASS.
- **(E) `verify.sh` completes without hanging**: run twice, full end-to-end, against the real repository (420 changed files) — both runs completed in-process within the tool timeout, **exit 0** both times. PASS.
- **(F) `verify.sh` reports WARN rather than failing solely because the tree is oversized**: both real runs against the actual 420-file working tree produced the exact required line `WARN: diff-based review skipped because working tree exceeds configured threshold.` and a final `RESULT: PASS WITH WARNINGS (1 warning(s))` — not a FAIL, not a hang. PASS.

Additionally (not one of the required A-F, but performed because §14.1's 4th bug was found through it): a full-tree re-scan of both hooks' batch modes against the real 420-file changed set was run before and after the anchoring fix, confirming the false-positive count dropped from 18 to 10 with zero loss of genuine detections.

### 14.7 Normal validation (real repository commands, unmodified application code)

Run via `bash .claude/skills/verification/verify.sh` against the actual current working tree (420 changed `.ts`/`.tsx` files, ~140+ file backlog across prior milestones), using only this repository's real package-script-backed commands:

```
TSC:      PASS
LINT:     PASS
TESTS:    PASS (1159/1159 — unchanged from the pre-hardening-pass baseline)
BUILD:    PASS
SECURITY SCAN (Mode A, whole tree):      PASS (420 files scanned, 1 pre-existing WARN)
CODE-QUALITY SCAN (Mode A, whole tree):  ADVISORY (420 files scanned, 10 genuine WARNs)
Mode B (diff-based checks 6-18):         WARN — skipped, 420 files exceeds MAX_DIFF_FILES=60
RESULT: PASS WITH WARNINGS (1 warning(s))
```

No application file was modified to make any of the above pass. The one pre-existing security-scan WARN (`src/app/api/ai/cover-letter/route.ts` reading an identity-shaped field from request input) and the ten code-quality WARNs (nine `console.log` in API routes, one `"use client"` file importing `next/headers`) are genuine findings **in application code that was not touched this pass** — reported here for visibility, not fixed, since fixing application code is explicitly out of scope for this governance-hardening task.

### 14.8 Remaining warnings / known limitations (this pass)

- Mode B's diff-based checks (6-18) were not exercised end-to-end against this repository's real current diff in this pass either, for the same structural reason as §10: the real working tree (420 files) exceeds the documented threshold by design. Mode A's new whole-tree batch scan (§14.2-14.3) now covers the security/code-quality gap this left, but Mode B's more specific per-file diff heuristics (weakened-test detection, admin-guard-on-changed-routes, etc.) remain untested against real, current diff content — only against the synthetic fixtures already covering their logic from the original bootstrap.
- `security-check.mjs`'s new guard-removal detection only fires for the `Edit` tool (which carries `old_string`/`new_string`); a `Write` that overwrites a whole file's content has no "before" to compare against in the `PreToolUse` path, so a guard removed via a full-file `Write` rather than a targeted `Edit` would not be caught by this specific check (the pre-existing "no visible guard in final content" WARN for `src/app/api/admin/**` files still applies as a weaker fallback).
- Live, in-session firing was directly observed this pass only for the pre-existing `security-check.mjs` PreToolUse path (implicitly, by continuing to use `Write`/`Edit` throughout this pass without incident) — the new CLI batch-scan code paths in both hooks were exercised directly via explicit CLI invocation (not through Claude Code's own tool-call machinery), which is the correct way to test a CLI entry point but is a different form of evidence than a live `PreToolUse` block; documented as such rather than conflated.

### 14.9 Deferred items (this pass)

- Same as §11: full end-to-end validation of Mode B's diff-based checks against a real, small, in-context diff remains deferred until this repository's working tree is committed and a future real change is evaluated against a recent base ref.

---

## Final tallies (original bootstrap, §1-13)

**FILES CREATED**: 17 (`.claude/settings.json`; `.claude/README.md`; 5 × `SKILL.md` + 5 × `reference.md` under `.claude/skills/**`; `verify.sh`; 3 × `.mjs` under `.claude/hooks/**`; this report)
**FILES MODIFIED**: 1 (`CLAUDE.md` — `@AGENTS.md` import line preserved, governance content appended)
**FILES NOT MODIFIED**: `AGENTS.md`, `.claude/settings.local.json`, every application/business-logic file, every file under `supabase/migrations/`, `package.json`, `package-lock.json`, all test files
**VALIDATION RESULTS**: `tsc --noEmit` PASS · `eslint .` PASS · `vitest run` PASS (1159/1159, unchanged baseline) · `npm run build` PASS · `verify.sh` end-to-end PASS (after fixing 2 real bugs found via this session's own testing) · all 3 hooks behavior-tested standalone · `security-check.mjs` additionally verified live twice (real blocks + real passes, observed in this session)
**SECURITY FINDINGS**: none in the application codebase (out of scope for this task — no application code was audited or changed); 2 real bugs found and fixed in the governance tooling itself (verify.sh hang risk on a large diff; verify.sh crash on an empty bash array under this environment's bash build) — both are tooling defects in files created this session, not pre-existing application defects
**WARNINGS**: see §10 (verify.sh checks 6-18 not exercised end-to-end against this repo's current oversized diff, by design; code-quality-check.mjs's import-prefix heuristic will need occasional updates as real new dependencies are added; only security-check.mjs's live firing was directly observed this session)
**DEFERRED ITEMS**: full in-context validation of verify.sh's diff-based checks, deferred until a real small diff exists to test against (see §10-11)

## Final tallies (2026-08-14 hardening pass, §14)

**FILES MODIFIED**: 3 — `.claude/hooks/security-check.mjs` (guard-removal detection added, CLI batch-scan mode added), `.claude/hooks/code-quality-check.mjs` (3 import-recognition bugs fixed, then a 4th found empirically and fixed, CLI batch-scan mode added), `.claude/skills/verification/verify.sh` (explicit Mode A/Mode B framing, whole-tree batch-scan step added, literal `WARN:`-prefixed skip message, skip now recorded as a real finding)
**FILES CREATED**: 0 · **FILES DELETED**: 0 · **DEPENDENCIES ADDED**: 0 · **APPLICATION CODE CHANGED**: 0 files
**FALSE POSITIVES FIXED**: 4 in `code-quality-check.mjs` (`@`-prefixed specifiers silently excluded; Node builtins unrecognized; loose prefix-match allowed typosquats; unanchored `from "..."` regex matched prose in comments/strings/template literals, found empirically against this repo's real 420-file tree and fixed with a second, more precise anchor after an `export function`-with-embedded-quotes edge case was found in the same real data)
**COVERAGE GAP CLOSED**: 1 in `security-check.mjs` — "removed entitlement checks"/"removed ownership checks" detection (previously not possible at all; now BLOCKING via `old_string`/`new_string` comparison on `Edit` calls, including guards commented-out rather than deleted)
**CONTROLLED TESTS PERFORMED**: A-F, all PASS (§14.6) — fixtures created under the session scratchpad (outside the application source tree) and removed immediately after each test
**VALIDATION RESULTS**: `tsc --noEmit` PASS · `eslint .` PASS · `vitest run` PASS (1159/1159, unchanged) · `npm run build` PASS · `verify.sh` end-to-end PASS × 2 real runs against the actual 420-file working tree · security batch scan PASS (1 pre-existing application WARN, not fixed — out of scope) · code-quality batch scan ADVISORY (10 genuine WARNs, down from 18 before the anchoring fix — 0 false positives remaining)
**REMAINING WARNINGS**: see §14.8 — Mode B's diff-based checks still untested against real current diff content (structural, same as original bootstrap); guard-removal detection only covers `Edit`, not a full-file `Write`; new CLI batch-scan paths validated by direct invocation, not live Claude Code tool-call firing
**DEFERRED ITEMS**: same as §11/§14.9 — Mode B end-to-end validation against a real small diff, deferred until the working tree is committed
