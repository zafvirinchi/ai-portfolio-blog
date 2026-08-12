import { randomUUID } from "node:crypto";

import { CustomField, DynamicPersonalInformation, DynamicResumeDocument, FieldValue, ResumeEntry, ResumeSection, SectionType } from "./dynamic-resume-schema";
import { getSectionDefinition } from "./section-registry";

// A client can only ever set values for fields the section-registry
// actually declares — this is Phase 15 Milestone 2's "the server must
// not blindly merge arbitrary client properties into Resume JSON"
// requirement. Unlike the entryFields *rendering* hint the registry's
// own doc comment describes, this check IS the validation whitelist:
// a would-be `{"fields":{"maliciousField":"..."}}` payload is rejected
// here, before it can ever reach storage/rendering/export. Ad-hoc,
// user-named fields remain fully supported — that's what the separate
// `customFields` array (with its own id/label/value/order) is for.

export class UnknownFieldError extends Error {
  constructor(sectionType: SectionType, key: string) {
    super(`"${key}" is not a supported field on a ${getSectionDefinition(sectionType).label} entry.`);
    this.name = "UnknownFieldError";
  }
}

export class InvalidFieldValueError extends Error {
  constructor(key: string, reason: string) {
    super(`"${key}" ${reason}`);
    this.name = "InvalidFieldValueError";
  }
}

/**
 * Phase 15 Milestone 3 — a reorder payload must contain each existing
 * id EXACTLY once: not missing, not duplicated, not referencing an id
 * that doesn't belong to this document/section. A payload with a
 * duplicate (e.g. `[A, A, B]` on a 3-section document) previously
 * passed the length+membership check below undetected, silently
 * cloning A and dropping the third section entirely from the saved
 * document — this error closes that hole.
 */
export class InvalidOrderError extends Error {
  constructor(reason: string) {
    super(`Invalid reorder request: ${reason}`);
    this.name = "InvalidOrderError";
  }
}

