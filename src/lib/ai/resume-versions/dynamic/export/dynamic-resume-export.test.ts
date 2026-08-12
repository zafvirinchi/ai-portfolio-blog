import { describe, expect, it } from "vitest";

import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION, ResumeEntry, ResumeSection } from "../dynamic-resume-schema";
import { MARGIN_OPTIONS, PAGE_SIZES, TEMPLATE_IDS } from "../../templates/template-schema";
import { renderDynamicResumeDocx } from "./dynamic-resume-docx";
import { renderDynamicResumePdf } from "./dynamic-resume-pdf";

// Phase 15 Milestone 4 — no test file existed for either export
// renderer before this milestone, despite both already being
// template-aware (Phase 13 Milestone 14). These are deliberately
// smoke-level: pdfkit/docx output is a binary buffer, and this
// project has no existing PDF-text-extraction/DOCX-XML-inspection
// test helper (adding one would be a new testing dependency, out of
// scope for "add tests" in a template milestone) — so correctness is
// verified at the level this codebase's other export-adjacent code
// already trusts: renders without throwing, for every registered
// template (including the sidebar "technical" layout and the new
// "gcc" template), producing a real non-empty buffer, and doesn't
// choke on hidden sections, empty sections, or custom sections.

function entry(overrides: Partial<ResumeEntry> = {}): ResumeEntry {
  return { id: "entry-1", order: 0, visible: true, fields: {}, hiddenFieldKeys: [], customFields: [], ...overrides };
}

function section(overrides: Partial<ResumeSection> = {}): ResumeSection {
  return { id: "section-1", type: "EXPERIENCE", title: "Experience", order: 0, visible: true, custom: false, entries: [], settings: { showTitle: true, showDivider: true }, ...overrides };
}

/**
 * Best-effort PDF page count from the raw buffer — pdfkit serializes
 * each page object with a literal, uncompressed `/Type /Page` marker
 * (verified empirically: a 3-page pdfkit document contains exactly 4
 * such substrings — the 3 page objects plus 1 parent `/Type /Pages`
 * node, which also matches the same substring — so the true page
 * count is always `occurrences - 1`). This is a heuristic on pdfkit's
 * current serialization, not a real PDF parser (this project has none
 * — see the module doc comment) — used only to strengthen an existing
 * "renders successfully" assertion with real pagination evidence, not
 * as this test's sole source of truth.
 */
function countPdfPages(buffer: Buffer): number {
  return buffer.toString("latin1").split("/Type /Page").length - 1 - 1;
}

function representativeDocument(): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: "Jane Doe", email: "jane@example.com", phone: "+1 555 0100", location: "Remote", linkedin: "linkedin.com/in/janedoe", github: null, website: null },
    sections: [
      section({
        id: "summary",
        type: "SUMMARY",
        title: "Professional Summary",
        order: 0,
        entries: [entry({ id: "summary-entry", fields: { content: "Experienced full-stack engineer." } })],
      }),
      section({
        id: "experience",
        type: "EXPERIENCE",
        title: "Experience",
        order: 1,
        entries: [
          entry({ id: "job-1", order: 0, fields: { jobTitle: "Senior Engineer", company: "Acme", startDate: "2020", endDate: "Present", current: true, achievements: ["Built X", "Shipped Y"] } }),
        ],
      }),
      section({
        id: "skills",
        type: "SKILLS",
        title: "Skills",
        order: 2,
        entries: [entry({ id: "skills-entry", fields: { category: "Technical Skills", skills: ["TypeScript", "React", "Node.js"] } })],
      }),
      section({ id: "certifications", type: "CERTIFICATIONS", title: "Certifications", order: 3, entries: [] }), // empty — must not appear in output
      section({ id: "hidden-awards", type: "AWARDS", title: "Awards", order: 4, visible: false, entries: [entry({ fields: { title: "Employee of the Year" } })] }), // hidden — must not appear
      section({
        id: "custom-1",
        type: "CUSTOM",
        title: "Professional Highlights",
        order: 5,
        custom: true,
        entries: [entry({ id: "custom-entry", customFields: [{ id: "cf-1", label: "Speaking", value: "Keynoted at DevConf", order: 0, visible: true }] })],
      }),
    ],
  };
}

