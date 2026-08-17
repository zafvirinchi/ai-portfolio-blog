# Phase 19 — Milestone 2: AI Assistant Usage Governance & Monetization Safety

## 1. AI Assistant architecture audit

Traced the complete request lifecycle end-to-end, reading the actual source (nothing assumed):

```
POST /api/ai/chat
  → resolves tenant/auth context (org-scoped, unrelated to this milestone)
  → checkCredits("ai_chat")            [Phase 14 org-credit system, unchanged]
  → [NEW] if signed in: requireFeature("resume.ai_assistant") + requireQuota("AI_CHAT_MESSAGES")
  → withUsageContext("AI_CHAT", "LLM_CALL", …)
      → conversationService.ask(message, history)
        → agent.run() → runGraph()
            StateGraph: START → planner → [tool?] → promptBuilder → generation → END
              planner:     plannerService.plan()            — 1 LLM call
              tool:        conditional, some tools call an LLM — 0–1 LLM call
              generation:  multiAgentCoordinator.run()       — 0–2 LLM calls (Research + Reviewer, run in PARALLEL via Promise.all, decided by decidePlan())
                           → summarizerAgent (if either ran) — 0–1 LLM call
                           → portfolioChain.invoke()          — 1 LLM call (final answer)
  → consumeCredits("ai_chat")
  → [NEW] if signed in: recordUsage("AI_CHAT_MESSAGES")      — exactly once
  → NextResponse.json(response)
```

Findings against the audit checklist:

1. **Request lifecycle**: single POST, non-streaming, one JSON response per request (confirmed — no `ReadableStream`, no SSE headers anywhere in the route or `ChatBox.tsx`).
2. **LLM calls per request**: 2–6, bounded and deterministic. Never unbounded, never recursive — the LangGraph topology (`graph.ts`) is a strict acyclic DAG (`START → planner → [tool] → promptBuilder → generation → END`), with no edge back to any earlier node.
3. **Multiple agents per request**: yes, confirmed — `MultiAgentCoordinator.run()` can invoke Research and Reviewer agents in parallel, then a Summarizer, entirely within one `generation` node of one graph run, itself within one `withUsageContext` scope.
4. **Retries multiplying cost**: no application-level retry loop found anywhere in the graph/coordinator/agent files (each specialist agent call either succeeds or degrades to `null` on failure — `safeRunResearch`/`safeRunReview`/`safeRunSummary`, never retried). The OpenAI SDK's own default transient-error retry (unconfigured `maxRetries` in `openai.ts` — no override found) is a pre-existing, bounded, per-HTTP-call characteristic of the SDK itself, not something this feature introduces or could exploit into unbounded cost.
5. **Streaming and quota accounting**: not applicable — confirmed non-streaming end-to-end.
6. **Anonymous traffic protection**: none at all before this milestone, and none added by it (§7) — this was the one deliberate, documented decision point.
7. **Signed-in Free users**: `resume.ai_assistant` was `NONE` on `JOB_SEEKER_FREE` (Phase 18 M5) — a hard zero-access boundary, unchanged.
8. **Pro/Premium quotas**: were `UNLIMITED` with **no usage metric at all** — this was the actual gap this milestone closes.

## 2. Existing entitlement audit

`resume.ai_assistant` existed in `FEATURE_IDS`/`FEATURE_REGISTRY` (Phase 18 M1) but, before this milestone, had no `metric` field in any plan — a pure boolean (`NONE`/`UNLIMITED`) feature, unlike its sibling metered features (`resume.rewrite`, `interview.mock`, etc.). No quota metadata existed to "wire up" — genuinely absent, not dormant. Per Step 2's explicit instruction, the minimum required field was added to the **existing** registry (`platform-schema.ts`'s `USAGE_METRICS`, `platform-plan-registry.ts`'s per-plan entitlement definitions) — no second quota system, table, or service was created.

## 3. Quota audit

Confirmed via `platform-plan-registry.test.ts` (existing, unmodified structural-consistency tests) that no other feature or plan was affected. `AI_CHAT_MESSAGES` is a new entry in the existing `USAGE_METRICS` union — reuses `usage-event-service.ts`'s existing `platform_usage_events` table and `getUsageCount()`/`recordUsageEvent()` functions verbatim; no new table, no new service.

