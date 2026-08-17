---
name: pr-review
description: Full-scope code review for a change to this repository — correctness, architecture, security, authentication/authorization, IDOR, LLM cost exposure, entitlement/quota bypasses, Stripe security, Supabase access, performance, React/Next.js correctness, error handling, tests, regression risk, and accessibility. Use for any non-trivial change before it is considered done, especially anything touching API routes, billing, or AI features.
---

# PR Review Skill

This is the general-purpose reviewer for this repository. For a change that's *primarily* about one specific area, prefer the narrower skill instead (`api-review` for a single route's contract, `architecture-review` for a structural/module-boundary question, `ai-review` for LLM-call-graph tracing) — use `pr-review` when a change spans multiple concerns, or as the final pass before calling something done.

## Review checklist

Go through every item below against the actual diff. Cite `file:line` for every finding. Do not report a finding you have not verified by reading the actual code — do not review the CLAUDE.md description of a convention as if it were the diff itself.

### Correctness
- Does the change do what it claims? Read the calling code, not just the changed function in isolation.
- Are edge cases handled the way sibling code in the same feature area already handles them (empty input, missing session, expired ephemeral session, Supabase query error)?

### Architecture
- Run the 9 questions from `architecture-review`'s skill if the change adds a new file, service, or table reference. A `pr-review` doesn't need the full architecture-review depth, but these 9 questions are cheap and catch most duplication before it ships.
- Does the change put logic in the right layer (route thin, service does the work, no business logic inlined in a component)?

### Security / Authentication / Authorization / IDOR
- Is every identity value (`userId`, `recruiterId`, `organizationId`, admin role) resolved server-side, never trusted from the request? See CLAUDE.md's Security Requirements #1-4.
- Does a new/changed Supabase query against an ownership-scoped table filter by the resolved owner?
- Does a non-owned resource correctly 404 (not 403, not 200-with-someone-else's-data) where that's the established pattern for this feature area?

### LLM cost exposure / entitlement / quota bypass
- **The single most important check for this repository, and the one most likely to be missed**: if this diff adds or changes a route/service/chat-tool-handler that reaches a real LLM call, trace *every* caller of that function — not just the route you're looking at. Search for: a dedicated REST route, a chat-tool intent handler in `src/lib/ai/tools/resume.tool.ts`, a legacy/alternate route for the same feature, and a bulk-operation variant. If any caller reaches the LLM function without the same `requireFeature`/`requireQuota` gate the "obvious" route has, that is a genuine defect — this exact pattern has been found and fixed multiple times in this repo's own history (see `PHASE19_MILESTONE5*.md`, `PHASE19_MILESTONE6*.md`).
- Is usage recorded exactly once per user-visible operation, after success, never before, never per internal LLM sub-call?
- Does a new feature reuse an existing `FeatureId`/`UsageMetric` where one is semantically correct, rather than inventing a new one for something already covered?

### Stripe security
- Any diff touching webhook handling, checkout, or portal code: re-verify signature verification happens before the body is parsed, and that no client-supplied value (price id, plan, customer id) is trusted without a server-side lookup.

### Supabase access
- New client construction? Should reuse `supabaseAdmin`/`supabase-server.ts`/`supabase-browser.ts`, not a fresh `createClient()`.
- New table reference? Confirm it exists in `supabase/migrations/**` (or is a documented pre-existing baseline table) — flag if not, since this repo's migrations are manually applied and schema drift is a real, live risk right now (see `PHASE20_MILESTONE*.md`).

### Performance
- N+1 query shape (a Supabase call or identity/entitlement resolution inside a loop)?
- A new persistent or cross-request cache introduced where the existing request-scoped `withEntitlementCache()` pattern would do, or where no caching is actually justified by evidence?

### React rendering / Next.js server-client boundaries
- `"use client"` only where actually needed.
- No new Server Action (`"use server"`) unless that's a deliberate, explicitly-called-out architectural decision (none exist in this repo today).
- `params`/`searchParams` awaited correctly (both are Promises in this Next.js version).
- No `middleware.ts` — this repo uses `proxy.ts` (Next.js 16's renamed convention).

### API design
- Response shape consistent with sibling routes for the same feature area.
- Structured entitlement errors use exactly the 3 real codes (`AUTH_REQUIRED`/`FEATURE_NOT_INCLUDED`/`QUOTA_EXCEEDED`) — never a 4th invented code like `BILLING_UNAVAILABLE`, which this system does not actually emit.

### Error handling
- No raw error object, Supabase error detail, or `process.env` value in a response body or log line.
- A `catch` block maps known error classes to specific statuses rather than collapsing everything to one generic status.

### Tests
- Does every genuine fix have a regression test? Does a new gated route have a test proving rejection happens *before* the LLM/expensive call runs (not just that it returns the right status code)?
- Was any existing test weakened, skipped, or deleted without a replacement? This is a hard stop — flag it regardless of how small.

### Regression risk
- Does this change touch a file that's part of one of the "two parallel systems" (org billing vs. platform billing, `recruiter/**` vs `recruitment/**`)? If so, confirm it only touches the intended one.

### Accessibility
- New interactive elements have visible text or `aria-label`.
- New status/severity indicators are not color-only.

### Maintainability
- Does the change reuse an existing helper/pattern from the nearest sibling file, or invent a new shape for something already solved elsewhere in this codebase?

## Special rule — alternate-route bypass tracing

Given: *"Route A checks entitlement before an LLM call."*

Do not conclude the operation is protected. Instead:
1. Find the service function Route A calls.
2. `grep -rn` that function's name across the whole repo.
3. For every other caller found (another route, a chat tool, a legacy/recruitment-side twin route, a bulk variant), confirm it has the *same* entitlement gate — not merely that a session exists, but that `requireFeature`/`requireQuota` for the *same* feature/metric runs before the call.
4. If any caller lacks it, that is a genuine, reportable defect, not a stylistic note.

## Output format

Report findings grouped by severity: **BLOCKING** (security/entitlement/test-integrity issues — must fix before merge), **SHOULD FIX** (real but not urgent), **CONSIDER** (optional improvement, never required). Cite `file:line` for everything. If nothing is found in a category, say so briefly rather than omitting the category — an omitted category reads as "not checked," not "checked and clean."
