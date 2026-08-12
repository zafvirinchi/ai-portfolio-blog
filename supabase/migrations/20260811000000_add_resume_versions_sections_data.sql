-- Phase 13 — Dynamic Resume Sections, Fields & Entries
--
-- One additive, nullable column on the existing resume_versions table
-- (Phase 13 Resume Versioning) — the new dynamic, section-based resume
-- document (DynamicResumeDocument: personalInformation + sections[],
-- each with entries[]/fields{}/customFields[]) is stored here as a
-- single JSONB blob, exactly the same pattern resume_data/
-- optimized_sections/rewritten_sections on this table already use.
--
-- Deliberately NOT a set of new relational tables (sections table,
-- entries table, fields table) — "prefer extending the existing
-- JSONB structure over introducing multiple relational tables" per
-- this milestone's own instruction, and every existing row's
-- resume_data/optimized_sections/rewritten_sections columns are
-- completely unaffected: this column is read lazily (a null value is
-- migrated to a DynamicResumeDocument at runtime by
-- resume-migration.ts's toDynamicResumeDocument(), never by mutating
-- old rows), so no backfill is required and no existing resume version
-- can be corrupted by adding this column.
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor. Safe to re-run (if-not-exists).

alter table resume_versions add column if not exists sections_data jsonb;

comment on column resume_versions.sections_data is
  'The dynamic, section-based resume document (DynamicResumeDocument — schemaVersion, personalInformation, sections[]) for this version. Null until the user (or an AI-driven merge) first edits/saves it, at which point it becomes this version''s source of truth for the builder UI, live preview, and dynamic export; resume_data/optimized_sections/rewritten_sections remain unchanged and are still what JD-matching/optimization/ATS scoring read.';