/** Shared by reorderSections/reorderEntries — `orderedIds` must be exactly one permutation of `existingIds`: same length, no duplicates, no unknown/missing id. */
function validateOrderIds(orderedIds: string[], existingIds: string[]): void {
  if (orderedIds.length !== existingIds.length) {
    throw new InvalidOrderError(`expected ${existingIds.length} id(s), received ${orderedIds.length}.`);
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new InvalidOrderError("contains a duplicate id.");
  }
  const existing = new Set(existingIds);
  if (!orderedIds.every((id) => existing.has(id))) {
    throw new InvalidOrderError("contains an id that does not belong to this document.");
  }
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Shared by addEntry/updateEntry — every key in `fields` must be one this section type's registry actually declares, and a "url"-typed field's value (when non-empty) must actually look like a URL. Throws before the document is ever mutated. */
function validateEntryFields(sectionType: SectionType, fields: Record<string, FieldValue>): void {
  const definitionsByKey = new Map(getSectionDefinition(sectionType).entryFields.map((field) => [field.key, field]));

  for (const [key, value] of Object.entries(fields)) {
    const definition = definitionsByKey.get(key);
    if (!definition) throw new UnknownFieldError(sectionType, key);

    if (definition.type === "url" && typeof value === "string" && value.trim().length > 0 && !looksLikeUrl(value.trim())) {
      throw new InvalidFieldValueError(key, "must be a valid http(s) URL.");
    }
  }
}

// Phase 13 — Dynamic Resume Sections. Every function here is pure
// (document in, new document out) and deterministic — no AI call, no
// database access. resume-version-service.ts is the only caller that
// persists the result. Section/entry ids are ALWAYS server-generated
// (randomUUID) here, never accepted from a client request body, so a
// client can only ever reference ids it was already given back.

export class SectionNotFoundError extends Error {
  constructor() {
    super("Resume section not found.");
    this.name = "SectionNotFoundError";
  }
}

export class EntryNotFoundError extends Error {
  constructor() {
    super("Resume entry not found.");
    this.name = "EntryNotFoundError";
  }
}

export class CustomFieldNotFoundError extends Error {
  constructor() {
    super("Custom field not found.");
    this.name = "CustomFieldNotFoundError";
  }
}

/**
 * Phase 15 Milestone 1 — a section-registry type with
 * `supportsMultipleEntries: false` (currently SUMMARY and INTERESTS) is
 * conceptually "one implicit entry" for the whole resume; adding it a
 * second time would just produce two competing summaries/interests
 * blocks with no way for the UI to distinguish which one is canonical.
 * CUSTOM is exempt (a user may always add another named custom
 * section) since it isn't a fixed singleton concept at all.
 */
export class DuplicateSingletonSectionError extends Error {
  constructor(type: SectionType) {
    super(`A "${getSectionDefinition(type).label}" section already exists — only one is allowed.`);
    this.name = "DuplicateSingletonSectionError";
  }
}

function findSection(document: DynamicResumeDocument, sectionId: string): ResumeSection {
  const section = document.sections.find((entry) => entry.id === sectionId);
  if (!section) throw new SectionNotFoundError();
  return section;
}

function replaceSection(document: DynamicResumeDocument, sectionId: string, update: (section: ResumeSection) => ResumeSection): DynamicResumeDocument {
  findSection(document, sectionId); // throws SectionNotFoundError if missing
  return { ...document, sections: document.sections.map((section) => (section.id === sectionId ? update(section) : section)) };
}

// ---------------------------------------------------------------------------
// Personal information
// ---------------------------------------------------------------------------

/** Phase 15 Milestone 2 — personalInformation is a fixed set of top-level document fields (never a section, never addable/removable), so it gets its own small merge-patch function rather than being forced through the section/entry machinery above. */
export function updatePersonalInformation(document: DynamicResumeDocument, updates: Partial<DynamicPersonalInformation>): DynamicResumeDocument {
  return { ...document, personalInformation: { ...document.personalInformation, ...updates } };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function addSection(document: DynamicResumeDocument, type: SectionType, title?: string): DynamicResumeDocument {
  const definition = getSectionDefinition(type);

  if (type !== "CUSTOM" && !definition.supportsMultipleEntries && document.sections.some((section) => section.type === type)) {
    throw new DuplicateSingletonSectionError(type);
  }

  const maxOrder = document.sections.reduce((max, section) => Math.max(max, section.order), -1);

  const section: ResumeSection = {
    id: randomUUID(),
    type,
    title: title?.trim() || definition.label,
    order: maxOrder + 1,
    visible: true,
    // Always derived from `type` — never settable independently, so the two can never disagree (see the `custom` field's own doc comment in dynamic-resume-schema.ts).
    custom: type === "CUSTOM",
    entries: [],
    settings: { showTitle: true, showDivider: true },
  };

  return { ...document, sections: [...document.sections, section] };
}

export function updateSection(
  document: DynamicResumeDocument,
  sectionId: string,
  updates: { title?: string; visible?: boolean; settings?: { showTitle?: boolean; showDivider?: boolean } }
): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => ({
    ...section,
    title: updates.title !== undefined ? updates.title.trim() || section.title : section.title,
    visible: updates.visible !== undefined ? updates.visible : section.visible,
    settings: updates.settings ? { ...section.settings, ...updates.settings } : section.settings,
  }));
}

/** Hidden, never physically removed by hideSection — matches updateSection({visible:false}). deleteSection is the actual removal, used by removeSection below. */
export function removeSection(document: DynamicResumeDocument, sectionId: string): DynamicResumeDocument {
  findSection(document, sectionId);
  return { ...document, sections: document.sections.filter((section) => section.id !== sectionId) };
}

/** Re-orders ALL sections to match the given id list exactly (0-based index becomes the new order) — the drag-and-drop "drop" handler sends the full new order in one call rather than pairwise swaps. */
export function reorderSections(document: DynamicResumeDocument, orderedSectionIds: string[]): DynamicResumeDocument {
  validateOrderIds(
    orderedSectionIds,
    document.sections.map((section) => section.id)
  );

  const byId = new Map(document.sections.map((section) => [section.id, section]));
  const sections = orderedSectionIds.map((id, index) => ({ ...byId.get(id)!, order: index }));
  return { ...document, sections };
}

export function moveSectionUp(document: DynamicResumeDocument, sectionId: string): DynamicResumeDocument {
  return moveSection(document, sectionId, -1);
}

export function moveSectionDown(document: DynamicResumeDocument, sectionId: string): DynamicResumeDocument {
  return moveSection(document, sectionId, 1);
}

