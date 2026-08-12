# Phase 13 — Enterprise Resume Versioning & Job-Specific Resume Management

## 1. Goal

Let a user maintain multiple tailored resume versions — for different
jobs, companies, roles, and locations — cloned from a single canonical
Master Resume that never changes automatically. Every JD optimization
creates a new (or updates an existing, non-master) version instead of
overwriting the master.

## 2. Existing architecture discovered

Before writing any code, the entire resume/JD/rewrite stack (Phase 12,
Phase 13 Milestones 1-5) was inspected. The single most important
finding:

**Nothing resume-related is persisted anywhere in this project.**
`resumeService` (Phase 12), `jdMatchService` (Phase 13 M1), the two
optimizers (`optimizer.ts` and `resume-optimizer.ts`, Phase 13 M2/M4),
and `rewriteService` (Phase 13 M5) are all in-memory `Map`s with a
2-hour TTL, no database table, and no user association whatsoever — a
`resumeId`/`jdMatchId`/`rewriteId` is just a random UUID key into
process memory. The entire `/resume-analyzer` experience is, by
design, fully anonymous: no login is required to upload, analyze,
JD-match, optimize, or rewrite a resume.

This meant Resume Versioning couldn't just "extend an existing
persistence layer" — there wasn't one. It had to introduce the first
persistent, user-owned resume storage in this project, while leaving
every existing ephemeral/anonymous flow completely unchanged. This
tradeoff (versions require login; upload/analyze/JD-match/rewrite stay
100% anonymous-usable) was confirmed with the user before writing any
code.

