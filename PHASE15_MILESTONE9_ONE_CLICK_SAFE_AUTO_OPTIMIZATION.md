# Phase 15 — Milestone 9: One-Click Resume Optimization & Safe Auto-Fix

## 1. Objective

A safe, fact-preserving "Optimize Resume" workflow — Analyze → Review → Optimize → Validate — reusing the existing proposal/apply/version architecture, never a second one.

## 2. Audit Findings

This milestone's audit was the most security-focused of the phase, and its central finding is reassuring: **the specific attack this milestone worries about most (§6 — a malicious client flipping `autoApplicable: false` to `true`) is already defended, in depth, by code written in Phase 13.**

Traced `optimization-review.ts`'s `applyOneProposal()` line by line:

1. **Explicit check**: `if (!proposal.autoApplicable) return document;` — rejects any proposal not marked safe, regardless of what the client sends.
2. **Structural defense, independent of #1**: even if a client forges `autoApplicable: true` on an `educationGap`/`certificationGap` proposal, the field-writing logic only has branches for `fieldKey === "summary" | "achievement" | "projectDescription" | "skillsReorganization"` — there is **no code path at all** that would ever write an `educationGap`/`certificationGap` proposal's `proposedValue` anywhere. A forged flag has nothing to exploit.

A new test (`optimization-review.test.ts`) proves this directly: a proposal with `fieldKey: "educationGap"` and a **forged** `autoApplicable: true` still leaves the document byte-identical.

Also already fully built and confirmed correct: batch apply (Accept All → Apply N Selected Changes, already only ever containing `autoApplicable: true` proposals — already "Apply Safe Improvements"), Projected ATS Score, version safety (new-version-default / current-version / master-blocked), Before/After review, per-proposal Accept/Reject/Edit, and rollback (the "new version" default IS the undo mechanism — the original is never touched).

## 3. Genuine Gaps Found

1. **Silent partial success (§10/§11/§18/§19).** `applyOneProposal()` already correctly no-ops a stale proposal (its `originalValue` no longer found — the resume changed since the proposal was generated) or an already-applied one — but it told nobody. A batch of 4 accepted proposals where 1 was stale would report "changes applied" with zero indication that only 3 genuinely took effect. This is exactly the "never claim a false Optimization Complete" violation §23 warns about.
2. **Incomplete no-op protection (§17).** When a resume had zero safe (auto-applicable) proposals but some manual (gap) ones, the UI still rendered a disabled "Apply 0 Selected Changes" button instead of a clear message.
3. **Generic action labels (§30)** on the two primary actions ("Analyze Changes", "Apply N Selected Changes") lacked the more descriptive `aria-label`s the spec's own examples show.
4. **"General Resume Optimization" (§3, no-JD case) has no entry point in the version architecture at all** — investigated and deliberately not built; see §4 below.

## 4. A Deliberately Deferred Finding: No General (No-JD) Optimization Entry Point

`VersionDetail.tsx` has no "Optimize Resume" action independent of pasting a JD. Investigating whether the existing, standalone `resume-rewriter/` engine (which *does* rewrite summary/experience/projects/skills without needing a JD) could be wired in revealed a real architectural gap: that engine is keyed entirely off an **ephemeral** `resumeId` from `resumeService`, created only by `analyzeUpload()` — which requires a raw uploaded file and runs a full extract→parse→**analyze (LLM call)**→score pipeline. There is no lightweight way to register an already-persisted version's `resumeData` as an ephemeral entry without either (a) triggering a new LLM call (`resumeAnalyzer.analyze()`, forbidden by §26/§27 outside an explicit user-initiated action) or (b) building new registration plumbing bypassing that pipeline — a legitimately bigger change than a "smallest safe gap-fill" should make without being asked more explicitly. This was deliberately not attempted. `POST /api/ai/resume/versions/[id]/rewrite` (which accepts a completed rewrite session and saves it to a version) already exists and works — it's simply never reachable from any UI today, a genuine, documented, pre-existing gap left for a future milestone with the room to design that bridge properly.

## 5. Files Modified

