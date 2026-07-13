# Phase 6 — Knowledge Ingestion Pipeline

## Goal

Let an administrator upload a document (PDF, DOCX, TXT, or Markdown) and
have it become searchable through the existing RAG stack automatically —
without touching retrieval, the graph, the agent, or the database schema.

This phase adds a standalone ingestion library. It does **not** add an
upload UI or API route yet; it adds the `KnowledgeIngestionService` that a
future upload route/UI will call.

## Package layout

New package: `src/lib/ai/ingestion/`.

```
document-loader.ts   Detects format from filename, wraps bytes into a LoadedDocument
document-parser.ts   Extracts raw text per format (pdf-parse, mammoth, gray-matter, utf-8) + normalizeText()
chunker.ts           Configurable chunking (size/overlap) via @langchain/textsplitters, attaches per-chunk metadata
embedding-service.ts Wraps the existing OpenAI embedding client, adds batched embedding for many chunks
knowledge-writer.ts  Writes into the existing rag_documents / rag_document_chunks tables — no schema changes
pipeline.ts          KnowledgeIngestionService.ingest(file) — orchestrates the whole pipeline, returns a result object
```

## Pipeline

```
Upload -> Extract -> Normalize -> Chunk -> Embedding -> Store -> Done
```

1. **Upload** — `document-loader.ts`'s `loadDocument()` takes a filename +
   `Buffer` (+ optional mime type), rejects empty files, and detects the
   format from the file extension (`pdf` / `docx` / `txt` / `md`/`markdown`),
   throwing `UnsupportedDocumentFormatError` for anything else. A
   `fromWebFile(file: File)` helper is included so a future Next.js route
   handler can convert a `request.formData()` file straight into the
   `Buffer`-based shape this pipeline works with, without the pipeline
   itself depending on the Web `File` API.