## 4. LLM call-flow analysis

See §1's diagram. The single most important fact for this milestone: **every LLM call in the entire graph happens strictly after both `requireFeature()` and `requireQuota()` resolve** — both checks sit before `withUsageContext(..., withAuthContext)`, the single entry point into the graph. A rejection at either check throws before that line is ever reached, so `conversationService.ask()` — the sole path to any LLM call — is never invoked. Proven by test, not just by code reading (§13).

## 5. Multi-agent call analysis

**Decision: one user-visible AI Assistant request = one usage unit**, per Step 5's own stated preference. Implemented by placing the single `recordUsage("AI_CHAT_MESSAGES")` call at the route level, *after* the entire graph (planner/tool/coordinator/specialists/generation) has already resolved successfully — the same position `consumeCredits("ai_chat")` already occupied for the pre-existing org-credit system, so this mirrors an established, already-correct pattern rather than inventing a new one. Internal agent/tool calls never call `recordUsage()` themselves — there was no risk of accidental double-charging to begin with, since none of the internal agent files (`research-agent.ts`, `reviewer-agent.ts`, `summarizer-agent.ts`, `planner.ts`, tool implementations) import or call anything from `entitlement-service.ts` at all. Verified by test: `recordUsageMock` is asserted to have been called exactly once per successful request, regardless of how many internal LLM calls that request fanned out into.

## 6. Commercial quota recommendation

Real per-message OpenAI token/dollar cost cannot be determined from this repository (no pricing/token-count telemetry is exposed to source) — per Step 3's explicit instruction, this uncertainty is stated plainly rather than guessed at, and a conservative policy was chosen instead:

