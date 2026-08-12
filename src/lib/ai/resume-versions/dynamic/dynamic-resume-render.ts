import { CustomField, DynamicResumeDocument, FieldValue, ResumeEntry, ResumeSection, SectionSettings } from "./dynamic-resume-schema";
import { getSectionDefinition } from "./section-registry";

// The ONE place "is this field actually renderable" is decided — the
// React live preview, the PDF renderer, and the DOCX renderer all call
// this same function, so "hidden section stays hidden" / "empty field
// never shows a bare label" / "explicitly-hidden field stays hidden"
// can never drift between the 3 output paths.

export function isFieldEmpty(value: FieldValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0 || value.every((item) => item.trim().length === 0);
  return false; // booleans are never "empty" — false is a real, renderable value (e.g. "Current: No" is simply omitted by the field itself, not by emptiness)
}

export interface RenderableField {
  key: string;
  label: string;
  value: FieldValue;
}

export interface RenderableEntry {
  id: string;
  fields: RenderableField[];
  customFields: CustomField[];
}

export interface RenderableSection {
  id: string;
  type: ResumeSection["type"];
  title: string;
  custom: boolean;
  settings: SectionSettings;
  entries: RenderableEntry[];
}

/** A field renders only when it has a real value AND the user hasn't explicitly hidden it — the two independent conditions the milestone calls out (empty-omission vs. explicit visibility) are both enforced here, in one place. A boolean field renders only when true ("Current" is a marker to show, not a "Current: No" line to print). */
function renderableFieldsFor(entry: ResumeEntry, sectionType: ResumeSection["type"]): RenderableField[] {
  const definition = getSectionDefinition(sectionType);

  return definition.entryFields
    .filter((field) => !entry.hiddenFieldKeys.includes(field.key))
    .filter((field) => {
      const value = entry.fields[field.key];
      if (typeof value === "boolean") return value === true;
      return !isFieldEmpty(value);
    })
    .map((field) => ({ key: field.key, label: field.label, value: entry.fields[field.key] as FieldValue }));
}

function renderableEntry(entry: ResumeEntry, sectionType: ResumeSection["type"]): RenderableEntry | null {
  if (!entry.visible) return null;

  const fields = renderableFieldsFor(entry, sectionType);
  const customFields = entry.customFields.filter((field) => field.visible && field.value.trim().length > 0).sort((a, b) => a.order - b.order);

  if (fields.length === 0 && customFields.length === 0) return null;

  return { id: entry.id, fields, customFields };
}

/**
 * The full "what should actually be shown" pipeline: visible sections
 * only, sorted by order, each with its visible/non-empty entries only
 * (sorted by order), each with its visible/non-empty fields only. A
 * section with zero renderable entries after this filtering is
 * dropped entirely — never an empty section heading with nothing
 * under it.
 */
export function prepareForRender(document: DynamicResumeDocument): RenderableSection[] {
  return document.sections
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const entries = [...section.entries]
        .sort((a, b) => a.order - b.order)
        .map((entry) => renderableEntry(entry, section.type))
        .filter((entry): entry is RenderableEntry => entry !== null);

      return { id: section.id, type: section.type, title: section.title, custom: section.custom, settings: section.settings, entries };
    })
    .filter((section) => section.entries.length > 0);
}

/** Turns a field's typed value into plain display text — the one place every renderer (React preview, PDF, DOCX) converts a FieldValue for output, so a list/boolean can never be stringified two different ways in two different renderers. */
export function formatFieldValue(field: RenderableField): string {
  if (typeof field.value === "boolean") return field.label; // already filtered to true-only by renderableFieldsFor
  if (Array.isArray(field.value)) return field.value.join(", ");
  return field.value ?? ""; // renderableFieldsFor already excludes null via isFieldEmpty — this satisfies the type only
}

export interface RenderableLine {
  label: string;
  value: string;
}

export interface EntryPresentation {
  heading: RenderableLine | null;
  lines: RenderableLine[];
}

/**
 * The one place every renderer (React preview, PDF, DOCX, Markdown)
 * decides "what's this entry's heading, and what's its body" — needed
 * because a CUSTOM section's entries have zero registry fields
 * (section-registry.ts's CUSTOM definition is intentionally empty) and
 * consist purely of custom fields, but should still render with a
 * clear heading line rather than a flat, label-prefixed field dump
 * (the milestone's own "Custom sections must render professionally"
 * requirement). When registry fields exist, the first one is the
 * heading exactly as before this milestone (job title, degree,
 * project name, ...); when they don't, the first custom field (in the
 * user's own ordering) takes over as the heading instead.
 */
export function getEntryPresentation(entry: RenderableEntry): EntryPresentation {
  if (entry.fields.length > 0) {
    const [heading, ...rest] = entry.fields;
    return {
      heading: { label: heading.label, value: formatFieldValue(heading) },
      lines: [...rest.map((field) => ({ label: field.label, value: formatFieldValue(field) })), ...entry.customFields.map((field) => ({ label: field.label, value: field.value }))],
    };
  }

  if (entry.customFields.length > 0) {
    const [heading, ...rest] = entry.customFields;
    return {
      heading: { label: heading.label, value: heading.value },
      lines: rest.map((field) => ({ label: field.label, value: field.value })),
    };
  }

  return { heading: null, lines: [] };
}