- `src/lib/ai/resume-versions/dynamic/optimization-review.ts` — `applyOneProposal()`/`applyChangeProposals()` now return `{ document, results }`, where `results` is one honest `{ proposalId, outcome: "applied" | "skipped_not_applicable" | "skipped_stale" }` per proposal. Pure refactor — the actual accept/reject/write logic is unchanged.
- `src/lib/ai/resume-versions/resume-version-service.ts` — `applyOptimizationProposals()` now returns `{ version, results }` instead of just `version`, and its log line reports `requested`/`applied` counts instead of just a raw count.
- `src/app/api/ai/resume/versions/[id]/jd-optimize/apply/route.ts` — response now includes `results` alongside `version`/`createdNewVersion`.
- `src/components/resume/versions/JdOptimizationReview.tsx` — surfaces `results` as "N applied, M were outdated" with a "Regenerate Recommendations" action (§19); the Apply Changes card is skipped entirely (replaced by a message) when there are zero safe proposals (§17); "Safe to Apply"/"Requires Your Confirmation" badges and specific `aria-label`s were carried over from Milestone 8's own pass and extended to the two primary buttons here.
- `src/lib/ai/resume-versions/dynamic/optimization-review.test.ts`, `optimizer-consolidation.test.ts` — updated for the new return shape; added explicit outcome assertions and one new test for the forged-`autoApplicable` scenario.

## 6. Files Intentionally Untouched

`buildChangeProposals()`/`buildEducationAndCertificationProposals()` (proposal generation — already correct, unmodified), `projectAtsScoreAfterProposals()` (Projected Score — already correct), the `/propose` route (no request/response shape change needed), `resume-version-service.ts`'s `applyJdOptimization()` (the older, still-kept-for-compatibility non-review apply path — out of scope, no UI reaches it per Milestone 19's own audit), `resume-rewriter/*` (untouched — see §4), `resume-score.ts`/`ats-engine.ts`/`keyword-engine.ts` (the ATS/JD engines — completely unmodified, exactly as instructed).

## 7. Optimization Flow

Unchanged: Analyze (propose) → Review (per-proposal Accept/Reject/Edit, or the new "no safe improvements" message) → Apply (batch, target new/current version) → the version updates, and — new this milestone — the caller now learns exactly how many proposals genuinely took effect.

## 8. Safe Auto-Apply

Unchanged and reconfirmed secure (§2 above) — the authoritative `autoApplicable` flag is enforced entirely server-side, in the one pure function that ever writes to a document, independent of what any client sends.

## 9. Manual Confirmation

Unchanged — `educationGap`/`certificationGap` proposals remain permanently non-auto-applicable by construction (no rewrite exists that could satisfy "you don't have this degree" without fabricating it), surfaced with "Requires Your Confirmation" (Milestone 8) and an "Open Builder"-style navigation action.

## 10. Before/After

Unchanged — `ProposalCard`'s existing Before/After display, now additionally reporting per-proposal apply outcome after the fact.

## 11. Batch Application

Unchanged mechanism (`applyChangeProposals` over an array), now honest about outcome per item instead of an all-or-nothing implicit success.

## 12. Partial Failure

Now explicit: the apply response's `results` array lets the UI report "3 applied, 1 outdated" instead of a blanket success message — see §5.

## 13. Stale Proposal Protection

Already existed as a *behavioral* no-op (Phase 13); now also existed as a *reported* outcome (`skipped_stale`) with an explicit "Regenerate Recommendations" recovery action, reusing the existing "Analyze Changes" handler — no new regeneration mechanism.

## 14. Version Safety

Unchanged — target "new version" (default) vs. "current version" (non-master only), Master Resume reachable only via a new version.

## 15. Rollback

Unchanged, reconfirmed: the "new version" default is the rollback mechanism by construction — the original version is a completely untouched, always-restorable row.

## 16. ATS Recalculation

Unchanged — `saveDynamicDocument()` (Milestone 2) recomputes `ats_score` via the same deterministic `resumeScorer.score()` on every save, including every optimization-proposal apply. Confirmed no duplicate scoring was introduced.

## 17. JD Score Behavior