| Plan | Before | After | Basis |
|---|---|---|---|
| JOB_SEEKER_FREE | NONE | **NONE (unchanged)** | Already a hard zero-cost boundary — no cost risk exists here to protect against. |
| JOB_SEEKER_PRO | UNLIMITED | **LIMITED 300/month (AI_CHAT_MESSAGES)** | ~10/day — generous enough that no legitimate usage pattern should ever reach it, while still being a REAL ceiling on the repo's highest-fan-out feature (up to 6 LLM calls per message). |
| JOB_SEEKER_PREMIUM | UNLIMITED | **LIMITED 2000/month** | ~66/day — deliberately far higher than Pro (this is the top tier), but still a genuine backstop, not infinite. |
| RECRUITER (all tiers) | not granted at all | **unchanged** | `resume.ai_assistant` was never listed in any `RECRUITER_*` plan's `features` object — a pure-Recruiter account already resolves `NONE` by the registry's own `?? NONE` fallback. Confirmed pre-existing, unrelated to this milestone, not modified (Step 3's own conditional: "only if the assistant is actually available to recruiters" — it isn't, today). |
| ADMIN | ADMIN_BYPASS | unchanged | Architecturally separate from plan-based quotas (`getEntitlement()`'s admin short-circuit, Phase 18 M1) — not a customer cost risk in the same sense; unaffected by this change. |

Never claims "unlimited" for a real customer plan without a governing ceiling behind it, per Step 3's explicit instruction — both paid tiers now have a real, if generous, number.

## 7. Anonymous-user decision

**Anonymous AI Assistant usage is retained, completely unchanged.** No IP/device rate-limiting or new anonymous-abuse mechanism was added. This was a deliberate decision, not an oversight: implementing one safely would require either a new Supabase table (an `ai_chat_requests`-style IP ledger, mirroring `job-match/rate-limiter.ts`'s existing precedent) or new infrastructure (e.g. Redis) — both are new infrastructure relative to this milestone's charter (extend the existing entitlement system, not build a parallel one), and Step 7 explicitly instructs against introducing either speculatively. **Documented here as a production prerequisite** (§19), not implemented. Live-verified this milestone (§18) that anonymous chat behavior is byte-for-byte unaffected: `requireFeature`/`requireQuota`/`recordUsage` are never called for `authUser === null`, confirmed both by a route-level test and a real, live, non-anonymous-blocking chat request against this environment's real OpenAI credentials.

## 8. Streaming/retry analysis

Not applicable — confirmed non-streaming (§1.5). Retry analysis: no application-level retry exists anywhere in the graph/coordinator/agent chain (§1.4); the OpenAI SDK's own default retry behavior is unconfigured, pre-existing, and bounded per individual HTTP call — not a mechanism a user could invoke repeatedly to bypass quota (each user-initiated retry is a genuinely new POST request, correctly re-checked against quota like any other).

## 9. Abuse/cost protection audit

Inspected per Step 10's checklist:
- **Retry loops**: none found (§1.4/§8).
- **Recursive agent calls**: structurally impossible — the LangGraph topology has no cycle (§1.2).
- **Tool-call loops**: the `tool` node runs at most once per graph invocation (a single conditional edge from `planner`, never revisited).
- **Unusually large prompts / pasted resumes/JDs**: out of this milestone's scope — `/api/ai/chat` accepts a `message` string with no length validation, but this is a pre-existing characteristic shared with every other text-input AI route in this codebase, not something introduced or made worse here; no concrete defect was found to justify a fix under Step 10's "fix only concrete defects" instruction.
- **Repeated rapid submissions / concurrent requests**: no distributed locking exists or was added — each request is independently checked against the same server-derived quota state at request time; a genuine race between two near-simultaneous requests from the same user could both pass a `checkQuota()` read before either write lands (the same class of non-atomic read-then-check-then-write already present, and already documented, in every other Phase 18 M5 quota integration — not new to this milestone, not a regression). Judged acceptable given the ceiling is a generous backstop, not a precise billing meter.

**No new rate-limiting infrastructure was implemented**, per Step 10's explicit instruction against turning this into a generic rate-limiting project.

## 10. Changes implemented

1. **`platform-schema.ts`** — added `"AI_CHAT_MESSAGES"` to `USAGE_METRICS`.
2. **`platform-plan-registry.ts`** — `resume.ai_assistant` changed from `UNLIMITED` to `{LIMITED, AI_CHAT_MESSAGES, 300/MONTH}` on `JOB_SEEKER_PRO` and `{LIMITED, AI_CHAT_MESSAGES, 2000/MONTH}` on `JOB_SEEKER_PREMIUM`. `JOB_SEEKER_FREE` (`NONE`) untouched.
3. **`/api/ai/chat/route.ts`** — added `requireFeature()` + `requireQuota()` before the graph invocation, and `recordUsage()` once after it succeeds, mirroring the exact `checkCredits`/`consumeCredits` call-site pattern already established for the org-credit system in the same route.
4. **`/settings/billing/page.tsx`** — added an `AI_CHAT_MESSAGES` label to the existing `USAGE_METRIC_LABEL` map; no other change needed (§12).

No entitlement engine, plan registry structure (beyond the one feature's two tier values), Stripe architecture, or billing database was touched. No second quota system, service, or table was created.

## 11. Structured error behavior

Reused `entitlement-response.ts`/`entitlement-client-error.ts`/`UpgradePrompt.tsx` verbatim — all built in Phase 18 M5/M7 and Phase 19 M1, none modified this milestone. `ChatBox.tsx` (Phase 19 M1) already passes `featureId="resume.ai_assistant"` into `UpgradePrompt`, so a `FEATURE_NOT_INCLUDED` rejection now also shows "Available on Job Seeker — Pro" automatically, with zero additional code — a direct, unplanned benefit of M1's own `findCheapestPlanGranting()` work. `QUOTA_EXCEEDED` (now genuinely reachable for this feature for the first time) renders the real `used`/`limit`/`period` from the server, never fabricated. No raw JSON is ever shown to the user.

## 12. Billing dashboard changes

`/settings/billing` required only the one-line label addition in §10.4 — the usage section, quota display, and category grouping (Phase 18 M5/M7, Phase 19 M1) already render any metric present in a signed-in user's own resolved plans generically, straight from `getBillingOverview()`. No new endpoint, no new contract field, no client-side computation.

## 13. Tests added

9 new tests, 2 files:
- **`src/app/api/ai/chat/route.test.ts`** (new, 6 tests) — the first test of this route. Proves: (a) an anonymous caller never triggers `requireFeature`/`requireQuota`/`recordUsage` and the LLM call still runs (Step 7); (b) a Free-tier rejection via `requireFeature()` results in **zero calls** to the mocked `conversationService.ask` (Step 4's core requirement, proven by mocking the actual LLM entry point, not asserted from code reading); (c) a Pro-tier quota rejection via `requireQuota()` equally results in zero LLM calls; (d) a successful request records usage **exactly once**, regardless of internal fan-out (Step 5); (e) a failed LLM call after passing entitlement checks does not record usage; (f) the three checks run in the correct order (`requireFeature` → `requireQuota` → `ask`).
- **`platform-plan-registry.test.ts`** (extended, 3 tests) — `resume.ai_assistant` remains `NONE` on Free, resolves to the exact `{LIMITED, AI_CHAT_MESSAGES, 300, MONTH}` shape on Pro, and Premium's limit is real and strictly higher than Pro's.

## 14. Full test result

**1122 / 1122 passing** (85 test files), up from the 1113 baseline — 9 new, zero modified assertions in pre-existing tests, zero removed.

## 15. TypeScript result

`tsc --noEmit` — clean.

## 16. Lint result

`eslint .` — clean (the same one pre-existing, unrelated `<img>` warning carried since before Phase 18).

## 17. Build result

`npm run build` — succeeded (exit 0).

## 18. Live probes

Clearly separated by verification tier, per Step 12's explicit instruction:

- **CODE VERIFIED**: `tsc`, `eslint`, full test suite (§13/§14), production build (§17).
- **LIVE LLM VERIFIED**: `POST /api/ai/chat` with a real message, unauthenticated, against this environment's real OpenAI credentials → `200` with a genuine, complete AI answer (`"tool":"project-tool"`, real generated content) — direct, non-fabricated proof that anonymous chat is completely unaffected by this milestone's changes, exercising the real graph end to end (not mocked).
- **LIVE SUPABASE VERIFIED**: `GET /settings/billing` unauthenticated → `307` to `/login` (unchanged, pre-existing gate; no persistence read/write was exercised for this feature specifically, since no authenticated account exists in this environment to actually consume `AI_CHAT_MESSAGES` quota against real data).
- **NOT ATTEMPTED / BLOCKED**: any authenticated E2E of the new quota itself (an authenticated Free/Pro/Premium account actually hitting `FEATURE_NOT_INCLUDED`/`QUOTA_EXCEEDED` in the browser) — no real Supabase session exists in this environment; not claimed.
- **LIVE STRIPE VERIFIED**: not applicable to this milestone (no billing/Stripe code was touched).

## 19. Operational blockers

Unchanged from Phase 18 M6–M8 / Phase 19 M1, not re-litigated: platform billing migration unapplied, Stripe credentials unavailable, first platform admin not bootstrapped. This milestone touched only the entitlement registry and one route; none of these statuses changed as a result.

## 20. Deferred production infrastructure

**Anonymous AI Assistant abuse protection** (§7) — no IP/device-level rate limiting exists for `/api/ai/chat`, unlike the precedent already established for `/api/ai/job-match` (`job_match_requests` table + IP ledger). Deliberately not implemented this milestone (new infrastructure, out of charter). If real abuse is ever observed, the existing `job-match/rate-limiter.ts` pattern is the natural, already-proven template to reuse — not a new system to design from scratch.

## 21. Recommended Phase 19 Milestone 3

Only if real usage data ever shows anonymous chat abuse in production: implement the deferred IP-based rate limit for `/api/ai/chat` (§20), reusing the existing `job-match/rate-limiter.ts` pattern rather than inventing a new one. Otherwise, no further gap was identified significant enough to justify a dedicated milestone — the specific, named risk this milestone was chartered to close (`resume.ai_assistant` having no usage ceiling) is now fully closed, tested, and live-verified.
