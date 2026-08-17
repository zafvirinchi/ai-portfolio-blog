# API Review Skill — Reference

## The actual server-derived identity functions in this repo

Use this table to check claim #4/#9 in the SKILL checklist quickly — if a route uses none of these, it has no real identity resolution:

| Function | File | Returns | Throws on no session? |
|---|---|---|---|
| `getOptionalUserId()` | `src/lib/billing/persona-service.ts` | `string \| null` | No — the established anonymous-preserving pattern |
| `requireUserId()` | `src/lib/billing/persona-service.ts` | `{ userId, email }` | Yes — `PlatformUnauthorizedError` |
| `requireUserId()` | `src/lib/ai/resume-versions/resume-version-auth.ts` | `string` | Yes — a *different*, resume-versions-specific `UnauthorizedError` (do not conflate with the billing one above — same name, different module, different error class/message) |
| `requireRecruiterId()` | `src/lib/ai/recruiter/recruiter-auth.ts` | `string` | Yes — `UnauthorizedError` (recruiter-specific) |
| `requirePlatformAdmin()` | `src/lib/billing/persona-service.ts` | `{ userId, email }`, re-derives ADMIN role from the DB | Yes — `PlatformUnauthorizedError` (no session) or `AdminAccessRequiredError` (session but not admin) |
| `requireAdminRoute()` | `src/lib/billing/admin-api-guard.ts` | `{ ok, userId, email } \| { ok: false, response }` | No — returns a discriminated result instead of throwing, for routes that want to return the pre-built `NextResponse` directly |
| `getTenantContext()` | `src/lib/saas/tenant-context.ts` | Organization-scoped context or `null` | No |

## Established error-code convention by category

| Situation | Status | Notes |
|---|---|---|
| No session at all | 401 | `PlatformUnauthorizedError`/`UnauthorizedError` |
| Real session, wrong role (e.g. non-admin hitting an admin route) | 403 | `AdminAccessRequiredError` |
| Resource doesn't exist OR exists but isn't owned by the caller | 404 | Deliberately the same code for both — never a distinct 403 that would confirm existence to an unauthorized caller |
| Request body/query fails validation | 400 | |
| `FeatureNotEntitledError` / `QuotaExceededError` | 402 | Via `entitlementErrorResponse()` — produces `{ error, code: "FEATURE_NOT_INCLUDED" \| "QUOTA_EXCEEDED", ... }` |
| Unexpected/generic failure | 422 or 500 | 422 is more common in this repo for "the operation itself failed" (e.g. LLM generation error); 500 for truly unexpected server errors |

## Request validation style actually used in this repo

No global request-validation middleware exists. Two styles coexist, both acceptable — match whichever the file you're reviewing already uses:
- Inline manual checks: `if (typeof resumeId !== "string" || !resumeId) return NextResponse.json({ error: "resumeId is required" }, { status: 400 });` — the more common style across `src/app/api/ai/**`.
- `zod` schema `.parse()` (used in some resume-versions routes, e.g. `updateVersionSchema.parse(await req.json())`) — throws on invalid input, caught by the route's own `catch` block.

Do not introduce a third validation style (e.g., a new schema library) for a route in a file/area that already has an established convention.

## Idempotency patterns already established (reuse, don't reinvent)

- Stripe subscription writes: `upsertSubscription()` upserts by `stripe_subscription_id` — replaying the same webhook event is a safe no-op re-write.
- Admin bootstrap: `bootstrapPlatformAdmin()` returns `{ alreadyAdmin: true }` on a repeat call for an already-admin caller rather than erroring or double-granting.
- Candidate import: batched, checked-then-recorded once per batch, not per item (see `bulk-status/route.ts`'s own regression test asserting the gate is checked exactly once per batch).

## Concurrency: the one already-accepted race in this codebase

`checkQuota()` → decision → `recordUsageEvent()` is read-then-check-then-write, not atomic. This is a known, documented, deliberately-accepted trade-off (every quota in this system is a generous abuse backstop, not a precise billing meter) — do not flag it as a new finding unless the route you're reviewing introduces a *materially worse* version of it (e.g., a much larger window, or a case where winning the race grants something more valuable than "one extra unit of an already-generous quota").
