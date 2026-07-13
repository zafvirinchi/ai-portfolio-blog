# Phase 7 — Knowledge Management UI

## Goal

Give administrators a UI to upload, browse, search, preview and delete the
documents that back the AI assistant's knowledge base — without touching
the Graph, Planner, Agent, Retriever, or `PortfolioChain`, and without
duplicating the ingestion logic built in Phase 6.

## What was added

```
src/app/admin/knowledge/page.tsx              Client page — orchestrates all state, calls /api/admin/knowledge
src/app/api/admin/knowledge/route.ts          GET / POST / DELETE — the only new server code
src/components/admin/knowledge/
  KnowledgeStats.tsx            Dashboard cards (5 stats)
  KnowledgeUpload.tsx           File picker + real upload progress + result summary
  KnowledgeSearch.tsx           Debounced search input
  KnowledgeTable.tsx            Document list/browse table
  KnowledgeCard.tsx             Preview modal — shows extracted text
  KnowledgeDeleteDialog.tsx     Delete confirmation modal
src/types/knowledge.ts          Shared types for the API <-> UI contract
```

Two small additive changes for discoverability, matching the existing
pattern used by every other admin section:
- `src/components/admin/AdminSidebar.tsx` — added a "Knowledge Base" nav
  link.
- `src/app/admin/page.tsx` — added a "Knowledge Base" dashboard card.

## Reusing Phase 6 — no duplicated ingestion logic

`POST /api/admin/knowledge` does exactly three things and nothing else:

```ts
const raw = await fromWebFile(file);              // document-loader.ts (Phase 6)
const result = await knowledgeIngestionService     // pipeline.ts (Phase 6)
  .ingest({ ...raw, title, documentType, sourceRef });
// then re-select the written row to return it in the API response shape
```

No parsing, chunking, embedding, or Supabase-writing code was reimplemented.
`fromWebFile()` (added in Phase 6 specifically so a future upload route
could use it) converts the `File` from `request.formData()` into the
`Buffer`-based `RawFileInput` the pipeline already expects.

## API routes

All three methods live in a single route file,
`src/app/api/admin/knowledge/route.ts`, matching the literal `/api/admin/knowledge`
surface requested (no nested `[id]` route).

### `GET /api/admin/knowledge`
- No query params → list mode: returns `{ documents, stats }`.
  - `documents`: up to 200 most-recent `rag_documents` rows (`id`, `title`,
    `document_type`, `source_ref`, `created_at`), each annotated with
    `chunk_count` (computed via a single follow-up query on
    `rag_document_chunks` grouped in memory — not per-row N+1 queries).
  - `stats`: `totalDocuments`, `totalChunks`, `totalEmbeddings` (see note
    below), `latestUploadAt` — all computed with `count: "exact", head: true`
    queries plus one `order().limit(1)` query.
- `?search=<term>` → same shape, filtered with a PostgREST `.or()` across
  `title`, `document_type`, `source_ref`, and `content` (`ilike`). The term
  is sanitized (`,`, `(`, `)`, `%`, `*` stripped) before being interpolated
  into the filter string, since PostgREST's `.or()` syntax is comma-delimited
  and those characters could otherwise break out of it.
- `?id=<uuid>` → single-document detail mode: returns `{ document }`
  including the full `content` (the normalized extracted text) — this is
  what powers the preview card. Returns `404` if not found.

### `POST /api/admin/knowledge`
Accepts `multipart/form-data`: `file` (required), `title`, `documentType`,
`sourceRef` (all optional — same defaults as `KnowledgeIngestionService.ingest()`
from Phase 6: filename as title, `"upload"` as document type). Calls
`fromWebFile()` + `ingest()`, then re-selects the written `rag_documents` row
to return a UI-ready shape. Returns HTTP `422` (not `500`) when ingestion
itself fails validly (e.g. unsupported format, no extractable text) — the
route only 500s on genuinely unexpected errors, matching the distinction
`IngestionResult.success` already draws.

