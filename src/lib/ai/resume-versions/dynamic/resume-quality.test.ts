import { describe, expect, it } from "vitest";

import { checkResumeQuality } from "./resume-quality";
import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION } from "./dynamic-resume-schema";
import { addEntry, addSection } from "./dynamic-resume-document-service";
import { DEFAULT_TEMPLATE_SETTINGS } from "../templates/template-schema";
import { resolveTemplateStyles } from "../templates/template-styles";

function emptyDocument(): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: "Jane Doe", headline: null, email: null, phone: null, location: null, linkedin: null, github: null, website: null },
    sections: [],
  };
}

const defaultStyles = resolveTemplateStyles(DEFAULT_TEMPLATE_SETTINGS);

describe("checkResumeQuality", () => {
  it("flags missing email and phone as incomplete contact information", () => {
    const report = checkResumeQuality(emptyDocument(), defaultStyles);
    expect(report.checks.find((c) => c.label === "Contact information complete")?.passed).toBe(false);
    expect(report.warnings.some((w) => w.includes("Contact information incomplete"))).toBe(true);
  });

  it("passes contact completeness once email and phone are both present", () => {
    const document: DynamicResumeDocument = { ...emptyDocument(), personalInformation: { ...emptyDocument().personalInformation, email: "jane@example.com", phone: "555-1234" } };
    const report = checkResumeQuality(document, defaultStyles);
    expect(report.checks.find((c) => c.label === "Contact information complete")?.passed).toBe(true);
  });

  it("flags a section the user left visible but that renders no content", () => {
    const document = addSection(emptyDocument(), "AWARDS"); // visible, zero entries
    const report = checkResumeQuality(document, defaultStyles);
    expect(report.checks.find((c) => c.label === "No empty visible sections")?.passed).toBe(false);
  });

  it("flags a section whose only entry has very little content", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addEntry(document, document.sections[0].id, { content: "Hi" });
    const report = checkResumeQuality(document, defaultStyles);
    expect(report.checks.find((c) => c.label === "No very thin sections")?.passed).toBe(false);
  });

  it("does not flag a section with substantial content as thin", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addEntry(document, document.sections[0].id, { content: "Experienced backend engineer with 8 years building distributed systems at scale across fintech and healthcare." });
    const report = checkResumeQuality(document, defaultStyles);
    expect(report.checks.find((c) => c.label === "No very thin sections")?.passed).toBe(true);
  });

  it("reports ATS-friendly structure as passed for a single-column template and failed for an un-collapsed sidebar template", () => {
    const singleColumn = resolveTemplateStyles({ ...DEFAULT_TEMPLATE_SETTINGS, templateId: "classic" });
    const sidebar = resolveTemplateStyles({ ...DEFAULT_TEMPLATE_SETTINGS, templateId: "technical" });

    expect(checkResumeQuality(emptyDocument(), singleColumn).checks.find((c) => c.label === "ATS-friendly structure")?.passed).toBe(true);
    expect(checkResumeQuality(emptyDocument(), sidebar).checks.find((c) => c.label === "ATS-friendly structure")?.passed).toBe(false);
  });

  it("never blocks anything — always returns a report, even for a completely empty resume", () => {
    const report = checkResumeQuality(emptyDocument(), defaultStyles);
    expect(report.estimatedPageCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(report.checks)).toBe(true);
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it("warns when pageLength is set to 'one' but content is estimated to exceed a single page", () => {
    let document = addSection(emptyDocument(), "SUMMARY");
    document = addEntry(document, document.sections[0].id, { content: "x".repeat(4000) });
    const onePageStyles = resolveTemplateStyles({ ...DEFAULT_TEMPLATE_SETTINGS, pageLength: "one" });

    const report = checkResumeQuality(document, onePageStyles);
    expect(report.estimatedPageCount).toBeGreaterThan(1);
    expect(report.warnings.some((w) => w.includes("exceeds one page"))).toBe(true);
  });
});
