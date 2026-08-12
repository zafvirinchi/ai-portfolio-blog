# Phase 15 — Milestone 2: Dynamic Sections, Fields & Entry Management

## 1. Audit Findings

Milestone 1 established that the Dynamic Resume Builder's core architecture already exists. This milestone's audit went one level deeper — checking the *data-driven-ness, security, and cross-feature compatibility* of that architecture line by line against this milestone's spec — and found it is genuinely comprehensive, with four concrete gaps.

**Confirmed already correct, no changes needed:**

| Requirement | Status |
|---|---|
| One authoritative field/section registry (`SECTION_REGISTRY`) | Already the single source of truth; `EntryEditor.tsx` renders every field generically from it — zero per-section-type hard-coded forms found anywhere |
| Unknown **section type** rejection | Already enforced — `addSectionSchema` validates `type` against `z.enum(SECTION_TYPES)`, a 400 on anything else |
| Section reordering | Already fully implemented — drag-and-drop (`reorderSections`) and Move Up/Down (`moveSectionUp`/`moveSectionDown`) |
| Entry reordering | Already fully implemented — drag-and-drop (`reorderEntries`) and Move Up/Down (computed client-side in `ResumeBuilder.tsx`'s `moveEntry()`) |
| Add / Edit / Delete / Duplicate entry | All already implemented (`addEntry`, `updateEntry`, `removeEntry`, `duplicateEntry`) |
| Skills stored as canonical category+list groups | Confirmed — matches the legacy `skills`/`technicalSkills`/`softSkills` split exactly; not changed |
| Required vs. optional fields | The existing `dynamicResumeDocumentSchema` treats every entry field as optional free-form data (`fields: z.record(...).default({})`) — per the spec's own "do not make a field required merely because it is normally useful… use the existing schema's requirements," **no artificial required-field enforcement was added**. This is a deliberate non-change, not an oversight. |

**Genuine gaps found (all four addressed below):**

1. **No server-side rejection of unknown field keys** — a client could submit `{"fields":{"maliciousField":"..."}}` and it would be silently merged into `entry.fields`.
2. **No sync back to `resume_data` after a builder edit** — ATS scoring, JD matching, and the resume chat tool all read the legacy `resume_data` column, which builder mutations never touched.
3. **No way to edit Personal Information** (name/email/phone/location/LinkedIn/GitHub/website) anywhere in the builder — confirmed via a full-codebase search, it was read-only everywhere.
4. **Array fields (Technologies, Skills, Achievements) used a raw newline-delimited textarea**, not the chip-style add/remove control the spec's own mockup illustrates.

## 2. Gap 1 — Unknown/Invalid Field Protection

**The problem**: `addEntrySchema`/`updateEntrySchema`'s `fields: z.record(z.string(), fieldValueSchema)` validates each *value's shape* but accepts *any key*. The section-registry's own doc comment explicitly called it "a rendering/UI hint, not a validation whitelist" — a deliberate earlier design decision that this milestone's explicit security requirement (Part 17/18) overrides.

**The fix** (`dynamic-resume-document-service.ts`):
- New `validateEntryFields(sectionType, fields)`, called at the start of `addEntry()` and `updateEntry()` — before the document is mutated.
- Every key in the caller-supplied `fields` must be one `getSectionDefinition(sectionType).entryFields` actually declares; anything else throws `UnknownFieldError`.
- `CUSTOM` sections declare zero `entryFields`, so any `fields` key on a CUSTOM entry is rejected — this matches existing UI behavior exactly (`EntryEditor.tsx` never renders field inputs for CUSTOM entries; ad-hoc content there already only ever goes through the separate `customFields` array). An **empty** `fields: {}` is always accepted (the normal "add a blank entry" case).
- A `url`-typed field's value, if non-empty, must parse as an `http:`/`https:` URL (`new URL()`), or a new `InvalidFieldValueError` is thrown.
- Both errors are wired into the shared `handleVersionRouteError()` as `400`.

**Not added, and why**: strict date-format validation. The registry's `date` fields are intentionally free text (`EntryEditor.tsx`'s own placeholder: `"e.g. Jan 2022"`) to support how resumes conventionally express dates ("Jan 2022 – Present"); forcing ISO-date parsing would break that existing, intentional design, not fix a bug.

## 3. Gap 2 — `resume_data`/`ats_score` Staleness After Builder Edits

**The problem**, discovered while tracing how ATS scoring and JD matching actually get their input: `resumeScorer.score(resume)` and `computeJdMatchForResume(resume, ...)` both operate on the legacy `resume_data` column — never on `sections_data`. Every builder mutation (`addSection`, `updateEntry`, etc.) funnels through `saveDynamicDocument()`, which only ever wrote `sections_data`. The result: edit a job title in the builder, and ATS score, JD match, and the resume chat tool all keep seeing the *old* title indefinitely — exactly the regression this milestone's Part 25 illustrates ("Software Engineer" → "Lead Full Stack Developer").

