# Phase 15 — Milestone 3: Professional Resume Section & Entry Ordering

## 1. Objective

Improve section and entry ordering in the Dynamic Resume Builder toward a professional SaaS UX (Enhancv-style), while reusing the existing ordering representation, mutation functions, and API routes established in Milestones 1–2.

## 2. Existing Ordering Architecture

Audited before any change:

- **One authoritative ordering field**: every `ResumeSection` and `ResumeEntry` carries its own integer `order` (`dynamic-resume-schema.ts`). No `sortOrder`/`position`/separate array-index scheme exists anywhere — `order` is it.
- **Section reordering was already fully implemented**: `reorderSections()` (drag-and-drop, full permutation), `moveSectionUp()`/`moveSectionDown()` (single-step, used by explicit Move Up/Down buttons), both in `dynamic-resume-document-service.ts`, both wired through existing `/sections/reorder` and `/sections/[id]/move` routes.
- **Entry reordering was already fully implemented**: `reorderEntries()` (drag-and-drop), plus a client-computed Move Up/Down (`ResumeBuilder.tsx`'s `moveEntry()`) that calls the same `reorderEntries` mutation with a recomputed full order.
- **Preview/export already order-correct**: `prepareForRender()` (`dynamic-resume-render.ts`) — the single pipeline behind the React preview, PDF, DOCX, and Markdown export — already sorts both sections and entries by `.order` before rendering. Confirmed by reading it; not modified.
- **`fromDynamicResumeDocument()`** (Milestone 2) already sorts each legacy array (`workExperience`, `education`, `projects`, `certifications`, `achievements`, `languages`) by `.order` when deriving `resume_data` — meaning entry reordering already correctly propagates into what ATS/JD-matching/chat see, with zero changes needed this milestone.
- **dnd-kit** (`@dnd-kit/core` ^6.3.1, `@dnd-kit/sortable` ^10.0.0, `@dnd-kit/utilities` ^3.2.2) is already a project dependency, already used for both the section-card list and each section's entry list, via one reusable `SortableItem.tsx` wrapper. No new drag-and-drop dependency was added or needed.
- **Move Up/Down buttons already existed** on both sections (`SectionEditor.tsx`) and entries (`EntryEditor.tsx`) — the mobile/keyboard-accessible non-drag alternative the spec asks for (Part 27) was already in place before this milestone.

Given all of this, ordering itself was **not a gap** — this milestone's real work was a security fix uncovered during the audit, plus extending the one UI surface (`SectionNav.tsx`) the spec explicitly calls out as not yet reflecting real order.

## 3. Audit Finding: A Real Data-Loss Bug in the Existing Reorder Functions

While re-reading `reorderSections()`/`reorderEntries()` against this milestone's Part 20 ("reject duplicate section IDs… never trust the client ordering array"), both were found to validate **length** and **membership** but not **uniqueness**:

```ts
if (orderedSectionIds.length !== document.sections.length || !orderedSectionIds.every((id) => byId.has(id))) {
  throw new Error(...);
}
const sections = orderedSectionIds.map((id, index) => ({ ...byId.get(id)!, order: index }));
```

A payload like `[A, A, B]` on a 3-section document `[A, B, C]` has the correct length (3) and every id exists in `byId` — so it passed unchecked. The resulting `sections` array is built entirely from `orderedSectionIds`, so it becomes `[A(order 0), A(order 1), B(order 2)]` — **section C is silently deleted**, and A is duplicated. This is precisely the malicious/malformed-payload scenario Part 20 illustrates, and precisely the "do not leave missing sections" atomicity concern in Part 23 — this wasn't hypothetical, it was a real, reachable bug (reachable via a buggy or malicious client, not just an attacker) in code that predates this milestone.

**The fix**: new `InvalidOrderError` + a shared `validateOrderIds(orderedIds, existingIds)` helper, checking length, uniqueness (`Set` size), and membership — used by both `reorderSections()` and `reorderEntries()`. Wired into `handleVersionRouteError()` as `400`. A regression test (`dynamic-resume-document-service.test.ts`) confirms the exact `[A, A, B]`-on-3-sections scenario is now rejected with the original document left completely untouched.

## 4. Section Ordering — What Changed

Section reordering itself (drag-and-drop on the section cards, Move Up/Down) is unchanged — it worked correctly before this milestone and still does. What changed is `SectionNav.tsx`, per the spec's explicit "extend the existing SectionNav.tsx" instruction (Part 4):

**Before**: `SectionNav` rendered a *static, registry-declared-order* list of every section type (present or not), with a "✓ count" / "0" indicator and click-to-add-or-jump — it never reflected the document's actual current order, and had no reorder affordance at all.

**After**: `SectionNav` now renders **present sections in their real, current order** (`document.sections` sorted by `.order`, including CUSTOM sections inline — never segregated into a separate row, per Part 19), each row with:
- A drag handle (☷) using the same `SortableItem`/dnd-kit machinery as the main card list, calling the new `onReorder` prop → the exact same `reorderSections` mutation/route the main list already used.
- Move Up/Down buttons (disabled at the edges) calling the new `onMove` prop → the exact same `/sections/[id]/move` route `SectionEditor.tsx`'s own buttons already used.
- Specific `aria-label`s (`"Move {title} section up"`, `"Drag to reorder {title} section"`) rather than generic ones, per Part 6's literal example.
- A `(hidden)` tag for non-visible sections, so ordering a hidden section remains possible and legible without it looking deleted (Part 16).

Section types **not yet present** are still listed below (now correctly excluding CUSTOM, which is never "missing" — it's always addable again via `AddSectionMenu`), preserving the original quick-add behavior.

This is a second UI touchpoint for the same canonical `order` field and the same two existing mutations — not a second ordering system.

**Also fixed in passing**: `SectionEditor.tsx`'s own drag handle and Move Up/Down buttons had generic (`"Drag to reorder section"`) or missing `aria-label`s; both now say `"Move {title} section up/down"` / `"Drag to reorder {title} section"`, matching Part 6.

## 5. Entry Ordering — What Changed

Nothing. Entry drag-and-drop (`SectionEditor.tsx`'s `DndContext` over `EntryEditor` rows) and Move Up/Down (`EntryEditor.tsx`'s buttons, client-computed in `ResumeBuilder.tsx`) were already fully implemented and already used specific-enough visible button text; the only change affecting entries is the shared `validateOrderIds()` hardening in §3, which `reorderEntries()` now also uses.

## 6. Date-Based Auto-Reordering

Not implemented, per the spec's explicit instruction (Part 12). Manual order remains fully authoritative — nothing in this milestone inspects `startDate`/`endDate` to influence order.

## 7. Persistence & Autosave

No new persistence mechanism. Both `onReorder`/`onMove` (new in `SectionNav`) call the exact same `mutate()` helper and the exact same two existing routes (`/sections/reorder`, `/sections/[id]/move`) every other structural mutation in the builder already uses — a discrete POST per drop/click, never per intermediate drag frame (dnd-kit's `onDragEnd` only fires once, on drop). No new debouncing logic was needed since this was already true of the pre-existing section-card and entry drag-and-drop.

## 8. Security & Ownership

- `validateOrderIds()` runs in the pure service-layer function, not just at the route boundary — cannot be bypassed by any route.
- No new authorization layer — every reorder route still goes through the existing `requireUserId()` + `getVersion()` ownership check before the pure function ever runs; an id belonging to another user's document is rejected the same way an id that simply doesn't exist is (it's never in that document's `byId` map).
- Malformed shapes (wrong types, missing field) are still rejected at the Zod layer (`reorderSectionsSchema`/`reorderEntriesSchema`, unchanged); duplicate/unknown/cross-section ids are now rejected at the domain layer (`InvalidOrderError`, 400).

## 9. API Changes

None. No new route was created — per Part 22's explicit instruction, the existing `/sections/reorder`, `/sections/[id]/move`, and `/sections/[id]/entries/reorder` routes already fully represent this operation; `SectionNav.tsx` was simply given the same two callbacks `ResumeBuilder.tsx` already threads to `SectionEditor.tsx`.

## 10. Preview & Export Compatibility

Unaffected — confirmed by reading `dynamic-resume-render.ts`'s `prepareForRender()`, which already sorts by `.order` for both sections and entries, and is the one function behind the React preview, PDF, DOCX, and Markdown export. Zero changes were made to any renderer.

## 11. ATS / JD-Matching / Resume Chat Compatibility

Zero changes to `resume-score.ts`, `jd-matcher.ts`, `keyword-engine.ts`, or `optimizer.ts`. Reordering entries changes the *order* of `resume_data.workExperience` (etc.) via Milestone 2's existing `fromDynamicResumeDocument()` sync — which is the correct, intended behavior (Part 13: "only the order of structured content changes"), not a scoring change. A new test confirms a reorder never calls `computeJdMatchForResume` (the JD-optimizer's LLM pipeline) — zero new LLM calls, exactly like every other builder mutation since Milestone 2.

## 12. Tests

16 new deterministic tests, all non-LLM:

- `dynamic-resume-document-service.test.ts` (+11): duplicate-id rejection for both `reorderSections`/`reorderEntries` (the exact data-loss regression scenario, asserting the document is left untouched), unknown-id rejection, cross-section entry-id rejection, first-to-last/last-to-first reordering, single-section/one-entry/empty-entry-list no-ops, a CUSTOM section participating in ordering like any built-in type, and a hidden section surviving reorder without losing its hidden state.
- `resume-version-service.test.ts` (+5): end-to-end persistence-and-reload of a new section order, atomicity (a rejected duplicate-id payload leaves the previously-saved order intact), a cross-user section-id rejection, entry-reorder propagating into `resume_data.workExperience`'s order, and confirmation that `computeJdMatchForResume` is never called by a reorder.

## 13. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **548/548 passing** (up from the Milestone 2 baseline of 532; +16 new tests, 0 regressions, 46/46 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — unchanged |
| `npm run build` | `✓ Compiled successfully` |

## 14. Live Validation

Started a production server and probed the reorder routes directly, without authentication:

- `POST /api/ai/resume/versions/[id]/sections/reorder` with a duplicate-id payload (no auth) → `401`
- `POST /api/ai/resume/versions/[id]/sections/[sectionId]/entries/reorder` (no auth) → `401`

Both confirm auth is checked before ownership or order validation ever runs.

**What was not live-tested**: an authenticated click-through (drag a section in the builder, refresh, confirm order; drag an entry; export PDF/DOCX and visually confirm order; re-run ATS/JD-match). Same pre-existing Supabase auth/schema-cache limitation as every prior milestone in this phase — reported honestly rather than assumed. The new behavior (including the duplicate-id fix and the SectionNav rewrite's callbacks) is instead established by the 16 new tests in §12, which exercise the same service-layer functions and the same route wiring the UI calls.

## 15. Database Changes

None.

## 16. Known Limitations

- **Concurrency**: no optimistic-locking/revision check exists on `resume_versions` beyond `updated_at` — concurrent edits from two tabs/devices are last-write-wins, unchanged from before this milestone. Per Part 24's explicit instruction, this is documented rather than addressed with a new locking mechanism in this milestone.
- **Undo/redo**: not implemented, none existed before. Documented as potential future work per Part 26.
- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase limitation (§14).

## 17. Recommended Next Milestone

A lightweight "reorder failed, order restored" toast for the rare rejected-payload case (currently surfaces through the builder's existing generic error banner, which is correct but generic) — small, UI-only, no new architecture.
