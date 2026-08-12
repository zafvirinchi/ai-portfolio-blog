import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATE_SETTINGS, templateSettingsSchema, updateTemplateSettingsSchema } from "./template-schema";

// Phase 15 Milestone 5 — direct schema-level tests for the closed,
// server-side-validated enums presentation settings are restricted
// to. No test file existed for template-schema.ts's validation
// behavior before this milestone (template-registry.test.ts and
// template-styles.test.ts only covered the registry/resolver).

describe("templateSettingsSchema", () => {
  it("DEFAULT_TEMPLATE_SETTINGS includes the Milestone 5 margin/pageSize fields with backward-compatible defaults", () => {
    expect(DEFAULT_TEMPLATE_SETTINGS.margin).toBe("normal");
    expect(DEFAULT_TEMPLATE_SETTINGS.pageSize).toBe("letter");
  });

  it("fills in margin/pageSize defaults when parsing an object that predates those fields (the exact old-row shape stored before this milestone)", () => {
    const legacyStoredValue = { templateId: "executive", accentColor: "navy", fontFamily: "georgia", fontSize: "standard", spacing: "standard", atsMode: false, pageLength: "auto" };
    const parsed = templateSettingsSchema.parse(legacyStoredValue);
    expect(parsed.margin).toBe("normal");
    expect(parsed.pageSize).toBe("letter");
    expect(parsed.templateId).toBe("executive"); // pre-existing fields still preserved exactly
  });

  it("rejects an unregistered margin, pageSize, or accentColor value — never trusts a client-supplied string", () => {
    expect(() => templateSettingsSchema.parse({ ...DEFAULT_TEMPLATE_SETTINGS, margin: "extra-wide" })).toThrow();
    expect(() => templateSettingsSchema.parse({ ...DEFAULT_TEMPLATE_SETTINGS, pageSize: "legal" })).toThrow();
    expect(() => templateSettingsSchema.parse({ ...DEFAULT_TEMPLATE_SETTINGS, accentColor: "hotpink" })).toThrow();
  });

  it("rejects a script-injection payload in place of a valid enum value", () => {
    expect(() => templateSettingsSchema.parse({ ...DEFAULT_TEMPLATE_SETTINGS, fontFamily: "<script>alert(1)</script>" })).toThrow();
    expect(() => templateSettingsSchema.parse({ ...DEFAULT_TEMPLATE_SETTINGS, margin: "javascript:alert(1)" })).toThrow();
  });
});

describe("updateTemplateSettingsSchema", () => {
  it("accepts a partial patch containing only margin/pageSize, leaving every other field optional", () => {
    const parsed = updateTemplateSettingsSchema.parse({ margin: "wide", pageSize: "a4" });
    expect(parsed).toEqual({ margin: "wide", pageSize: "a4" });
  });

  it("rejects an unregistered margin or pageSize in a partial patch", () => {
    expect(() => updateTemplateSettingsSchema.parse({ margin: "huge" })).toThrow();
    expect(() => updateTemplateSettingsSchema.parse({ pageSize: "tabloid" })).toThrow();
  });

  it("an empty patch is valid — a no-op update", () => {
    expect(() => updateTemplateSettingsSchema.parse({})).not.toThrow();
  });
});