Unchanged and confirmed correct: `jd_match_score` is never recomputed by an apply — it stays whatever it was from the last explicit JD analysis, exactly as §15 demands ("never estimate a new JD score as fact").

## 18. Security

No new prompt construction, no new delimiter implementation, no new LLM call. The one code path that decides what may be written to a document remains a single, small, server-only pure function, unreachable by any client-supplied flag override — reconfirmed by a new explicit test.

## 19. Authorization

Unchanged — every route in this flow still goes through `requireUserId()` + the service layer's `getVersion()` ownership check.

## 20. Audit Logging

`resume-version-service.ts`'s existing `console.log` on apply now reports `requested`/`applied` counts (a small, useful addition) instead of just a raw proposal count — still never logs resume or JD text, consistent with the existing pattern throughout this service.

## 21. Accessibility

Added `aria-label="Optimize resume for this job description"` and `aria-label="Apply all selected safe improvements"` to the two primary actions, matching the spec's own phrasing; the "Regenerate Recommendations" link and the no-safe-improvements message are both plain, readable text.

## 22. Performance

Zero new ATS/JD/parser calls. The outcome-reporting refactor adds no new computation — it only records a value (`outcome`) the function was already implicitly deciding on every iteration.

## 23. Tests

Extended existing test files (no new file needed — the change is a refactor of already-tested functions):

- `optimization-review.test.ts`: every existing `applyChangeProposals` call site updated to destructure `{ document, results }`; explicit assertions added that a genuinely-changed proposal reports `"applied"`, a stale one reports `"skipped_stale"`, and a non-auto-applicable one reports `"skipped_not_applicable"`; **one new test** proving a client-forged `autoApplicable: true` on a gap proposal still writes nothing.
- `optimizer-consolidation.test.ts`: updated for the new return shape (no behavior change to what it verifies).

## 24. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **620/620 passing** (up from the Milestone 8 baseline of 619; +1 new test, 0 regressions, 49/49 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — unchanged |
| `npm run build` | `✓ Compiled successfully` |

## 25. Live Validation

Started a production server and probed the apply route directly, without authentication, including a payload with a forged `autoApplicable: true` on an `educationGap` proposal:

- `POST /api/ai/resume/versions/[id]/jd-optimize/apply` with the forged payload (no auth) → `401`

Confirms auth is checked before any proposal is ever evaluated — the forged-flag defense (proven safe in the unit test) is never even reached without a valid session first.

**What was not live-tested**: an authenticated click-through (propose changes, apply a batch where one proposal has gone stale via a concurrent Builder edit, confirm the "N applied, M outdated" message and Regenerate action). Same pre-existing Supabase auth/schema-cache limitation as every prior milestone in this phase — reported honestly rather than assumed. The staleness/outcome-reporting behavior is established by the unit tests in §23, which exercise the exact same pure function the API route calls.

## 26. Database Changes

None.

## 27. Known Limitations

- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase limitation (§25).
- General (no-JD) resume optimization has no version-based entry point — deliberately not built this milestone; see §4 for the full reasoning.
- No new optimistic-concurrency/version-mismatch mechanism was added for the "two overlapping apply requests" scenario (§20's concurrency concern) — this codebase has no such mechanism anywhere (confirmed and documented as a known limitation as far back as Milestone 3), and adding one solely for this one write path would be an inconsistent, isolated exception rather than the "smallest safe mechanism consistent with the current architecture" the spec itself asks for. The existing behavior (last write wins, via `saveDynamicDocument`'s unconditional update) is unchanged and documented rather than silently left unaddressed.

## 28. Recommended Next Milestone

Design the bridge identified in §4 properly: a lightweight `resumeService.registerEphemeral(resume: Resume)`-style method that creates an ephemeral entry without running `analyzeUpload()`'s LLM-calling analysis step, letting `VersionDetail.tsx` offer a genuine "Optimize without a JD" action that reuses the existing `resume-rewriter` engine and the already-built (but currently unreachable) `POST /versions/[id]/rewrite` save path — closing the one structural gap this milestone found but correctly declined to patch over.