describe("renderDynamicResumePdf", () => {
  it("renders successfully for every registered template, including the sidebar 'technical' layout and the new 'gcc' template", async () => {
    for (const templateId of TEMPLATE_IDS) {
      const buffer = await renderDynamicResumePdf(representativeDocument(), "Test Version", { templateId, accentColor: "blue", fontFamily: "inter", fontSize: "standard", spacing: "standard", atsMode: false, pageLength: "auto", margin: "normal", pageSize: "letter" });
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF"); // a real PDF, not an empty/corrupt stream
    }
  });

  it("does not throw when every section is hidden or empty (a valid, if unusual, document)", async () => {
    const empty: DynamicResumeDocument = {
      schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
      personalInformation: { name: null, email: null, phone: null, location: null, linkedin: null, github: null, website: null },
      sections: [section({ id: "empty-section", entries: [] })],
    };
    const buffer = await renderDynamicResumePdf(empty, "Empty Version");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("renders successfully for every margin option (Phase 15 Milestone 5)", async () => {
    for (const margin of MARGIN_OPTIONS) {
      const buffer = await renderDynamicResumePdf(representativeDocument(), "Test Version", { templateId: "modern", accentColor: "blue", fontFamily: "inter", fontSize: "standard", spacing: "standard", atsMode: false, pageLength: "auto", margin, pageSize: "letter" });
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    }
  });

  it("renders successfully for every page size option (Phase 15 Milestone 5)", async () => {
    for (const pageSize of PAGE_SIZES) {
      const buffer = await renderDynamicResumePdf(representativeDocument(), "Test Version", { templateId: "modern", accentColor: "blue", fontFamily: "inter", fontSize: "standard", spacing: "standard", atsMode: false, pageLength: "auto", margin: "normal", pageSize });
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    }
  });

  it("remains stable with 50 experience entries — no artificial content limit, and it spans multiple pages (Phase 15 Milestone 6, §15)", async () => {
    const document: DynamicResumeDocument = {
      schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
      personalInformation: { name: "Jane Doe", email: null, phone: null, location: null, linkedin: null, github: null, website: null },
      sections: [
        section({
          id: "experience",
          entries: Array.from({ length: 50 }, (_, i) =>
            entry({ id: `job-${i}`, order: i, fields: { jobTitle: `Engineer ${i}`, company: `Company ${i}`, achievements: ["Built something", "Shipped something"] } })
          ),
        }),
      ],
    };

    const buffer = await renderDynamicResumePdf(document, "Large Resume");
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(countPdfPages(buffer)).toBeGreaterThan(1); // 50 entries cannot possibly fit on one page
  });

  it("does not overflow or throw on a very long unbroken token (URL, long company name) — pdfkit force-wraps these on its own", async () => {
    const longUnbrokenToken = "https://" + "a".repeat(120) + ".example.com/credential/verify";
    const document: DynamicResumeDocument = {
      schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
      personalInformation: { name: "Jane Doe", email: null, phone: null, location: null, linkedin: null, github: null, website: null },
      sections: [
        section({
          id: "certifications",
          type: "CERTIFICATIONS",
          title: "Certifications",
          entries: [entry({ fields: { name: "A".repeat(150), credentialUrl: longUnbrokenToken } })],
        }),
      ],
    };

    const buffer = await renderDynamicResumePdf(document, "Long Token Test");
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("a sidebar template whose own sidebar content overflows page 1 does not corrupt or throw — the fixed overlap bug (Phase 15 Milestone 6, §11)", async () => {
    const document: DynamicResumeDocument = {
      schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
      personalInformation: { name: "Jane Doe", email: null, phone: null, location: null, linkedin: null, github: null, website: null },
      sections: [
        section({
          id: "skills",
          type: "SKILLS",
          title: "Skills",
          entries: Array.from({ length: 40 }, (_, i) => entry({ id: `skills-${i}`, order: i, fields: { category: `Category ${i}`, skills: ["One", "Two", "Three", "Four", "Five"] } })),
        }),
        section({ id: "experience", order: 1, entries: [entry({ fields: { jobTitle: "Engineer", company: "Acme", achievements: ["Did a thing"] } })] }),
      ],
    };

    // "technical" is the one sidebar template — SKILLS is one of its sidebarSectionTypes.
    const buffer = await renderDynamicResumePdf(document, "Sidebar Overflow Test", { templateId: "technical", accentColor: "blue", fontFamily: "inter", fontSize: "standard", spacing: "standard", atsMode: false, pageLength: "auto", margin: "normal", pageSize: "letter" });
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(countPdfPages(buffer)).toBeGreaterThan(1); // 40 sidebar entries cannot fit on one page — this exercises the overflow path the fix targets
  });
});

describe("renderDynamicResumeDocx", () => {
  it("renders successfully for every registered template, including the sidebar 'technical' layout and the new 'gcc' template", async () => {
    for (const templateId of TEMPLATE_IDS) {
      const buffer = await renderDynamicResumeDocx(representativeDocument(), "Test Version", { templateId, accentColor: "blue", fontFamily: "inter", fontSize: "standard", spacing: "standard", atsMode: false, pageLength: "auto", margin: "normal", pageSize: "letter" });
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK"); // a real .docx (zip) container, not an empty/corrupt stream
    }
  });

  it("does not throw when every section is hidden or empty (a valid, if unusual, document)", async () => {
    const empty: DynamicResumeDocument = {
      schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
      personalInformation: { name: null, email: null, phone: null, location: null, linkedin: null, github: null, website: null },
      sections: [section({ id: "empty-section", entries: [] })],
    };
    const buffer = await renderDynamicResumeDocx(empty, "Empty Version");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("renders successfully for every margin and page size option (Phase 15 Milestone 5)", async () => {
    for (const margin of MARGIN_OPTIONS) {
      for (const pageSize of PAGE_SIZES) {
        const buffer = await renderDynamicResumeDocx(representativeDocument(), "Test Version", { templateId: "modern", accentColor: "blue", fontFamily: "inter", fontSize: "standard", spacing: "standard", atsMode: false, pageLength: "auto", margin, pageSize });
        expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
      }
    }
  });

  it("remains stable with 50 experience entries — no artificial content limit (Phase 15 Milestone 6, §15)", async () => {
    const document: DynamicResumeDocument = {
      schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
      personalInformation: { name: "Jane Doe", email: null, phone: null, location: null, linkedin: null, github: null, website: null },
      sections: [
        section({
          id: "experience",
          entries: Array.from({ length: 50 }, (_, i) =>
            entry({ id: `job-${i}`, order: i, fields: { jobTitle: `Engineer ${i}`, company: `Company ${i}`, achievements: ["Built something", "Shipped something"] } })
          ),
        }),
      ],
    };

    const buffer = await renderDynamicResumeDocx(document, "Large Resume");
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("does not throw on a very long unbroken token (URL, long company name)", async () => {
    const longUnbrokenToken = "https://" + "a".repeat(120) + ".example.com/credential/verify";
    const document: DynamicResumeDocument = {
      schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
      personalInformation: { name: "Jane Doe", email: null, phone: null, location: null, linkedin: null, github: null, website: null },
      sections: [
        section({
          id: "certifications",
          type: "CERTIFICATIONS",
          title: "Certifications",
          entries: [entry({ fields: { name: "A".repeat(150), credentialUrl: longUnbrokenToken } })],
        }),
      ],
    };

    const buffer = await renderDynamicResumeDocx(document, "Long Token Test");
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("a heavy sidebar template's content renders successfully (Phase 15 Milestone 6, §11)", async () => {
    const document: DynamicResumeDocument = {
      schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
      personalInformation: { name: "Jane Doe", email: null, phone: null, location: null, linkedin: null, github: null, website: null },
      sections: [
        section({
          id: "skills",
          type: "SKILLS",
          title: "Skills",
          entries: Array.from({ length: 40 }, (_, i) => entry({ id: `skills-${i}`, order: i, fields: { category: `Category ${i}`, skills: ["One", "Two", "Three"] } })),
        }),
      ],
    };

    const buffer = await renderDynamicResumeDocx(document, "Sidebar Overflow Test", { templateId: "technical", accentColor: "blue", fontFamily: "inter", fontSize: "standard", spacing: "standard", atsMode: false, pageLength: "auto", margin: "normal", pageSize: "letter" });
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
