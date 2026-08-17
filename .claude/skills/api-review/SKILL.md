---
name: api-review
description: Focused review of one or more changed API routes (src/app/api/**/route.ts) for authentication, authorization, ownership, server-derived identity, validation, error semantics, entitlement/quota enforcement, and safe logging. Use for any new or changed Route Handler.
---

# API Review Skill

Narrower and more mechanical than `pr-review` — walk this exact checklist for every changed `route.ts`, one route at a time. Cite `file:line`.

## Per-route checklist

For each changed/added `src/app/api/**/route.ts`:

1. **Authentication requirement** — does this route need a session at all? Compare against sibling routes for the same feature (most `src/app/api/ai/**` job-seeker-side ephemeral tools are intentionally anonymous-capable via `getOptionalUserId()`; `src/app/api/ai/recruiter/**` and everything under `src/app/api/admin/**` always require one). State explicitly which category this route falls into and whether the code matches.

2. **Authorization requirement** — beyond "is there a session," does this route need a specific role (`RECRUITER`, `ADMIN`)? Confirm the actual role check (`requireRecruiterId()`, `requirePlatformAdmin()`/`requireAdminRoute()`), not just presence of *a* session.

3. **Ownership requirement** — if the route reads/writes a specific resource (`candidateId`, `jobId`, a resume version, an override), confirm the service-layer call scopes the query by the resolved owner (`recruiterId`/`userId`), not merely by the resource id alone.

4. **Server-derived identity** — walk every value the handler uses to make an authorization or ownership decision back to its source. It must originate from `requireUserId()`/`getOptionalUserId()`/`requireRecruiterId()`/`requirePlatformAdmin()`/`getTenantContext()` (or a URL path parameter used only as a *target*, with the *acting* identity independently resolved) — never from `await req.json()`, `searchParams`, or a header the client controls.

5. **Request validation** — is the body/query validated (type checks, `zod` schema, or explicit `typeof x !== "string"` guards matching this repo's established inline-validation style) before being passed to a service function? A malformed request should 400, not reach the service layer and throw an unhandled error.

6. **Error semantics** — does the status code match this repo's established convention: 401 no session, 403 real session wrong role, 404 for a non-owned/nonexistent resource (never a distinct 403 that would confirm existence, where 404-for-both is the established pattern for that feature), 400 validation, 402 entitlement rejection (via `entitlementErrorResponse()`), 422/500 generic fallback? Compare against the nearest sibling route.

7. **Entitlement/quota checks** — if this route reaches an LLM call or another metered operation, is `requireFeature`/`requireQuota` present and does it run *before* the operation? Is `recordUsage` called exactly once, only after success?

8. **Expensive operations only after authorization** — trace the actual order of operations in the function body top to bottom; a `requireFeature()` call that exists but runs *after* the LLM call, or in a branch that doesn't actually gate the call path taken, does not count as protection.

9. **No client-controlled identity trusted** — re-confirm #4 specifically for anything that looks like it *could* be identity (`recruiterId` in a body even if unused, a `plan` field, a `role` field) — even an unused field is worth noting if its presence suggests a future maintainer might wire it in without re-deriving this check.

10. **No information leakage via 403/404** — where this repo's established pattern for a feature is "404 for both nonexistent and not-owned" (recruiter candidates, resume versions), confirm a not-owned resource doesn't instead produce a distinct 403 or a 200 with filtered/empty data that reveals existence.

11. **Logging safety** — no `console.log`/`console.error` argument containing a raw Supabase error object, a raw Stripe object, or `process.env` directly. The established pattern is `console.error("[feature] X failed", error)` with a generic message returned to the client.

12. **Idempotency** — for a route that creates a resource (checkout session, candidate import, admin override grant), is a duplicate call safe (upsert-by-natural-key, or an explicit duplicate-guard like `DuplicateSubscriptionError`)? Note if a POST that should be idempotent isn't, but don't treat every POST as requiring idempotency — only ones where a duplicate call is a realistic user action (double-click, retry).

13. **Concurrency** — for a route that checks-then-writes (quota check → record usage; read subscription → upsert), is the existing race window (if any) the same already-documented, already-accepted "best-effort enforcement" class, or does this change introduce a *new* concurrency risk (e.g., a check-then-write sequence where an existing atomic pattern was available and not used)?

## Output format

One block per route:

```
### <file path>

Auth:          <finding>
Authorization: <finding>
Ownership:     <finding>
Identity:      <finding>
Validation:    <finding>
Error codes:   <finding>
Entitlement:   <finding>
Logging:       <finding>
Idempotency:   <finding> (or "not applicable")
Concurrency:   <finding> (or "not applicable")

VERDICT: OK | NEEDS FIX (<summary>)
```
