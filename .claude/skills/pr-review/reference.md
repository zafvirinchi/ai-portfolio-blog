# PR Review Skill — Reference

Concrete file/pattern pointers to use while working through the `pr-review` checklist in this specific repository.

## Where the "obvious" entitlement pattern lives

Read one of these first if you need a refresher on what "correctly gated" looks like before judging a diff:
- `src/app/api/ai/resume-rewriter/route.ts` — session-start gate, anonymous-preserving (`getOptionalUserId()` + conditional `requireFeature`/`requireQuota`).
- `src/app/api/ai/linkedin/route.ts`, `src/app/api/ai/cover-letter/route.ts` — the same pattern applied to the two most recently-added features (Phase 19 M6); good examples of "gate the one structural chokepoint, not every sub-route."
- `src/app/api/ai/recruiter/compare/route.ts` — hard-required identity (`requireRecruiterId()`, no anonymous path) plus `requireFeature`.

## Known historical bypass shapes (grep for these patterns specifically)

Every one of these was a real, previously-found-and-fixed defect in this repo. A new change that reintroduces the *shape* of any of these, even in a different feature, should be treated as high-confidence BLOCKING:

1. **Chat-tool bypass**: a route is gated, but `src/lib/ai/tools/resume.tool.ts` calls the same underlying service function directly with no gate (Phase 19 M5 — `recruiter.analytics` bypass via `handleRecruiterMessage()`).
2. **Legacy-route duplicate**: two routes call the identical underlying LLM pipeline, one gated, one not (Phase 19 M3 — the `resume/versions/[id]/optimize` legacy duplicate of `jd-optimize/propose`).
3. **IDOR via unscoped internal accessor**: a route resolves "the acting user" from a *target* record's own stored field instead of the real session (Phase 19 M3 — the `recruitment/**` interview-readiness route reading `recruiterId` off the candidate record).
4. **Export link that can't render a rejection**: a plain `<a href="/api/...">` pointing at a route that can return a structured 402 — the browser just navigates to raw JSON (Phase 18 M8, Phase 19 M5/M6 — always fix with `fetch()` + blob download, see `src/lib/billing/export-download.ts`).
5. **Two features silently sharing one quota metric that shouldn't be shared**, or a UI action gated by a *different* feature than the one that produces the data it operates on (Phase 19 M5 — `compare`'s `recruiter.analytics` gate vs. its own export button's *different* `recruiter.export` gate; the export button needs its own rejection handling even though the action that produced the exportable data already succeeded).

## The two "which system is this" checks

Before reviewing any billing/recruiter file, confirm which of the two parallel systems it belongs to — a fix applied to the wrong one is a common review-time mistake:

- File path contains `platform-` or lives in `src/app/api/billing/platform/**` → the **platform** (per-user) system. Source of truth: `platform-schema.ts` → `feature-registry.ts` → `platform-plan-registry.ts` → `entitlement-service.ts`.
- File path is `billing-service.ts`/`subscription-service.ts`/`stripe-provider.ts`/`credit-service.ts`/`plan-service.ts` with no `platform-` prefix → the **organization**-scoped legacy system (Phase 14). Different plan catalog, different Stripe webhook endpoint, different `UpgradePrompt` component.
- `src/app/api/ai/recruiter/**` → newer, owned, gated recruiter system.
- `src/app/api/ai/recruitment/**` → older, deliberately unauthenticated pipeline system (do not "fix" its auth model as a side effect).

## Regression-test shape to expect for a genuine entitlement fix

The established pattern (see `src/app/api/ai/linkedin/route.test.ts` or `src/lib/ai/tools/resume.tool.test.ts`'s recruiter-chat-bypass tests) proves, at minimum:
1. `requireFeature`/`requireQuota` is called before the LLM-backed service mock.
2. A rejection (mocked to throw) results in the service mock **never being called**.
3. `recordUsage` is called exactly once on the success path, with the correct metric.

A test that only asserts an HTTP status code, without asserting the underlying mock was/wasn't called, does not actually prove the LLM call was prevented — flag this as an incomplete regression test.