function moveSection(document: DynamicResumeDocument, sectionId: string, delta: -1 | 1): DynamicResumeDocument {
  const sorted = [...document.sections].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((section) => section.id === sectionId);
  if (index === -1) throw new SectionNotFoundError();

  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= sorted.length) return document; // already at an edge — no-op, not an error

  [sorted[index], sorted[targetIndex]] = [sorted[targetIndex], sorted[index]];
  return reorderSections(document, sorted.map((section) => section.id));
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export function addEntry(document: DynamicResumeDocument, sectionId: string, fields: Record<string, FieldValue> = {}): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => {
    validateEntryFields(section.type, fields);
    const maxOrder = section.entries.reduce((max, entry) => Math.max(max, entry.order), -1);
    const entry: ResumeEntry = { id: randomUUID(), order: maxOrder + 1, visible: true, fields, hiddenFieldKeys: [], customFields: [] };
    return { ...section, entries: [...section.entries, entry] };
  });
}

function findEntry(section: ResumeSection, entryId: string): ResumeEntry {
  const entry = section.entries.find((item) => item.id === entryId);
  if (!entry) throw new EntryNotFoundError();
  return entry;
}

export function updateEntry(
  document: DynamicResumeDocument,
  sectionId: string,
  entryId: string,
  updates: { fields?: Record<string, FieldValue>; visible?: boolean; hiddenFieldKeys?: string[] }
): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => {
    findEntry(section, entryId);
    if (updates.fields) validateEntryFields(section.type, updates.fields);
    return {
      ...section,
      entries: section.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              fields: updates.fields ? { ...entry.fields, ...updates.fields } : entry.fields,
              visible: updates.visible !== undefined ? updates.visible : entry.visible,
              hiddenFieldKeys: updates.hiddenFieldKeys ?? entry.hiddenFieldKeys,
            }
          : entry
      ),
    };
  });
}

export function removeEntry(document: DynamicResumeDocument, sectionId: string, entryId: string): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => {
    findEntry(section, entryId);
    return { ...section, entries: section.entries.filter((entry) => entry.id !== entryId) };
  });
}

export function duplicateEntry(document: DynamicResumeDocument, sectionId: string, entryId: string): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => {
    const source = findEntry(section, entryId);
    const maxOrder = section.entries.reduce((max, entry) => Math.max(max, entry.order), -1);
    const duplicate: ResumeEntry = {
      ...source,
      id: randomUUID(),
      order: maxOrder + 1,
      customFields: source.customFields.map((field) => ({ ...field, id: randomUUID() })),
    };
    return { ...section, entries: [...section.entries, duplicate] };
  });
}

export function reorderEntries(document: DynamicResumeDocument, sectionId: string, orderedEntryIds: string[]): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => {
    validateOrderIds(
      orderedEntryIds,
      section.entries.map((entry) => entry.id)
    );

    const byId = new Map(section.entries.map((entry) => [entry.id, entry]));
    return { ...section, entries: orderedEntryIds.map((id, index) => ({ ...byId.get(id)!, order: index })) };
  });
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

export function addCustomField(document: DynamicResumeDocument, sectionId: string, entryId: string, label: string, value: string): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => {
    const entry = findEntry(section, entryId);
    const maxOrder = entry.customFields.reduce((max, field) => Math.max(max, field.order), -1);
    const customField: CustomField = { id: randomUUID(), label: label.trim(), value, order: maxOrder + 1, visible: true };

    return {
      ...section,
      entries: section.entries.map((item) => (item.id === entryId ? { ...item, customFields: [...item.customFields, customField] } : item)),
    };
  });
}

export function updateCustomField(
  document: DynamicResumeDocument,
  sectionId: string,
  entryId: string,
  fieldId: string,
  updates: { label?: string; value?: string; visible?: boolean }
): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => {
    const entry = findEntry(section, entryId);
    if (!entry.customFields.some((field) => field.id === fieldId)) throw new CustomFieldNotFoundError();

    return {
      ...section,
      entries: section.entries.map((item) =>
        item.id === entryId
          ? {
              ...item,
              customFields: item.customFields.map((field) =>
                field.id === fieldId
                  ? { ...field, label: updates.label?.trim() ?? field.label, value: updates.value ?? field.value, visible: updates.visible ?? field.visible }
                  : field
              ),
            }
          : item
      ),
    };
  });
}

export function removeCustomField(document: DynamicResumeDocument, sectionId: string, entryId: string, fieldId: string): DynamicResumeDocument {
  return replaceSection(document, sectionId, (section) => {
    const entry = findEntry(section, entryId);
    if (!entry.customFields.some((field) => field.id === fieldId)) throw new CustomFieldNotFoundError();

    return {
      ...section,
      entries: section.entries.map((item) => (item.id === entryId ? { ...item, customFields: item.customFields.filter((field) => field.id !== fieldId) } : item)),
    };
  });
}
