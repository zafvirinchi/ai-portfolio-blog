import { describe, expect, it } from "vitest";

import {
  addCustomField,
  addEntry,
  addSection,
  duplicateEntry,
  DuplicateSingletonSectionError,
  EntryNotFoundError,
  InvalidFieldValueError,
  InvalidOrderError,
  moveSectionDown,
  moveSectionUp,
  removeCustomField,
  removeEntry,
  removeSection,
  reorderEntries,
  reorderSections,
  SectionNotFoundError,
  UnknownFieldError,
  updateCustomField,
  updateEntry,
  updatePersonalInformation,
  updateSection,
} from "./dynamic-resume-document-service";
import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION } from "./dynamic-resume-schema";

function emptyDocument(): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: "Jane Doe", headline: null, email: null, phone: null, location: null, linkedin: null, github: null, website: null },
    sections: [],
  };
}

describe("addSection / removeSection / updateSection", () => {
  it("adds a section of any registry type with an incrementing order", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    document = addSection(document, "EDUCATION");

    expect(document.sections).toHaveLength(2);
    expect(document.sections[0].order).toBe(0);
    expect(document.sections[1].order).toBe(1);
    expect(document.sections[1].type).toBe("EDUCATION");
  });

  it("supports a CUSTOM section with a user-provided title", () => {
    const document = addSection(emptyDocument(), "CUSTOM", "Open Source Contributions");
    expect(document.sections[0].title).toBe("Open Source Contributions");
    expect(document.sections[0].type).toBe("CUSTOM");
  });

  it("falls back to the registry label when no title is given", () => {
    const document = addSection(emptyDocument(), "PUBLICATIONS");
    expect(document.sections[0].title).toBe("Publications");
  });

  it("updateSection renames and/or hides without touching entries", () => {
    let document = addSection(emptyDocument(), "AWARDS");
    document = addEntry(document, document.sections[0].id, { title: "Employee of the Year" });

    document = updateSection(document, document.sections[0].id, { title: "Recognition", visible: false });

    expect(document.sections[0].title).toBe("Recognition");
    expect(document.sections[0].visible).toBe(false);
    expect(document.sections[0].entries).toHaveLength(1); // untouched
  });

  it("removeSection deletes it entirely (distinct from hiding)", () => {
    let document = addSection(emptyDocument(), "AWARDS");
    const sectionId = document.sections[0].id;
    document = removeSection(document, sectionId);

    expect(document.sections).toHaveLength(0);
  });

  it("throws SectionNotFoundError for an unknown section id", () => {
    expect(() => updateSection(emptyDocument(), "nonexistent", { title: "x" })).toThrow(SectionNotFoundError);
  });

  it("sets custom:true only for a CUSTOM section, never independently settable", () => {
    let document = addSection(emptyDocument(), "CUSTOM", "Highlights");
    document = addSection(document, "EXPERIENCE");

    expect(document.sections[0].custom).toBe(true);
    expect(document.sections[1].custom).toBe(false);
  });

  it("defaults settings to showTitle/showDivider true, and updateSection can patch just one of them", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    expect(document.sections[0].settings).toEqual({ showTitle: true, showDivider: true });

    document = updateSection(document, document.sections[0].id, { settings: { showDivider: false } });
    expect(document.sections[0].settings).toEqual({ showTitle: true, showDivider: false });
  });

  it("throws DuplicateSingletonSectionError when adding a second SUMMARY section", () => {
    const document = addSection(emptyDocument(), "SUMMARY");
    expect(() => addSection(document, "SUMMARY")).toThrow(DuplicateSingletonSectionError);
    expect(document.sections).toHaveLength(1); // the failed attempt must not mutate/append anything
  });

  it("throws DuplicateSingletonSectionError when adding a second INTERESTS section", () => {
    const document = addSection(emptyDocument(), "INTERESTS");
    expect(() => addSection(document, "INTERESTS")).toThrow(DuplicateSingletonSectionError);
  });

  it("does not throw for a second section of a type that supports multiple entries", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    document = addSection(document, "EXPERIENCE");
    expect(document.sections).toHaveLength(2);
    expect(document.sections.every((section) => section.type === "EXPERIENCE")).toBe(true);
  });

  it("does not throw for a second CUSTOM section, even with the same title", () => {
    let document = addSection(emptyDocument(), "CUSTOM", "Highlights");
    document = addSection(document, "CUSTOM", "Highlights");
    expect(document.sections).toHaveLength(2);
  });
});

