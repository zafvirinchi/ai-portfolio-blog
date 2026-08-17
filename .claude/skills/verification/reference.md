# Verification Skill — Reference

Detailed patterns and rationale behind each check in `verify.sh`. This file is for a human or agent who wants to understand *why* a given line was flagged, or who needs to extend the script later.

## 1-4. Core commands

These are the repository's actual, literal `package.json` scripts (plus `tsc`, which has no package script wrapper):

| Check | Real command | Notes |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | If this reports errors immediately after an interrupted `next dev` session, `rm -rf .next` first — a stale `.next/dev/types` artifact is a known, recurring false-positive source in this repo, documented across multiple `PHASE18_MILESTONE*.md` reports. |
| Lint | `npx eslint .` | Equivalent to `npm run lint`. Flat config (`eslint.config.mjs`), extends `eslint-config-next`. No Prettier — do not add a formatting check here. |
| Tests | `npx vitest run` | Equivalent to `npm test`. Config `vitest.config.mts` has an explicit `include` allowlist — a new test file that isn't added to that list silently never runs. The script greps for new `*.test.ts` files not present in the allowlist and reports it as a WARN. |
| Build | `npm run build` | `next build`. Slower than the others; run last. |

## 5-7. Changed-file / changed-test / weakened-test detection

Scope is `git diff --name-only $(git merge-base HEAD origin/main 2>/dev/null || echo HEAD~1) -- '*.ts' '*.tsx'` with a fallback to comparing against the working tree's last commit if no upstream is configured (this repo's own convention has no enforced branch-protection setup to rely on).

"Weakened test" heuristics (all WARN unless stated FAIL):
- **FAIL**: a diff hunk removes a line matching `it(`/`test(` without an equal-or-greater number of `it(`/`test(` additions in the same file's diff.
- **FAIL**: a diff hunk adds `.skip(` or `.todo(` to an existing `it`/`describe`.
- **FAIL**: a diff hunk comments out a line containing `expect(`.
- **WARN**: net `expect(` count in a changed test file decreased.
- **WARN**: a changed test file's mock for `requireFeature`/`requireQuota`/`requireUserId`/`requireRecruiterId`/`requirePlatformAdmin` was changed to always resolve/never reject (a mock that can no longer represent the rejection path is a coverage regression even though the file still "has tests").

## 8-9. API security / admin authorization