Other things confirmed by inspection:
- Two distinct, unrelated optimizers share the identically-named
  export `resumeOptimizer` (`job-description/optimizer.ts`, used
  inside `jd-service.ts`'s match pipeline, vs.
  `job-description/resume-optimizer.ts`, the standalone "Resume
  Optimizer" panel, Phase 13 M2) — a pre-existing naming collision,
  not something this milestone introduced or needed to fix.
- Two distinct ATS scorers exist: `resume-score.ts`'s `resumeScorer`
  (general, no JD needed — categories: formatting/keyword/experience/
  skills/education/certification) and `job-description/ats-engine.ts`
  (JD-specific fit scoring, only runs as part of JD matching). A
  version's `atsScore` uses the general scorer when no JD is attached,
  and the JD-specific score once one is — this is why the milestone's
  own example ("Master: ATS 82" → "Tailored version: ATS 94") makes
  sense: they're two different, correctly-sourced numbers, not the
  same score recomputed.
- `jd-match/[jdMatchId]/export/{build-optimized-resume,pdf-renderer,docx-renderer}.ts`
  already render a resume from a flat "sections" object
  (candidateName/targetRole/summary/skills/experienceBullets/
  projectBullets/missingSkills) to Markdown/PDF/DOCX — reused directly
  for version downloads (see §5).
- No toast/modal system exists anywhere in the codebase; every page
  uses inline error banners and `window.confirm()` for destructive
  actions (e.g. `settings/organization/page.tsx`). The versions UI
  follows this exactly — no new UI primitives introduced.

## 3. Database changes

One new, additive table — `supabase/migrations/20260810000000_add_resume_versions.sql`:

```sql
resume_versions (
  id, user_id,
  version_name, version_number,
  is_master, is_archived,
  source_version_id,
  target_job_title, target_company, target_location, job_description_text,
  resume_data,                                  -- full Resume JSON snapshot
  ats_score, jd_match_score, matched_skills, missing_skills,
  optimized_sections, rewritten_sections,        -- snapshots, see §8
  created_at, updated_at
)
```

- `user_id references auth.users(id)` — personal, not
  organization-scoped (this app's SaaS org model doesn't naturally fit
  "my resume," and a user shouldn't have their resume versions
  fragmented by whichever organization happens to be active).
- **Exactly one active master per user is enforced at the database
  level**, not just in application code: `create unique index
  resume_versions_one_master_per_user on resume_versions (user_id)
  where is_master and not is_archived`. Demoting the old master before
  promoting a new one (two separate `UPDATE`s — see §10) can never
  produce two simultaneously-readable masters, because the second
  `UPDATE` would violate this index if the first hadn't already
  cleared it.
- No RLS, consistent with every table in this project — all access
  goes through `supabaseAdmin`, ownership enforced by every service
  method requiring and filtering by an authenticated `userId`.
- `rag_documents`/`rag_document_chunks` are untouched — resume versions
  are never Knowledge Base documents.

## 4. APIs

Following the project's existing `/api/ai/resume/*` convention exactly:

```
GET    /api/ai/resume/versions              list (own versions only)
POST   /api/ai/resume/versions              create (bootstraps master if none exists)
GET    /api/ai/resume/versions/[id]         detail
PATCH  /api/ai/resume/versions/[id]         rename / metadata edit (allowed on master)
DELETE /api/ai/resume/versions/[id]         soft-delete/archive (blocked on master)
POST   /api/ai/resume/versions/[id]/duplicate
POST   /api/ai/resume/versions/[id]/restore
POST   /api/ai/resume/versions/[id]/optimize   apply JD matching+optimization (blocked on master)
POST   /api/ai/resume/versions/[id]/rewrite    save an existing rewrite session's accepted content (blocked on master)
GET    /api/ai/resume/versions/[id]/export     download (?format=pdf|docx|markdown)
POST   /api/ai/resume/versions/compare
```

Every route resolves identity via `requireUserId()` (a real Supabase
session — `supabase.auth.getUser()`), never from the request body or
a query parameter. `POST /versions` and `POST /versions/[id]/optimize`
are the only two AI-invoking routes and are metered exactly like the
existing `/api/ai/resume/jd-match` (`checkCredits("jd_match")` /
`withUsageContext("JD_MATCHING", "JD_ANALYSIS", ...)` /
`consumeCredits("jd_match", ...)`) — genuine reuse of Phase 14's
credit engine, not a new metering category. Every other route
(list/get/rename/duplicate/delete/restore/compare) is pure database
I/O with zero AI calls.

## 5. UI

- `/resume-analyzer` (existing page) gained one new button, "Save to
  My Versions," next to the existing "Download Analysis"/"Rewrite my
  resume" actions — links to `/resume-analyzer/versions?resumeId=...`.
  No other change to this page.
- `/resume-analyzer/versions` (new) — the versions dashboard:
  create-version form (name/target role/company/location/optional JD
  text), version cards (★ Master badge, target role/company/location,
  ATS/JD-match scores, updated date, Open/Duplicate/Rename/Delete
  actions), checkbox-based comparison ("select 2, Compare Selected"),
  and the exact empty state text from the spec ("No tailored resumes
  yet." / "Create a version to tailor your resume for a specific
  job.").
- `/resume-analyzer/versions/[id]` (new) — version detail: full resume
  content (summary/experience/projects/skills/education/
  certifications/achievements — showing the JD-optimized summary/
  skills/experience in place of the raw ones once a version has been
  optimized), scores, matched/missing skills, optimization summary,
  and actions (Download PDF/DOCX, Restore as Master, Compare with
  Master, an inline "Optimize for JD" form).
- New components under `src/components/resume/versions/`
  (`VersionsList.tsx`, `VersionDetail.tsx`) — plain Tailwind, the
  existing `rounded-2xl border border-slate-200 bg-white shadow-sm`
  card language, inline error banners, `window.confirm()` for delete —
  zero new UI framework or design language.

## 6. Version lifecycle

```
Upload + Analyze (existing, ephemeral, anonymous)
        │
        ▼
"Save to My Versions" (requires login)
        │
        ▼
First version ever for this user → becomes Master automatically
        │
        ├──► "Create Version" (clone master) ──► tailored version (is_master=false)
        │           │
        │           ├─ no JD  → ATS score only (general scorer)
        │           └─ + JD   → existing JD-match/optimize pipeline runs,
        │                       scores + optimized sections stored
        │
        ├──► Duplicate (independent copy, own id)
        ├──► Rename (metadata only, no content change)
        ├──► Delete (soft — is_archived=true; never the active master)
        └──► Restore as Master (promotes this version; demotes — never
              archives — the previous master, which stays in history)
```

`source_version_id` is preserved on every clone/duplicate, so "Master
v1 → UAE JD v2 → UAE JD Optimized v3" is always reconstructable by
following that chain — `version_number` is a simple per-user
increment (max+1), giving a readable creation order even without
walking the chain.

## 7. Master resume behavior

- Bootstrapped automatically the first time a logged-in user saves any
  version with no existing master (no separate "create my master"
  action needed).
- `PATCH` (rename, target-role/company/location metadata) is allowed
  on the master — it's a direct, non-AI, explicit user edit, exactly
  the one exception the spec calls out.
- `DELETE`, `optimize`, and `rewrite` (save) all throw
  `MasterResumeProtectedError` (HTTP 409) when targeted at the active
  master — enforced in the service layer, not just the UI, so there is
  no route or client bug that could bypass it.
- The only way the master ever changes identity is `restoreAsMaster`,
  which is an explicit, confirmed user action ("You are about to make
  this version your Master Resume. Your current master will be
  preserved in version history.") — never a side effect of any AI
  operation.

## 8. JD integration

No second JD-matching implementation was written. `jd-service.ts`'s
`analyze()` method (used by the existing, unmodified ephemeral
JD-match flow) was refactored — purely additively, zero behavior
change — to extract its Parse → Match → Optimize → assemble logic into
an exported `computeJdMatchForResume(resume, jd)`. `analyze()` itself
now just calls this function instead of inlining the same steps;
every existing caller of `analyze()` sees byte-identical behavior and
output. `resume-version-service.ts` calls this exact same function
whenever a version is created with a JD or optimized afterward — the
JD parser, keyword/experience/education matcher, ATS engine, and
optimizer are the literal same, unduplicated engines Phase 13 already
built.

`optimized_sections` (jsonb) snapshots `optimizedSummary`/
`optimizedExperience`/`optimizedProjects`/`optimizedSkills`/
`improvementSuggestions` from that pipeline's output — captured once
at the moment of creation/optimization, never silently recomputed on
read.

## 9. Security

- `requireUserId()` (`src/lib/ai/resume-versions/resume-version-auth.ts`)
  is the only identity source for every route — a real Supabase
  session, never a client-supplied `userId`.
- Every service method that reads/writes a specific version
  (`getVersion`, `renameVersion`, `duplicateVersion`, `deleteVersion`,
  `restoreAsMaster`, `applyJdOptimization`, `saveRewrittenSections`)
  routes through `getVersion(userId, versionId)` first, which filters
  by `.eq("id", versionId).eq("user_id", userId)` — a row belonging to
  a different user is indistinguishable from a non-existent one
  (`ResumeVersionNotFoundError`, HTTP 404), never leaking "this exists
  but isn't yours."
- `listVersions(userId)` is always filtered by `user_id` at the query
  level — there is no code path that fetches another user's rows and
  filters them out afterward.
- Tested explicitly (`resume-version-service.test.ts`): User A's
  version is unreachable and invisible to User B, both by direct id
  and via listing.

## 10. Version comparison

Purely deterministic (`compareVersions`, no LLM call): ATS/JD-match
score deltas, a `Set`-difference of `matched_skills` for
added/removed, and a JSON-equality check for experience/projects/
summary (comparing the optimized snapshot when present, otherwise the
raw `resume_data`) to flag whether each section actually changed.
Every number/list shown is read directly from the two already-stored
rows — nothing is recomputed or invented for the comparison itself.

## 11. Restore behavior

`restoreAsMaster` never deletes the outgoing master — it flips
`is_master` to `false` on it (leaving `is_archived` unchanged, so it
stays a fully visible, ordinary version in history) and `is_master`
to `true` on the target, in that order. This is two separate `UPDATE`
statements, not a single database transaction — this project's
Supabase REST access has no multi-statement transaction primitive
(the same constraint `interview-import`'s own compensating-rollback
design documents). The `resume_versions_one_master_per_user` partial
unique index is what actually guarantees at most one master is ever
readable, even across that two-step window.

## 12. Testing performed

**Automated** (`resume-version-service.test.ts`, 13 tests, using the
same filter-aware Supabase mock introduced in the analytics package):
master bootstrapping, cloning-without-mutating-the-source, JD-driven
creation storing the pipeline's real output, the "no source resolves"
error case, ownership isolation (both `getVersion` and `listVersions`),
master-protection on delete/optimize/rewrite, duplicate independence,
restore-as-master demoting (not archiving) the previous master, and
deterministic comparison math.

**Manual walkthrough** (reasoned through against the implementation,
not executed against a live deployment — no Supabase credentials in
this sandbox, consistent with every prior Phase 14 milestone's
limitation): upload → analyze → Save to My Versions (bootstraps
master) → Create Version with a JD → confirm master's own row is
unchanged → duplicate → rename duplicate → compare → delete duplicate
→ restore a version as master → confirm the old master is demoted, not
gone → refresh (versions are real Postgres rows, so they persist) →
confirm cross-user isolation via the automated tests above → download
a version and confirm the URL/content is that version's own id, never
another one's.

## 13. Files added

```
supabase/migrations/20260810000000_add_resume_versions.sql

src/lib/ai/resume-versions/
  resume-version-schema.ts
  resume-version-types.ts
  resume-version-service.ts
  resume-version-service.test.ts
  resume-version-auth.ts
  index.ts

src/app/api/ai/resume/versions/route.ts
src/app/api/ai/resume/versions/[id]/route.ts
src/app/api/ai/resume/versions/[id]/duplicate/route.ts
src/app/api/ai/resume/versions/[id]/restore/route.ts
src/app/api/ai/resume/versions/[id]/optimize/route.ts
src/app/api/ai/resume/versions/[id]/rewrite/route.ts
src/app/api/ai/resume/versions/[id]/export/route.ts
src/app/api/ai/resume/versions/compare/route.ts

src/app/(site)/resume-analyzer/versions/page.tsx
src/app/(site)/resume-analyzer/versions/[id]/page.tsx
src/components/resume/versions/VersionsList.tsx
src/components/resume/versions/VersionDetail.tsx
```

## 14. Files modified

```
src/lib/ai/job-description/jd-service.ts   Additive-only refactor: extracted
                                            computeJdMatchForResume() from
                                            analyze()'s body. analyze()'s own
                                            behavior, logs, and output are
                                            byte-identical to before.
src/app/(site)/resume-analyzer/page.tsx    +1 button ("Save to My Versions"),
                                            nothing else changed.
vitest.config.mts                          Added src/lib/ai/resume-versions
                                            to the test glob.
```

## 15. Files intentionally untouched

`resume-service.ts`, `resume-parser.ts`, `resume-analyzer.ts`,
`resume-score.ts`, `resume-suggestions.ts` (Phase 12); `jd-parser.ts`,
`jd-matcher.ts`, `ats-engine.ts`, `optimizer.ts`, `resume-optimizer.ts`
(Phase 13 M1/M2/M4); `rewrite-service.ts` and every `*-rewriter.ts`
file (Phase 13 M5); `rag_documents`/`rag_document_chunks`;
`ConversationService`/`Agent`/`GraphState`/LangGraph/Planner/
`PortfolioChain`. Nothing in this milestone required touching any of
them — Resume Versioning is a snapshot/persistence layer on top of
their already-computed outputs, not a redesign of any of them.

## 16. Limitations

- **No live verification against a real Supabase project** — this
  sandbox has no live credentials or seeded data (the same limitation
  every Phase 14 milestone this session has had).
- **No free-text "Edit" UI for resume content** — `PATCH` supports
  renaming and target-role/company/location metadata, but there is no
  rich form for editing the resume's actual summary/experience/skills
  text directly on a version. This was a deliberate scope reduction
  ("smallest compatible solution") — a full resume content editor is a
  substantial, separate UI undertaking. "Optimize for JD" and "save a
  rewrite" remain the two ways version content actually changes today.
- **`version_number` has no database-level uniqueness constraint** —
  computed as max+1 at insert time; under truly concurrent requests
  from the same user (two browser tabs creating a version
  simultaneously) two versions could theoretically compute the same
  number. This has no correctness impact (it's a display-order hint,
  not a primary key, and `created_at` is the real tiebreaker), and is
  extremely unlikely for a single user's own UI actions, but is not
  race-proof the way the master-uniqueness index is.
- **`restoreAsMaster` is two non-transactional statements** — see §11;
  the partial unique index prevents an inconsistent *end state*, but a
  request that fails between the two `UPDATE`s could theoretically
  leave a user with zero active masters until they retry. No
  compensating rollback was added for this narrow window, matching
  this project's existing "two-step app-level consistency, not a real
  transaction" precedent elsewhere (`interview-import`).
- **Downloaded exports reuse the JD-match export's flat bullet-list
  renderer** (experience/project bullets are not regrouped under their
  original employer/dates) — an existing, documented simplification in
  that renderer, inherited unchanged rather than fixed here.

## 17. Future extensions

- A rich, in-place resume content editor for direct master/version
  edits beyond metadata.
- Per-feature usage-analytics integration (Phase 14 M5/M6) for
  "versions created," if that becomes a product priority.
- A real Postgres transaction (RPC function) for `restoreAsMaster`,
  matching the same future-extension path already documented for
  Phase 14 Milestone 4's credit reservation functions.
