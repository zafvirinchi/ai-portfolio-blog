import { describe, expect, it } from "vitest";

import { containsPdfUnsafeCharacters, formatFieldValue, getEntryPresentation, isFieldEmpty, prepareForRender } from "./dynamic-resume-render";
import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION, ResumeEntry, ResumeSection } from "./dynamic-resume-schema";

function entry(overrides: Partial<ResumeEntry> = {}): ResumeEntry {
  return { id: "entry-1", order: 0, visible: true, fields: {}, hiddenFieldKeys: [], customFields: [], ...overrides };
}

function section(overrides: Partial<ResumeSection> = {}): ResumeSection {
  return { id: "section-1", type: "EXPERIENCE", title: "Experience", order: 0, visible: true, custom: false, entries: [], settings: { showTitle: true, showDivider: true }, ...overrides };
}

function document(sections: ResumeSection[]): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: "Jane Doe", headline: null, email: null, phone: null, location: null, linkedin: null, github: null, website: null },
    sections,
  };
}

describe("isFieldEmpty", () => {
  it("treats undefined, null, and blank/whitespace strings as empty", () => {
    expect(isFieldEmpty(undefined)).toBe(true);
    expect(isFieldEmpty(null)).toBe(true);
    expect(isFieldEmpty("")).toBe(true);
    expect(isFieldEmpty("   ")).toBe(true);
  });

  it("treats a non-blank string as non-empty", () => {
    expect(isFieldEmpty("Software Engineer")).toBe(false);
  });

  it("treats an empty array, or an array of only blank strings, as empty", () => {
    expect(isFieldEmpty([])).toBe(true);
    expect(isFieldEmpty(["", "   "])).toBe(true);
  });

  it("treats an array with at least one non-blank entry as non-empty", () => {
    expect(isFieldEmpty(["", "React"])).toBe(false);
  });

  it("never treats a boolean as empty — false is a real, renderable value", () => {
    expect(isFieldEmpty(true)).toBe(false);
    expect(isFieldEmpty(false)).toBe(false);
  });
});