Every file matching `src/app/api/**/route.ts` in the diff is scanned for:
- At least one call among: `requireUserId`, `getOptionalUserId`, `requireRecruiterId`, `requirePlatformAdmin`, `requireAdminRoute`, `getTenantContext`, `createSupabaseServerClient(...).auth.getUser`.
- If the file path is under `src/app/api/admin/**` and does **not** contain `requireAdminRoute` or `requirePlatformAdmin` → **FAIL** (every admin route in this repo has one of these, with zero exceptions verified across Phase 18-20's own audits).
- A destructured request-body/query field literally named `userId`, `recruiterId`, `organizationId`, `role`, `plan`, `entitlement`, or `quota` that is then used directly (not merely echoed back or passed to a function that itself re-validates it) → **FAIL**. A field used only as a *target* id (e.g. `params.userId` for "which user is an admin modifying," with the acting identity separately resolved) is not flagged — the check looks for the value flowing into an authorization decision, not mere presence.

## 10. IDOR/ownership

Table names considered ownership-scoped (extend this list if a new one is added to `supabase/migrations/`): `recruiter_candidates`, `recruiter_jobs`, `resume_versions`, `platform_billing_customers`, `platform_subscriptions`, `platform_entitlement_overrides`. A `.from("<table>")` call in a changed service file with no `.eq(` filter on the corresponding owner column anywhere in the same function body → **FAIL**. Read-only admin service functions that intentionally query unscoped (e.g. `getForSystemUse()`-style internal-only accessors, already documented in `candidate-service.ts`) are allow-listed by function-name pattern (`*ForSystemUse`, `*System*`) — verify manually if a new one appears, since this pattern is deliberately narrow.

## 11-12. Entitlement/quota + LLM call protection

LLM-invoking call patterns searched for: `openai.chat.completions.create`, `openai.responses.create`, `openai.embeddings.create`, `new ChatOpenAI`, and any call to a function whose name matches `generate[A-Z]\w*` inside `src/lib/ai/**`.

For each such call site newly introduced or modified in the diff, the script walks up to the nearest enclosing exported function and its callers (one level, via `grep -rn` for the function name across `src/app/api/**` and `src/lib/ai/tools/**`) looking for `requireFeature(` or `requireQuota(` in the same file above the call, or an explicit comment containing "anonymous" or "intentionally" within 10 lines above the function. Neither found → **WARN** (not FAIL — this heuristic has false positives for genuinely deterministic helper functions with "generate" in the name that don't call an LLM; a human/agent must confirm before treating it as a real defect, per this skill's own "trace the actual call graph" principle — grep alone cannot prove a negative).

## 13. Stripe/billing changes

Any diff touching `src/lib/billing/platform-stripe-provider.ts`, `platform-billing-service.ts`, `platform-subscription-service.ts`, `src/app/api/billing/platform/webhook/route.ts`, or the organization-scoped equivalents → always reported, always **WARN** (never auto-passed), with a reminder to specifically re-verify: raw body read before signature verification, `constructEventAsync` (not a manual HMAC check), and the event-timestamp ordering guard in `upsertSubscription`.

## 14. Supabase access patterns

- A new `createClient(` call outside `src/lib/supabase/admin.ts`, `src/lib/supabase-server.ts`, `src/lib/supabase-browser.ts` → **WARN**.
- A `.from("<name>")` call where `<name>` does not appear as a `create table` target in any file under `supabase/migrations/` → **WARN** (could be a legitimate pre-existing baseline table like `interview_questions`/`admin_users`/`blogs`, which predate the tracked migration history — not necessarily wrong, but worth a human check).

## 15. React/Next.js conventions

- Any file named `middleware.ts` anywhere → **FAIL** (this Next 16 repo uses `proxy.ts`; a `middleware.ts` appearing is either a mistake or an unreviewed architectural change).
- Any new file containing a top-level `"use server"` directive → **WARN** (none exist today; not forbidden, but a real convention shift worth a deliberate decision, not an incidental one).
- `{ params }: { params: Promise<...> }` destructured and used without `await params` in the same function → **FAIL** (a real runtime bug in this Next.js version).

## 16. Performance regressions

- A `requireUserId`/`requireFeature`/`requireQuota`/`getOptionalUserId` call found textually inside a `for`/`while`/`.map(`/`.forEach(` block → **WARN**.
- A `.from(` Supabase call found inside a loop where the loop variable feeds the `.eq(` filter (classic N+1) → **WARN**.

## 17. Error handling

- A route's `catch (error)` block whose body contains only a single generic `NextResponse.json({ error: ... }, { status: 500 })` (or 422) with no `instanceof` check above it → **WARN** (many legitimate simple routes are fine with this; flagged for human judgment, not auto-failed).
- Any response body or `console.log`/`console.error` argument that includes `process.env` directly, or a raw `error` object (not `error.message`) → **FAIL** (risk of leaking a secret or internal detail).

## 18. Accessibility

Only runs against changed `.tsx` files. A new `<button>`/`<a>`/`role="button"` element with neither visible text content nor an `aria-label` attribute → **WARN**. A new `className` string that includes a color utility (`text-red-`, `bg-green-`, etc.) used as the *only* differentiator between two states with no adjacent text node in the same JSX block → **WARN**.

## Known limitations

This script is pattern-based (grep/regex over diffs), not a real static analyzer. It will have false positives and cannot prove a negative (e.g., "this LLM call is definitely unprotected" requires a human/agent to actually trace the call graph, which is what the `pr-review`/`api-review`/`ai-review` skills are for). Treat every WARN as "look at this," not "this is definitely wrong." FAIL-level findings are narrower and higher-confidence by design (missing admin guard, `middleware.ts` instead of `proxy.ts`, secret-in-log, removed test) — but still verify before acting, especially before reverting someone else's legitimate change.