describe("reorderSections / moveSectionUp / moveSectionDown", () => {
  it("reorders to match the given id list exactly", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addSection(document, "EXPERIENCE");
    document = addSection(document, "PROJECTS");
    const [summary, experience, projects] = document.sections;

    document = reorderSections(document, [projects.id, summary.id, experience.id]);

    const byOrder = [...document.sections].sort((a, b) => a.order - b.order);
    expect(byOrder.map((s) => s.type)).toEqual(["PROJECTS", "SUMMARY", "EXPERIENCE"]);
  });

  it("rejects a reorder list that doesn't contain every existing section", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addSection(document, "EXPERIENCE");

    expect(() => reorderSections(document, [document.sections[0].id])).toThrow(InvalidOrderError);
  });

  it("rejects a reorder list containing a duplicate id, without silently dropping the third section (regression)", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addSection(document, "EXPERIENCE");
    document = addSection(document, "PROJECTS");
    const [summary, , projects] = document.sections;
    const snapshot = JSON.parse(JSON.stringify(document));

    // "summary" appears twice; "experience" is missing entirely — this used
    // to pass the old length+membership check and silently clone summary
    // while dropping experience from the saved document.
    expect(() => reorderSections(document, [summary.id, summary.id, projects.id])).toThrow(InvalidOrderError);
    expect(document).toEqual(snapshot); // untouched — no partial/corrupted order persisted
  });

  it("rejects a reorder list referencing an id that doesn't belong to this document", () => {
    const document = addSection(emptyDocument(), "SUMMARY");
    expect(() => reorderSections(document, ["some-other-documents-section-id"])).toThrow(InvalidOrderError);
  });

  it("reorders first-to-last and last-to-first correctly", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addSection(document, "EXPERIENCE");
    document = addSection(document, "PROJECTS");
    const [summary, experience, projects] = document.sections;

    // Move the first section to last.
    document = reorderSections(document, [experience.id, projects.id, summary.id]);
    let byOrder = [...document.sections].sort((a, b) => a.order - b.order);
    expect(byOrder.map((s) => s.id)).toEqual([experience.id, projects.id, summary.id]);

    // Move the last section to first.
    document = reorderSections(document, [summary.id, experience.id, projects.id]);
    byOrder = [...document.sections].sort((a, b) => a.order - b.order);
    expect(byOrder.map((s) => s.id)).toEqual([summary.id, experience.id, projects.id]);
  });

  it("reordering a single-section document is a valid no-op, not an error", () => {
    const document = addSection(emptyDocument(), "SUMMARY");
    const reordered = reorderSections(document, [document.sections[0].id]);
    expect(reordered.sections[0].order).toBe(0);
  });

  it("a CUSTOM section participates in reordering exactly like a built-in type", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    document = addSection(document, "CUSTOM", "Highlights");
    const [experience, custom] = document.sections;

    document = reorderSections(document, [custom.id, experience.id]);
    const byOrder = [...document.sections].sort((a, b) => a.order - b.order);
    expect(byOrder.map((s) => s.id)).toEqual([custom.id, experience.id]);
  });

  it("reordering preserves a hidden section's visibility — hidden never becomes deleted", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addSection(document, "EXPERIENCE");
    document = updateSection(document, document.sections[1].id, { visible: false }); // hide EXPERIENCE
    const [summary, experience] = document.sections;

    document = reorderSections(document, [experience.id, summary.id]);
    expect(document.sections).toHaveLength(2);
    expect(document.sections.find((s) => s.id === experience.id)?.visible).toBe(false);
  });

  it("moveSectionUp/Down swaps with the neighbor and no-ops at an edge", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addSection(document, "EXPERIENCE");
    const [summary, experience] = document.sections;

    document = moveSectionDown(document, summary.id);
    const byOrder = [...document.sections].sort((a, b) => a.order - b.order);
    expect(byOrder.map((s) => s.id)).toEqual([experience.id, summary.id]);

    // Already at the top — moving up again is a no-op, not an error.
    const before = document;
    document = moveSectionUp(document, experience.id);
    expect(document).toEqual(before);
  });
});

