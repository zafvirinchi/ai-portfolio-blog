---
name: verification
description: Run this repository's real validation (TypeScript, ESLint, Vitest, production build) plus a governance sweep for weakened tests, security/entitlement regressions, and Next.js convention violations. Use before declaring any change complete, and always before reporting a milestone/task done.
---

# Verification Skill

Produces a single PASS/FAIL/WARN report for the current working-tree changes against this repository's actual tooling. Never modifies source to force a pass — a failing check is reported, not silenced.

## When to use

- Before telling the user a change, fix, or milestone is complete.
- After any edit touching `src/app/api/**`, `src/lib/billing/**`, `src/lib/ai/**`, `src/lib/auth/**`, `src/lib/saas/**`, or any Supabase/Stripe access.
- After any test file change, to confirm nothing was weakened or removed.

## How to run it

```bash
bash .claude/skills/verification/verify.sh
```

Requires no arguments. Reads the current git working tree (staged + unstaged) to scope the "changed files" checks; the build/lint/test/tsc checks always run against the full project, matching how this repo is actually validated (there is no per-file lint/build mode).

The script exits non-zero if any check marked **FAIL** occurred (build/lint/tsc/test failures, or a high-confidence weakened/removed-test finding). WARN-level findings do not fail the exit code — they are judgment calls for the reviewer, not blocking.

## What it checks, and why (see `reference.md` for full detail on each)

1. **TypeScript** — `npx tsc --noEmit`. This repo has no `typecheck` package script; this is the real command.
2. **ESLint** — `npx eslint .` (`npm run lint` under the hood). No Prettier/formatter exists in this repo — do not add formatting checks.
3. **Tests** — `npx vitest run` (`npm test`). Reports the before/after test count so a silent reduction is visible even if the suite still exits 0.
4. **Production build** — `npm run build`. Catches type errors that only surface at build time (route manifest generation, etc.) that `tsc --noEmit` alone can miss.
5. **Changed files** — `git diff --name-only` against the merge-base, to scope the remaining checks.
6. **Changed tests** — diffs test files specifically; flags any test file with a net negative assertion/`it(`/`expect(` count as a WARN needing human judgment (a refactor can legitimately reduce line count without reducing coverage — this is a signal, not a verdict).
7. **Removed/weakened tests** — greps the diff for deleted `it(`/`test(`/`expect(` blocks and for `.skip`/`.todo`/commented-out assertions introduced by the change. **FAIL** if found without a corresponding replacement in the same diff.
8. **API security** — for every changed `route.ts`, confirms a server-side identity call (`requireUserId`, `getOptionalUserId`, `requireRecruiterId`, `requirePlatformAdmin`, `getTenantContext`, or equivalent) is present when the route touches anything ownership-sensitive, and that no `req.json()`/`searchParams` destructuring assigns directly into a variable named like an identity field (`userId`, `recruiterId`, `organizationId`, `role`, `plan`) without that value being independently re-validated server-side.
9. **Authentication/authorization** — flags a changed route under `src/app/api/admin/**` that does not call `requireAdminRoute()`/`requirePlatformAdmin()`.
10. **IDOR/ownership** — flags a changed Supabase query against an ownership-scoped table (`recruiter_candidates`, `recruiter_jobs`, `resume_versions`, etc.) with no `.eq("recruiter_id"|"user_id", ...)`-shaped filter in the same function.
11. **Entitlement/quota enforcement** — for a changed route under `src/app/api/ai/**` that calls an LLM-invoking service function, confirms `requireFeature`/`requireQuota` (or an explicit anonymous-by-design comment) precedes the call.
12. **LLM call protection** — greps the diff for a new/changed call into `src/lib/ai/openai.ts`, LangChain, or any `generate*`/`*-generator.ts` function, and cross-checks that the same diff (or already-existing code) gates it. Flags if a new LLM call site has no visible entitlement check in its own function or its immediate caller.
13. **Stripe/billing changes** — flags any diff touching `src/lib/billing/platform-stripe-provider.ts`/`platform-billing-service.ts`/webhook routes, requiring explicit human review (never auto-approved) since signature verification and event-ordering logic live here.
14. **Supabase access patterns** — flags a new Supabase client constructed outside `supabaseAdmin`/`supabase-server.ts`/`supabase-browser.ts`, and flags a query against a table not present in `supabase/migrations/**` (possible schema-assumption drift).
15. **React/Next.js conventions** — flags a new `"use server"` file (none exist in this repo — if one appears, it's a deliberate architectural change that needs explicit sign-off, not an accident), a new `middleware.ts` (should be `proxy.ts` in this Next 16 repo), and `params` used without `await` in a route handler.
16. **Performance regressions** — flags an entitlement/session-resolution call inside a loop, and a new Supabase query added inside a per-item loop where a batched query would do (N+1 shape).
17. **Error handling** — flags a changed route whose `catch` block doesn't map at least one specific error type (i.e., only a generic 500/`error.message` passthrough), and any `console.log`/response body that could contain a raw Supabase/Stripe error object or a value from `process.env`.
18. **Accessibility** — for changed `.tsx` files, flags a new interactive element (`<button>`/`<a>`/custom clickable `<div>`) with no `aria-label`/visible text, and a new color-only status indicator (a class name matching a color with no adjacent text).

## Output format

```
VERIFICATION REPORT
====================
TSC:      PASS | FAIL
LINT:     PASS | FAIL
TESTS:    PASS (N/N) | FAIL (N/M) — baseline was N
BUILD:    PASS | FAIL

CHANGED FILES: <count>
CHANGED TESTS: <count>

[FAIL] <finding> — <file:line>
[WARN] <finding> — <file:line>
...

RESULT: PASS | FAIL | PASS WITH WARNINGS
```

## Explicit rule

Never edit source code, tests, or configuration to force a check to pass. If a check fails, report it and stop — fixing the underlying issue is a separate, deliberate step the user/agent takes after seeing the report, not something this skill does automatically.
