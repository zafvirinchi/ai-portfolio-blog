-- Phase 13 — Milestone 14: Enterprise Resume Template Designer
--
-- One additive, nullable JSONB column on the existing resume_versions
-- table, holding presentation-only settings (templateId, accentColor,
-- fontFamily, fontSize, spacing, atsMode, pageLength) — deliberately a
-- SIBLING of sections_data, never merged into it, since the milestone's
-- own architecture rule is that resume DATA (sections_data) must stay
-- template-independent. See src/lib/ai/resume-versions/templates/
-- template-schema.ts's templateSettingsSchema for the exact shape.
--
-- Null until the user opens the Template tab and either explicitly
-- picks a template or changes any design control — resolved to
-- DEFAULT_TEMPLATE_SETTINGS at read time when null (the same lazy-
-- default pattern sections_data already established for
-- toDynamicResumeDocument()), so no backfill is required and no
-- existing resume version is affected by adding this column.
--
-- This repo has no migration tooling — run this file manually once in
-- the Supabase SQL Editor. Safe to re-run (if-not-exists).

alter table resume_versions add column if not exists template_settings jsonb;

comment on column resume_versions.template_settings is
  'Presentation-only settings for this version (templateId, accentColor, fontFamily, fontSize, spacing, atsMode, pageLength) — see templates/template-schema.ts. Null means "use DEFAULT_TEMPLATE_SETTINGS", resolved lazily at read time. Never contains resume content and is never read by the ATS/JD-matching/rewrite engines.';