describe("prepareForRender", () => {
  it("drops sections whose visible flag is false", () => {
    const doc = document([section({ visible: false, entries: [entry({ fields: { jobTitle: "Engineer" } })] })]);
    expect(prepareForRender(doc)).toEqual([]);
  });

  it("drops individual entries whose visible flag is false, keeping visible siblings", () => {
    const doc = document([
      section({
        entries: [
          entry({ id: "e1", order: 0, visible: false, fields: { jobTitle: "Hidden Role" } }),
          entry({ id: "e2", order: 1, visible: true, fields: { jobTitle: "Visible Role" } }),
        ],
      }),
    ]);

    const rendered = prepareForRender(doc);
    expect(rendered[0].entries).toHaveLength(1);
    expect(rendered[0].entries[0].id).toBe("e2");
  });

  it("drops a section entirely once all its entries are filtered out (never an empty heading)", () => {
    const doc = document([section({ entries: [entry({ visible: false, fields: { jobTitle: "Hidden" } })] })]);
    expect(prepareForRender(doc)).toEqual([]);
  });

  it("omits empty fields but keeps fields with real values", () => {
    const doc = document([
      section({ entries: [entry({ fields: { jobTitle: "Engineer", company: "" } })] }),
    ]);

    const fields = prepareForRender(doc)[0].entries[0].fields;
    expect(fields.map((f) => f.key)).toEqual(["jobTitle"]);
  });

  it("respects explicit hiddenFieldKeys even when the field has a real value", () => {
    const doc = document([
      section({ entries: [entry({ fields: { jobTitle: "Engineer", company: "Acme" }, hiddenFieldKeys: ["company"] })] }),
    ]);

    const fields = prepareForRender(doc)[0].entries[0].fields;
    expect(fields.map((f) => f.key)).toEqual(["jobTitle"]);
  });

  it("renders a boolean field only when true, never as a 'Field: No' line", () => {
    const withFalse = document([section({ entries: [entry({ fields: { jobTitle: "Engineer", current: false } })] })]);
    const falseFields = prepareForRender(withFalse)[0].entries[0].fields;
    expect(falseFields.find((f) => f.key === "current")).toBeUndefined();

    const withTrue = document([section({ entries: [entry({ fields: { jobTitle: "Engineer", current: true } })] })]);
    const trueFields = prepareForRender(withTrue)[0].entries[0].fields;
    expect(trueFields.find((f) => f.key === "current")).toBeDefined();
  });

  it("sorts sections and entries by their order field, independent of array position", () => {
    const doc = document([
      section({ id: "s2", order: 1, entries: [entry({ fields: { jobTitle: "Second" } })] }),
      section({ id: "s1", order: 0, entries: [entry({ fields: { jobTitle: "First" } })] }),
    ]);

    const rendered = prepareForRender(doc);
    expect(rendered.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("orders entries within a section by their order field too", () => {
    const doc = document([
      section({
        entries: [
          entry({ id: "e2", order: 1, fields: { jobTitle: "Second Job" } }),
          entry({ id: "e1", order: 0, fields: { jobTitle: "First Job" } }),
        ],
      }),
    ]);

    const rendered = prepareForRender(doc);
    expect(rendered[0].entries.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("includes visible custom fields with a non-blank value, in their own order", () => {
    const doc = document([
      section({
        entries: [
          entry({
            fields: { jobTitle: "Engineer" },
            customFields: [
              { id: "c2", label: "Team Size", value: "8", order: 1, visible: true },
              { id: "c1", label: "Client", value: "Commercial Bank of Dubai", order: 0, visible: true },
              { id: "c3", label: "Hidden Field", value: "secret", order: 2, visible: false },
            ],
          }),
        ],
      }),
    ]);

    const customFields = prepareForRender(doc)[0].entries[0].customFields;
    expect(customFields.map((f) => f.id)).toEqual(["c1", "c2"]);
  });

  it("still renders an entry that has zero registry fields but at least one custom field", () => {
    const doc = document([
      section({
        entries: [entry({ fields: {}, customFields: [{ id: "c1", label: "Note", value: "Freeform content", order: 0, visible: true }] })],
      }),
    ]);

    expect(prepareForRender(doc)[0].entries).toHaveLength(1);
  });

  it("passes each section's custom flag and settings through untouched", () => {
    const doc = document([
      section({ custom: true, settings: { showTitle: false, showDivider: true }, entries: [entry({ fields: { jobTitle: "Engineer" } })] }),
    ]);

    const rendered = prepareForRender(doc)[0];
    expect(rendered.custom).toBe(true);
    expect(rendered.settings).toEqual({ showTitle: false, showDivider: true });
  });
});

describe("getEntryPresentation", () => {
  it("uses the first registry field as the heading and the rest (plus custom fields) as body lines", () => {
    const e = entry({
      fields: { jobTitle: "Engineer", company: "Acme" },
      customFields: [{ id: "c1", label: "Client", value: "Commercial Bank of Dubai", order: 0, visible: true }],
    });
    const renderableEntry = prepareForRender(document([section({ entries: [e] })]))[0].entries[0];

    const { heading, lines } = getEntryPresentation(renderableEntry);
    expect(heading).toEqual({ label: "Job Title", value: "Engineer" });
    expect(lines).toEqual([
      { label: "Company", value: "Acme" },
      { label: "Client", value: "Commercial Bank of Dubai" },
    ]);
  });

  it("falls back to the first custom field as the heading when the entry has no registry fields (CUSTOM sections)", () => {
    const e = entry({
      fields: {},
      customFields: [
        { id: "c1", label: "Title", value: "Enterprise Modernization", order: 0, visible: true },
        { id: "c2", label: "Impact", value: "Reduced deployment time by 40%", order: 1, visible: true },
      ],
    });
    const renderableEntry = prepareForRender(document([section({ type: "CUSTOM", custom: true, entries: [e] })]))[0].entries[0];

    const { heading, lines } = getEntryPresentation(renderableEntry);
    expect(heading).toEqual({ label: "Title", value: "Enterprise Modernization" });
    expect(lines).toEqual([{ label: "Impact", value: "Reduced deployment time by 40%" }]);
  });
});

// Phase 25 Milestone 2 — regression coverage for a genuine, previously
// silent defect: pdfkit's built-in fonts (template-styles.ts's
// PDF_FONT_MAP) have no glyph coverage outside Latin-1, so a candidate
// name/headline/section content using a non-Latin script would
// silently render as missing glyphs in the exported PDF with no
// warning anywhere. containsPdfUnsafeCharacters() detects this so the
// UI can surface an honest warning instead.
describe("containsPdfUnsafeCharacters", () => {
  it("returns false for plain ASCII content", () => {
    const doc = document([section({ entries: [entry({ fields: { jobTitle: "Software Engineer", company: "Acme Corp" } })] })]);
    expect(containsPdfUnsafeCharacters(doc)).toBe(false);
  });

  it("returns false for accented Latin-1 characters (within pdfkit's actual font coverage)", () => {
    const doc: DynamicResumeDocument = { ...document([]), personalInformation: { ...document([]).personalInformation, name: "José García" } };
    expect(containsPdfUnsafeCharacters(doc)).toBe(false);
  });

  it("returns true when the name contains a non-Latin script (e.g. Arabic — relevant to the GCC-oriented template)", () => {
    const doc: DynamicResumeDocument = { ...document([]), personalInformation: { ...document([]).personalInformation, name: "أحمد" } };
    expect(containsPdfUnsafeCharacters(doc)).toBe(true);
  });

  it("returns true when the headline contains CJK characters", () => {
    const doc: DynamicResumeDocument = { ...document([]), personalInformation: { ...document([]).personalInformation, headline: "ソフトウェアエンジニア" } };
    expect(containsPdfUnsafeCharacters(doc)).toBe(true);
  });

  it("checks rendered entry content, not just personalInformation", () => {
    const doc = document([section({ entries: [entry({ fields: { jobTitle: "工程师", company: "Acme" } })] })]);
    expect(containsPdfUnsafeCharacters(doc)).toBe(true);
  });

  it("ignores content in hidden/invisible sections and entries — nothing that won't actually render", () => {
    const doc = document([section({ visible: false, entries: [entry({ fields: { jobTitle: "工程师" } })] })]);
    expect(containsPdfUnsafeCharacters(doc)).toBe(false);
  });
});

describe("formatFieldValue", () => {
  it("formats a string value as-is", () => {
    expect(formatFieldValue({ key: "jobTitle", label: "Job Title", value: "Engineer" })).toBe("Engineer");
  });

  it("joins a list value with a comma separator", () => {
    expect(formatFieldValue({ key: "technologies", label: "Technologies", value: ["React", "TypeScript"] })).toBe("React, TypeScript");
  });

  it("renders a true boolean field as its own label", () => {
    expect(formatFieldValue({ key: "current", label: "Current Position", value: true })).toBe("Current Position");
  });
});