2. **Extract** — `document-parser.ts`'s `parseDocument()` dispatches on the
   detected format to a format-appropriate library:
   - **PDF** — [`pdf-parse`](https://www.npmjs.com/package/pdf-parse) v2
     (`PDFParse` class, pdf.js-based), `getText()` → concatenated text.
   - **DOCX** — [`mammoth`](https://www.npmjs.com/package/mammoth)'s
     `extractRawText({ buffer })`.
   - **Markdown** — the already-installed `gray-matter`, which strips
     frontmatter (`---\ntitle: ...\n---`) and returns it separately so it
     can be merged into chunk metadata instead of being embedded as text.
   - **TXT** — plain `buffer.toString("utf-8")`.
3. **Normalize** — `normalizeText()` (also in `document-parser.ts`)
   collapses CRLF line endings, strips null bytes (a common PDF-extraction
   artifact), collapses repeated spaces/tabs, and collapses 3+ blank lines
   down to one, then trims. This runs before chunking so chunk boundaries
   aren't skewed by extraction noise.
4. **Chunk** — `chunker.ts`'s `chunkDocument()` wraps
   `@langchain/textsplitters`'s `RecursiveCharacterTextSplitter` (already an
   installed dependency, previously unused — the old manual RAG-document
   route used a naive fixed-size character slicer). Each chunk gets a
   `ChunkMetadata` object: `documentTitle`, `sourceFilename`, `chunkIndex`,
   `charCount`, plus any caller-supplied `metadata` (e.g. markdown
   frontmatter) merged in.
5. **Embedding** — `embedding-service.ts`'s `EmbeddingService`:
   - `embed(text)` delegates to the existing `createEmbedding()` in
     `src/lib/ai/embeddings.ts` (same OpenAI client, same
     `text-embedding-3-small` model already used by the manual RAG-document
     route and by `retrieval.ts` at query time).
   - `embedBatch(texts)` is new: it calls `openai.embeddings.create()` with
     an **array** `input` (OpenAI's embeddings endpoint supports batching
     natively), chunked into groups of 100 to stay well under request
     limits, instead of one HTTP round trip per chunk like the old route.
6. **Store** — `knowledge-writer.ts`'s `KnowledgeWriter` writes into the
   **existing, unmodified** Supabase tables (see below). Nothing is written
   until chunking and embedding have both succeeded in memory — so a failed
   ingestion never leaves a `rag_documents` row with zero chunks behind.
7. **Done** — `pipeline.ts`'s `KnowledgeIngestionService.ingest(file)`
   returns an `IngestionResult`.

## Configuration: chunk size, overlap, metadata

```ts
interface ChunkerConfig {
  chunkSize: number;    // default 1000
  chunkOverlap: number; // default 150
}
```

`chunkDocument()` validates that `chunkOverlap` is `>= 0` and strictly less
than `chunkSize`, throwing otherwise. `KnowledgeIngestionService.ingest()`
accepts optional `chunkSize` / `chunkOverlap` per call, falling back to
`DEFAULT_CHUNKER_CONFIG` (1000 / 150 — matching the values the old manual
RAG-document route used, so retrieval quality doesn't shift for existing
content). Callers may also pass a `metadata` object that's merged onto
every chunk's `ChunkMetadata`.

## Storage: reusing the existing schema

No migrations were written and no table was altered. The live Supabase
schema (introspected via the PostgREST OpenAPI endpoint, not guessed) is:

**`rag_documents`**
| column | type | notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `title` | `text` | required |
| `document_type` | `text` | required; ingestion defaults to `"upload"` |
| `source_ref` | `text` | nullable; ingestion defaults to the original filename |
| `content` | `text` | required; the full normalized document text |
| `created_at` | `timestamp` | default `now()` |

**`rag_document_chunks`**
| column | type | notes |
|---|---|---|
| `id` | `uuid` | PK |
| `document_id` | `uuid` | FK → `rag_documents.id` |
| `chunk_text` | `text` | required |
| `embedding` | `vector(1536)` | matches `text-embedding-3-small` |
| `chunk_index` | `integer` | required |
| `created_at` | `timestamp` | default `now()` |

These are exactly the tables/columns the existing manual RAG-document form
(`POST /api/admin/rag-documents`) already writes to, and exactly what
`searchRagContext()` (`src/lib/ai/retrieval.ts`) reads from via the
`match_rag_chunks` RPC. Ingested documents are retrievable through the
existing RAG tool with **zero changes** to retrieval, the graph, or the
agent.

**Known limitation:** `rag_document_chunks` has no `metadata` column today
(the `RagChunk.metadata` TypeScript field exists but isn't backed by a real
column — it was already unused by the pre-existing write path). Per-chunk
metadata computed in `chunker.ts` therefore stays in-memory only; it isn't
persisted per chunk. Document-level context (original filename) is instead
captured in `rag_documents.source_ref`, which *is* a real column. See
"Future" below for what adding real chunk-level metadata would need.

## `KnowledgeIngestionService`

```ts
const result = await knowledgeIngestionService.ingest({
  filename: "resume.pdf",
  buffer,                    // Buffer — use fromWebFile() to convert a File
  title: "Zafrul's Resume",  // optional, defaults to filename
  documentType: "resume",    // optional, defaults to "upload"
  sourceRef: "resume-2026",  // optional, defaults to filename
  chunkSize: 800,            // optional
  chunkOverlap: 100,         // optional
  metadata: { tags: ["resume"] }, // optional, merged into chunk metadata
});
```

Returns:

```ts
interface IngestionResult {
  success: boolean;
  documentId: string | null;
  chunkCount: number;
  embeddingCount: number;
  processingTimeMs: number;
  errors: string[];
}
```

On any failure (unsupported format, empty/unextractable file, embedding API
error, Supabase write error), `ingest()` never throws — it catches
internally, collects a human-readable message into `errors`, and returns
`success: false` with `documentId: null`. This mirrors the existing
try/catch-and-degrade pattern used by `PlannerService` and
`searchRagContext()` elsewhere in the codebase.

## What changed vs. what didn't

**Added:** `src/lib/ai/ingestion/{document-loader.ts, document-parser.ts,
chunker.ts, embedding-service.ts, knowledge-writer.ts, pipeline.ts}`.
Two placeholder files from an earlier scaffold (`document-loader.ts`,
`chunker.ts`) were filled in in place; a third empty placeholder
(`embedding.ts`) was removed in favor of `embedding-service.ts` to match
the requested filename and because nothing referenced the old stub.

**New dependencies:** `pdf-parse` (^2.4.5) and `mammoth` (^1.12.0) — no PDF
or DOCX parser existed in the project before this phase.

**Untouched (as required):** `rag_documents` / `rag_document_chunks` table
structures, `match_rag_chunks` RPC, `src/lib/ai/retrieval.ts`,
`src/lib/ai/knowledge/*`, `src/lib/ai/graph/*`, `src/lib/ai/agent/*`,
`src/lib/ai/planner/*`, all UI components, all existing API routes. The
existing manual RAG-document form/route continues to work exactly as
before; it does not call into this new pipeline.

**Not built in this phase (by design):** any upload API route or admin UI.
`fromWebFile()` exists specifically so that work is a thin wrapper around
`ingest()` when it happens.

## Verification

- Manual end-to-end smoke test (temporary script, deleted after use): ran
  `ingest()` against a synthetic Markdown document, a minimal single-page
  PDF, and a real DOCX fixture, against the live Supabase project — all
  three wrote a `rag_documents` row plus the expected number of
  `rag_document_chunks` rows with 1536-dimension embeddings, then the test
  rows were deleted. Confirms the schema assumptions above are correct, not
  just plausible.
- `npm run lint` — 0 errors (1 pre-existing, unrelated `<img>` warning in
  `blog/[slug]/page.tsx`, same as Phase 5).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds (exit code 0); all routes compiled
  successfully.

## Future: OCR support

Scanned/image-only PDFs (no embedded text layer) currently extract to an
empty string, which `ingest()` reports as an error
(`"No extractable text found in ..."`) rather than silently storing nothing.
To support them:

- Add an OCR fallback step in `document-parser.ts`: if `parsePdf()` returns
  near-empty text, rasterize each page (`pdf-parse`'s `PDFParse.getImage()`
  / `getScreenshot()` already exposes page rendering) and run OCR over the
  images (e.g. `tesseract.js` for a pure-JS/WASM option with no external
  binary dependency, matching how `pdf-parse`/`mammoth` were chosen here).
- This slots in as an additional branch inside `parseDocument()`'s `"pdf"`
  case — no change needed to `chunker.ts`, `embedding-service.ts`,
  `knowledge-writer.ts`, or `pipeline.ts`, since they only depend on
  `ParsedDocument.text` existing, not on how it was produced.
- OCR is CPU/time-expensive; `pipeline.ts`'s `processingTimeMs` in
  `IngestionResult` already surfaces per-ingestion timing, which is exactly
  the signal a future UI would need to show progress or a "this may take a
  while" notice for scanned documents.

## Future: web crawling support

To ingest a URL instead of an uploaded file:

- Add a `web-loader.ts` alongside `document-loader.ts` that fetches a URL,
  strips HTML down to readable text (e.g. `@mozilla/readability` +
  `jsdom`, or a lighter regex/DOM-free HTML-to-text pass for simple pages),
  and produces the same shape `document-parser.ts` already outputs today —
  `{ text, frontmatter? }` — so it can feed directly into the existing
  `normalizeText()` → `chunkDocument()` → `embeddingService` →
  `knowledgeWriter` stages unchanged.
- `IngestFileInput` in `pipeline.ts` would grow a sibling
  `IngestUrlInput { url: string; ... }`, and `KnowledgeIngestionService`
  would gain an `ingestUrl(input)` method that calls the new web loader
  instead of `loadDocument()`/`parseDocument()`, then rejoins the existing
  pipeline from the Normalize step onward. `source_ref` would naturally
  become the crawled URL instead of a filename — the `rag_documents` schema
  already supports this with no changes.
- Recursive/multi-page crawling (following links up to a depth limit) would
  sit above `ingestUrl()` as a separate orchestration loop, calling
  `ingestUrl()` once per discovered page and aggregating the `IngestionResult`s
  — it would not need to change anything inside the pipeline itself.