describe("addEntry / updateEntry / removeEntry / duplicateEntry", () => {
  it("adds entries with no fixed maximum, in order", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;

    document = addEntry(document, sectionId, { company: "Company A" });
    document = addEntry(document, sectionId, { company: "Company B" });
    document = addEntry(document, sectionId, { company: "Company C" });

    expect(document.sections[0].entries).toHaveLength(3);
    expect(document.sections[0].entries.map((e) => e.order)).toEqual([0, 1, 2]);
  });

  it("updateEntry merges field updates without discarding untouched fields", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { company: "Acme", jobTitle: "Engineer" });
    const entryId = document.sections[0].entries[0].id;

    document = updateEntry(document, sectionId, entryId, { fields: { jobTitle: "Senior Engineer" } });

    const entry = document.sections[0].entries[0];
    expect(entry.fields.company).toBe("Acme");
    expect(entry.fields.jobTitle).toBe("Senior Engineer");
  });

  it("updateEntry can hide a field independent of its value", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { location: "Dubai, UAE" });
    const entryId = document.sections[0].entries[0].id;

    document = updateEntry(document, sectionId, entryId, { hiddenFieldKeys: ["location"] });

    expect(document.sections[0].entries[0].hiddenFieldKeys).toEqual(["location"]);
    expect(document.sections[0].entries[0].fields.location).toBe("Dubai, UAE"); // value itself is preserved, only hidden from rendering
  });

  it("removeEntry deletes exactly that entry, leaving others intact", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { company: "A" });
    document = addEntry(document, sectionId, { company: "B" });
    const [first, second] = document.sections[0].entries;

    document = removeEntry(document, sectionId, first.id);

    expect(document.sections[0].entries).toHaveLength(1);
    expect(document.sections[0].entries[0].id).toBe(second.id);
  });

  it("duplicateEntry creates an independent copy with a new id", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { company: "Acme" });
    const original = document.sections[0].entries[0];

    document = duplicateEntry(document, sectionId, original.id);

    expect(document.sections[0].entries).toHaveLength(2);
    const duplicate = document.sections[0].entries[1];
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.fields.company).toBe("Acme");

    // Editing the duplicate must never affect the original.
    document = updateEntry(document, sectionId, duplicate.id, { fields: { company: "Beta" } });
    expect(document.sections[0].entries[0].fields.company).toBe("Acme");
  });

  it("throws EntryNotFoundError for an unknown entry id", () => {
    const document = addSection(emptyDocument(), "EXPERIENCE");
    expect(() => removeEntry(document, document.sections[0].id, "nonexistent")).toThrow(EntryNotFoundError);
  });
});

describe("reorderEntries", () => {
  it("the generated resume follows exactly the persisted order, never auto-sorted", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { company: "Company A" });
    document = addEntry(document, sectionId, { company: "Company B" });
    document = addEntry(document, sectionId, { company: "Company C" });
    const [a, b, c] = document.sections[0].entries;

    document = reorderEntries(document, sectionId, [c.id, a.id, b.id]);

    const byOrder = [...document.sections[0].entries].sort((x, y) => x.order - y.order);
    expect(byOrder.map((e) => e.fields.company)).toEqual(["Company C", "Company A", "Company B"]);
  });

  it("rejects an order list with a duplicate entry id, without corrupting the section (regression)", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { company: "Company A" });
    document = addEntry(document, sectionId, { company: "Company B" });
    document = addEntry(document, sectionId, { company: "Company C" });
    const [a, , c] = document.sections[0].entries;
    const snapshot = JSON.parse(JSON.stringify(document));

    expect(() => reorderEntries(document, sectionId, [a.id, a.id, c.id])).toThrow(InvalidOrderError);
    expect(document).toEqual(snapshot);
  });

  it("rejects an entry id that belongs to a different section", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    document = addSection(document, "PROJECTS");
    const [experienceSection, projectsSection] = document.sections;
    document = addEntry(document, experienceSection.id, { company: "Acme" });
    document = addEntry(document, projectsSection.id, { projectName: "Portfolio" });
    const projectEntryId = document.sections.find((s) => s.id === projectsSection.id)!.entries[0].id;

    expect(() => reorderEntries(document, experienceSection.id, [projectEntryId])).toThrow(InvalidOrderError);
  });

  it("reorders first-to-last and last-to-first correctly", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { company: "A" });
    document = addEntry(document, sectionId, { company: "B" });
    document = addEntry(document, sectionId, { company: "C" });
    const [a, b, c] = document.sections[0].entries;

    document = reorderEntries(document, sectionId, [b.id, c.id, a.id]);
    let byOrder = [...document.sections[0].entries].sort((x, y) => x.order - y.order);
    expect(byOrder.map((e) => e.id)).toEqual([b.id, c.id, a.id]);

    document = reorderEntries(document, sectionId, [a.id, b.id, c.id]);
    byOrder = [...document.sections[0].entries].sort((x, y) => x.order - y.order);
    expect(byOrder.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
  });

  it("reordering a one-entry section is a valid no-op, not an error", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { company: "Only" });
    const entryId = document.sections[0].entries[0].id;

    const reordered = reorderEntries(document, sectionId, [entryId]);
    expect(reordered.sections[0].entries[0].order).toBe(0);
  });

  it("reordering an empty section's entries (empty list) is a valid no-op", () => {
    const document = addSection(emptyDocument(), "EXPERIENCE");
    const reordered = reorderEntries(document, document.sections[0].id, []);
    expect(reordered.sections[0].entries).toEqual([]);
  });
});