**The fix**:
- New pure function `fromDynamicResumeDocument(document, previousResume)` in `resume-migration.ts` — the exact inverse of the existing `toDynamicResumeDocument()`, mapping SUMMARY/EXPERIENCE/EDUCATION/PROJECTS/SKILLS/CERTIFICATIONS/ACHIEVEMENTS/LANGUAGES sections and `personalInformation` back into the legacy `Resume` shape. `yearsOfExperience` — the one legacy field nothing in the dynamic model can express — is carried forward unchanged from `previousResume` rather than fabricated.
- `saveDynamicDocument()` now derives this snapshot on every save and writes it to `resume_data`, and recomputes `ats_score` via the existing, already-imported, fully deterministic `resumeScorer.score()` (confirmed to make zero LLM calls by reading `resume-score.ts`) — so this never adds a new AI call, no matter how often the user edits.
- `jd_match_score`/`matchedSkills`/`missingSkills`/`optimizedSections` are **deliberately left untouched** by this change — refreshing those requires `computeJdMatchForResume()`'s real LLM pipeline (JD parsing + optimization), which a manual field edit must never silently trigger. Re-running "Optimize for JD" remains the only way those update, exactly as before this milestone.

**Symmetric limitation, not a regression**: any dynamic-only content the legacy `Resume` schema has no slot for (a Project's start/end dates, a job's free-text Description separate from its Achievements, per-entry Technologies on Experience, Certification's expiry/credential fields, entire section types like AWARDS/PUBLICATIONS/COURSES/etc.) is necessarily absent from this derived snapshot — the same one-directional limitation `toDynamicResumeDocument()` already has in reverse, inherent to the legacy schema's fixed shape.

## 4. Gap 3 — Personal Information Editing

**The problem**: `personalInformation` (name, email, phone, location, LinkedIn, GitHub, website) is part of `DynamicResumeDocument` and is read everywhere (preview, PDF/DOCX/Markdown export, resume-quality scoring) but had **no write path at all** — no API route, no UI.

**The fix**:
- New pure function `updatePersonalInformation(document, updates)` — a small merge-patch, kept separate from the section/entry machinery since personal info isn't a section (never addable/removable, always exactly one).
- New `updatePersonalInformationSchema` (Zod, all fields optional, trimmed, capped at 200 chars, empty string normalized to `null`).
- New service method `resumeVersionService.updatePersonalInformation()`.
- New `PATCH` handler added to the **existing** `/api/ai/resume/versions/[id]/document` route (which already had `GET`) — no new route file, per the "add an endpoint only if genuinely no suitable one exists" instruction.
- New `PersonalInfoEditor.tsx` — a collapsible card at the top of the builder's Sections tab, same on-blur commit convention as `EntryEditor.tsx`'s fields.

## 5. Gap 4 — Array/List Field Chip Editor

**The problem**: every "list"-typed field (Technologies, Achievements, Skills, Interests) rendered as a bare `<textarea>` with a "one per line" convention — functional, but not the add/remove-per-item chip UI the spec's own mockup shows (`[Java] [Spring Boot] [Angular] [+ Add]`).

**The fix**: new `ArrayFieldEditor.tsx` — one reusable component (used by every "list" field via `EntryEditor.tsx`'s `FieldInput`, not duplicated per field), rendering each array item as a removable chip plus an add-input. Commits the whole array on each add/remove click (a discrete action, not a keystroke) — consistent with the rest of the builder never firing a save per keystroke. The underlying field value is still a plain `string[]`, committed through the exact same `onCommit`/PATCH path as before — no schema or API change.

## 6. Existing Architecture Reused (Not Modified)

`SECTION_REGISTRY`, `dynamicResumeDocumentSchema`, all existing mutation functions (`addSection`, `updateSection`, `removeSection`, `reorderSections`, `moveSectionUp/Down`, `removeEntry`, `duplicateEntry`, `reorderEntries`, custom-field CRUD), all ~10 existing `/sections*` routes, `resumeScorer.score()`, `toDynamicResumeDocument()`, `EntryEditor.tsx`'s on-blur commit pattern, `SectionEditor.tsx`, `SectionNav.tsx`, `AddSectionMenu.tsx`, `ResumePreview.tsx`'s rendering pipeline, `handleVersionRouteError()`.

## 7. Protected Architecture — Untouched

No changes to `ConversationService`, LangGraph/`GraphState`, the Planner, Tool Registry, `PortfolioChain`, the multi-agent coordinator, interview/mock-interview architecture, or the ATS/JD-matching *algorithms* themselves (`resume-score.ts`, `jd-matcher.ts`, `keyword-engine.ts`, `optimizer.ts` — zero lines changed in any of them). Only the *data* fed into the existing, unmodified `resumeScorer.score()` call is now kept fresh.

## 8. Security

- Field-key and URL validation happens in the pure service-layer function (`dynamic-resume-document-service.ts`), not just at the route boundary — it cannot be bypassed by any current or future route that calls `addEntry`/`updateEntry`.
- No new authorization mechanism — the new `PATCH /document` route uses the exact same `requireUserId()` + service-layer ownership check (`getVersion`) every other route already uses.
- No sensitive content logged; existing `console.log` calls in the service were not changed.

## 9. API Changes

One new handler on an existing route: `PATCH /api/ai/resume/versions/[id]/document` (personal information). No new route files. All ~10 existing `/sections*` routes are unchanged in their request/response shape — only their underlying pure functions gained validation.

## 10. Tests

24 new deterministic tests added, all non-LLM:

- `dynamic-resume-document-service.test.ts` (+10): unknown-field rejection on `addEntry`/`updateEntry`, per-section-type key scoping, CUSTOM-section field rejection, empty-`fields` acceptance, URL validation (valid/invalid/empty-clearing), `updatePersonalInformation` merge semantics.
- `resume-migration.test.ts` (+7): full round-trip of `fromDynamicResumeDocument(toDynamicResumeDocument(resume))`, `yearsOfExperience` preservation, a builder-edit-then-derive scenario matching the spec's own "Lead Full Stack Developer" example, skill-category bucketing (general/technical/soft, including a renamed/new category), `personalInformation` precedence, and a dynamic-only section type (AWARDS) not throwing.
- `resume-version-service.test.ts` (+7): end-to-end `resume_data`/`ats_score` sync through `addSection`/`addEntry`/`updateEntry`, confirmation that `jd_match_score`/`matchedSkills` are untouched by a builder edit (with an explicit assertion that `computeJdMatchForResume` was called exactly once — proving zero new LLM calls), `updatePersonalInformation` ownership isolation, and end-to-end unknown-field rejection through the full service layer.

## 11. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **532/532 passing** (up from the Milestone 1 baseline of 508; +24 new tests, 0 regressions, 46/46 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element` in `blog/[slug]/page.tsx`) — unchanged from before this milestone |
| `npm run build` | `✓ Compiled successfully` — all routes built |

## 12. Live Validation

Started a production server and probed the new/changed routes directly, without authentication:

- `PATCH /api/ai/resume/versions/[id]/document` (no auth) → `401`
- `POST /api/ai/resume/versions/[id]/sections/[sectionId]/entries` with a malicious field key (no auth) → `401`

Both confirm the new route and the tightened validation path are reachable and auth-gated before ever evaluating ownership or field rules.

**What was not live-tested**: a full authenticated click-through (edit Personal Information, add an Experience entry with a malformed URL and see the 400, edit a field and confirm ATS score updates, refresh and confirm persistence). This requires an authenticated Supabase session; the same auth/schema-cache limitation documented since Phase 13 Milestone 14 (and reconfirmed in Milestones 24 and Phase 15 Milestone 1) still blocks establishing one in this environment. Reported honestly per the spec's explicit instruction, rather than assumed from code review. Correctness of the new behavior is instead established by the 26 new unit/integration-style tests in §10, which exercise the exact same service-layer functions the routes call — including the specific `resumeData`/`atsScore` propagation and `jd_match_score` non-propagation scenarios the spec's own examples describe.

## 13. Database Changes

None — no migration. `resume_data` and `ats_score` (both pre-existing columns) are simply written more often (on every builder save, not only on version creation/JD-optimization), by code already reusing the existing insert/update shape.

## 14. Known Limitations

- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase auth/schema-cache limitation (§12) — unchanged from prior milestones, not introduced by this one.
- `fromDynamicResumeDocument()` cannot represent dynamic-only content in the legacy `resume_data` snapshot (§3) — by design, and symmetric with the existing forward-conversion limitation.
- No per-field `required` metadata was added — the existing schema treats all entry fields as optional, and this milestone deliberately did not invent stricter requirements not already present (§1).
- Date fields remain free text with no format validation, matching their existing, intentional design.

## 15. Recommended Next Milestone

A small, focused pass on `jd_match_score` freshness messaging: since builder edits now correctly update `ats_score` but deliberately leave `jd_match_score` stale (to avoid a hidden LLM call), the UI could surface a lightweight "your ATS score is current, but re-run JD Match to refresh your match score" hint after an edit — a UI-only addition, no new algorithm, no new LLM call trigger, just closing the loop on the distinction this milestone establishes.