### `DELETE /api/admin/knowledge?id=<uuid>`
Deletes `rag_document_chunks` for that `document_id` **first**, then the
`rag_documents` row — required explicitly by this phase's spec, and correct
regardless of whether the live FK has an `ON DELETE CASCADE` rule (which
wasn't visible via schema introspection), since deleting children first is
always safe.

**No table structures were changed** — same `rag_documents` /
`rag_document_chunks` schema Phase 6 introspected and wrote to.

## Upload flow

`KnowledgeUpload.tsx` implements the exact flow requested:

```
Choose File → Upload → Show progress → KnowledgeIngestionService (server) → Display result
```

Progress is real, not simulated: `fetch()` has no upload-progress event, so
the component uses `XMLHttpRequest` directly and listens to
`xhr.upload.addEventListener("progress", ...)` to drive a percentage bar
while the file is actually being transferred.

On success it displays exactly what was requested: filename/title, document
type, upload time, chunk count, embedding count, and processing time (all
taken straight from the `IngestionResult` + re-selected document row the API
returns — nothing is recomputed client-side).

## Search

`KnowledgeSearch.tsx` is a debounced (300ms) controlled input; the page
re-fetches `GET /api/admin/knowledge?search=...` whenever the debounced term
changes. Matches against title, document type, source reference, and full
extracted content server-side.

## Preview

`KnowledgeCard.tsx` is a modal opened from a table row's "Preview" button.
It fetches `GET /api/admin/knowledge?id=<id>` on open and renders the full
`content` field (the normalized extracted text produced by Phase 6's
`document-parser.ts`) in a scrollable `<pre>` block, alongside type, source,
chunk count, and upload time.

## Delete

`KnowledgeDeleteDialog.tsx` is a real confirmation modal (not
`window.confirm()`, since this phase asked for a dedicated dialog
component) showing the title and chunk count about to be removed. Confirming
calls `DELETE /api/admin/knowledge?id=<id>`, which removes both
`rag_document_chunks` and the `rag_documents` row; the page then refetches
the list and closes the preview card if the deleted document was open in it.

## Dashboard stats

`KnowledgeStats.tsx` renders five cards:

| Stat | Source |
|---|---|
| Total Documents | `count(rag_documents)` |
| Total Chunks | `count(rag_document_chunks)` |
| Total Embeddings | Same value as Total Chunks (see note below) |
| Latest Upload | `max(rag_documents.created_at)` |
| Avg. Processing Time | Session-only, see note below |

**Note — Total Embeddings vs. Total Chunks:** `knowledge-writer.ts` (Phase 6)
always writes a populated `embedding` column together with `chunk_text` in
the same insert — there is no row with a chunk but no embedding in this
schema — so "Total Embeddings" is definitionally equal to "Total Chunks".
It's still surfaced as its own stat because the requirement asked for it
explicitly and it's a meaningful independent signal to an admin (confirms
embeddings aren't silently missing), even though today it can never diverge
from the chunk count.

**Note — Average Processing Time is session-scoped, not historical:**
`processingTimeMs` is part of `IngestionResult` (Phase 6) but is **not**
persisted anywhere — `rag_documents` has no such column, and this phase
(like Phase 6) does not alter table structures. So the average shown is
computed client-side from only the uploads completed in the current browser
session (`page.tsx` accumulates `result.processingTimeMs` per successful
upload in React state) and is labeled "Uploads this session" in the UI. It
reads "—" until at least one upload has happened. See "Future" below for
what persisting this properly would require.

## What changed vs. what didn't

**Added:** `app/admin/knowledge/page.tsx`, `api/admin/knowledge/route.ts`,
`components/admin/knowledge/*` (6 components), `types/knowledge.ts`.

**Modified (additive only):** `AdminSidebar.tsx` (+1 nav link),
`admin/page.tsx` (+1 dashboard card) — both purely additive, no existing
entries changed.

**Untouched (as required):** `src/lib/ai/graph/*`, `src/lib/ai/planner/*`,
`src/lib/ai/agent/*`, `src/lib/ai/retrieval.ts`, `src/lib/ai/chains/*`
(`PortfolioChain`), and every file inside `src/lib/ai/ingestion/` from Phase
6 — this phase only *calls* `knowledgeIngestionService.ingest()` and
`fromWebFile()`, it doesn't modify either.

## Verification

- Manual end-to-end smoke test (temporary script, deleted after use): called
  the route handlers' exported `GET`/`POST`/`DELETE` functions directly
  against the live Supabase project with a real `multipart/form-data`
  upload — asserted the upload succeeds and returns a document + correct
  chunk/embedding counts, the new document appears in the unfiltered list
  and in a search filtered by a unique marker string, the detail/preview
  endpoint returns the extracted text and matching `chunk_count`, delete
  succeeds, and the document then 404s. All assertions passed; the test row
  was deleted as part of the test itself, so no test data was left behind.
- `npm run lint` — 0 errors (1 pre-existing, unrelated `<img>` warning,
  unchanged since Phase 5/6).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds (exit code 0); `/admin/knowledge` and
  `/api/admin/knowledge` both compiled and are listed as dynamic routes
  alongside every other admin route.

## Future: persisting real processing-time history

To make "Average Processing Time" reflect all-time data instead of just the
current session, without touching `rag_documents`/`rag_document_chunks`:
add a new, separate `knowledge_ingestion_runs` table (`document_id`,
`chunk_count`, `embedding_count`, `processing_time_ms`, `created_at`) and
have `knowledge-writer.ts` insert one row per successful `ingest()` call.
This is additive — a new table, not a change to the two existing ones — so
it wouldn't violate the "don't change table structures" constraint that
governs `rag_documents`/`rag_document_chunks` specifically. `GET
/api/admin/knowledge`'s stats block would then average over that table
instead of client-side session state, and the UI wouldn't need any changes
beyond removing the "this session" caveat.

## Future: pagination

The list endpoint currently caps at 200 documents with no pagination
controls, which is fine at the current scale but would need `?page=`/`?limit=`
params plus corresponding `KnowledgeTable` UI once the knowledge base grows
past that.