describe("custom fields", () => {
  it("addCustomField/updateCustomField/removeCustomField manage a generic label/value structure", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    const sectionId = document.sections[0].id;
    document = addEntry(document, sectionId, { company: "Commercial Bank of Dubai" });
    const entryId = document.sections[0].entries[0].id;

    document = addCustomField(document, sectionId, entryId, "Client", "Commercial Bank of Dubai");
    document = addCustomField(document, sectionId, entryId, "Team Size", "8 developers");

    expect(document.sections[0].entries[0].customFields).toHaveLength(2);

    const clientField = document.sections[0].entries[0].customFields[0];
    document = updateCustomField(document, sectionId, entryId, clientField.id, { value: "CBD" });
    expect(document.sections[0].entries[0].customFields[0].value).toBe("CBD");

    document = removeCustomField(document, sectionId, entryId, clientField.id);
    expect(document.sections[0].entries[0].customFields).toHaveLength(1);
    expect(document.sections[0].entries[0].customFields[0].label).toBe("Team Size");
  });
});

describe("field validation — addEntry/updateEntry", () => {
  it("accepts a value for a field the section's registry actually declares", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    document = addEntry(document, document.sections[0].id, { company: "Acme", jobTitle: "Engineer" });
    expect(document.sections[0].entries[0].fields.company).toBe("Acme");
  });

  it("addEntry rejects a field key the section's registry does not declare", () => {
    const document = addSection(emptyDocument(), "EXPERIENCE");
    expect(() => addEntry(document, document.sections[0].id, { maliciousField: "xyz" })).toThrow(UnknownFieldError);
  });

  it("updateEntry rejects a field key the section's registry does not declare, without mutating the document", () => {
    let document = addSection(emptyDocument(), "EXPERIENCE");
    document = addEntry(document, document.sections[0].id, { company: "Acme" });
    const sectionId = document.sections[0].id;
    const entryId = document.sections[0].entries[0].id;
    const snapshot = JSON.parse(JSON.stringify(document));

    expect(() => updateEntry(document, sectionId, entryId, { fields: { injectedField: "payload" } })).toThrow(UnknownFieldError);
    expect(document).toEqual(snapshot);
  });

  it("a field key that is valid for one section type is still rejected on a section type that doesn't declare it", () => {
    // "gpa" is an EDUCATION field, not an EXPERIENCE field — the check is per-section-type, not a flat global whitelist.
    const document = addSection(emptyDocument(), "EXPERIENCE");
    expect(() => addEntry(document, document.sections[0].id, { gpa: "3.9" })).toThrow(UnknownFieldError);
  });

  it("rejects any fields key at all on a CUSTOM section entry — custom content belongs in customFields, not fields", () => {
    const document = addSection(emptyDocument(), "CUSTOM", "Highlights");
    expect(() => addEntry(document, document.sections[0].id, { anything: "x" })).toThrow(UnknownFieldError);
  });

  it("an empty fields object is always accepted, even on a CUSTOM section (the common 'blank new entry' case)", () => {
    let document = addSection(emptyDocument(), "CUSTOM", "Highlights");
    document = addEntry(document, document.sections[0].id, {});
    expect(document.sections[0].entries).toHaveLength(1);
  });

  it("accepts a well-formed http(s) URL for a url-typed field", () => {
    let document = addSection(emptyDocument(), "CERTIFICATIONS");
    document = addEntry(document, document.sections[0].id, { credentialUrl: "https://credly.com/badges/abc123" });
    expect(document.sections[0].entries[0].fields.credentialUrl).toBe("https://credly.com/badges/abc123");
  });

  it("rejects a malformed value for a url-typed field", () => {
    const document = addSection(emptyDocument(), "CERTIFICATIONS");
    expect(() => addEntry(document, document.sections[0].id, { credentialUrl: "not a url" })).toThrow(InvalidFieldValueError);
  });

  it("an empty string for a url-typed field is accepted (clearing the field), not treated as malformed", () => {
    let document = addSection(emptyDocument(), "PROJECTS");
    document = addEntry(document, document.sections[0].id, { url: "" });
    expect(document.sections[0].entries[0].fields.url).toBe("");
  });
});

describe("updatePersonalInformation", () => {
  it("merges partial updates without touching untouched fields", () => {
    let document = updatePersonalInformation(emptyDocument(), { name: "John Smith" });
    expect(document.personalInformation.name).toBe("John Smith");
    expect(document.personalInformation.email).toBeNull(); // untouched

    document = updatePersonalInformation(document, { email: "john@example.com" });
    expect(document.personalInformation.name).toBe("John Smith"); // still preserved
    expect(document.personalInformation.email).toBe("john@example.com");
  });
});
