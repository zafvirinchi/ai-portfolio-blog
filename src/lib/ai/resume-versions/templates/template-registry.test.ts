import { describe, expect, it } from "vitest";

import { filterTemplates, TEMPLATE_LIST, TEMPLATE_REGISTRY, getTemplateDefinition } from "./template-registry";
import { TEMPLATE_CATEGORIES, TEMPLATE_IDS } from "./template-schema";

describe("TEMPLATE_REGISTRY", () => {
  it("defines exactly the declared template ids (one definition per id, no orphans on either side), each matching its own key", () => {
    expect(Object.keys(TEMPLATE_REGISTRY).sort()).toEqual([...TEMPLATE_IDS].sort());
    for (const id of TEMPLATE_IDS) {
      expect(TEMPLATE_REGISTRY[id].id).toBe(id);
    }
  });

  it("includes the GCC Professional template added in Phase 15 Milestone 4, single-column and high ATS friendliness", () => {
    expect(TEMPLATE_REGISTRY.gcc.layout).toBe("single-column");
    expect(TEMPLATE_REGISTRY.gcc.atsFriendliness).toBe("high");
    expect(TEMPLATE_REGISTRY.gcc.name).toBe("GCC Professional");
  });

  it("only declares sidebarSectionTypes for a template whose layout is 'sidebar'", () => {
    for (const definition of TEMPLATE_LIST) {
      if (definition.layout === "single-column") {
        expect(definition.sidebarSectionTypes).toBeUndefined();
      } else {
        expect(definition.sidebarSectionTypes && definition.sidebarSectionTypes.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every template a non-empty name, description, and recommendedFor string", () => {
    for (const definition of TEMPLATE_LIST) {
      expect(definition.name.trim().length).toBeGreaterThan(0);
      expect(definition.description.trim().length).toBeGreaterThan(0);
      expect(definition.recommendedFor.trim().length).toBeGreaterThan(0);
    }
  });

  it("getTemplateDefinition looks up by id", () => {
    expect(getTemplateDefinition("technical").layout).toBe("sidebar");
    expect(getTemplateDefinition("classic").layout).toBe("single-column");
  });

  // Phase 25 Milestone 1 — 8 templates covering the full suggested
  // category spread (added "graduate"/"academic" to reach 8), plus
  // structured filter metadata on every template.
  it("has exactly 8 templates, one per suggested category, with structured filter metadata populated", () => {
    expect(TEMPLATE_LIST).toHaveLength(8);
    expect(TEMPLATE_LIST.map((definition) => definition.category).sort()).toEqual([...TEMPLATE_CATEGORIES].sort());

    for (const definition of TEMPLATE_LIST) {
      expect(TEMPLATE_CATEGORIES).toContain(definition.category);
      expect(definition.experienceLevels.length).toBeGreaterThan(0);
      expect(definition.industries.length).toBeGreaterThan(0);
      expect(typeof definition.isOnePage).toBe("boolean");
    }
  });

  it("includes the Graduate and Academic templates added in Phase 25 Milestone 1", () => {
    expect(TEMPLATE_REGISTRY.graduate.category).toBe("GRADUATE");
    expect(TEMPLATE_REGISTRY.graduate.experienceLevels).toEqual(["entry"]);
    expect(TEMPLATE_REGISTRY.academic.category).toBe("ACADEMIC");
    expect(TEMPLATE_REGISTRY.academic.atsFriendliness).toBe("high");
  });

  // Phase 25 Milestone 2 — regression test for a genuine defect found
  // during the Milestone 2 audit: Graduate's (layout, headerAlign,
  // sectionHeadingStyle) triple was originally byte-identical to
  // Minimal's — the only template-intrinsic, structural
  // differentiators this system has (see TemplateDefinition's own
  // JSDoc) — making the two templates genuinely indistinguishable in
  // both the gallery preview and actual rendered output, since
  // defaultAccent/defaultFont are never auto-applied on template
  // selection. Fixed by changing Graduate's headerAlign to "center".
  //
  // Scoped to Graduate specifically (the template this milestone's
  // audit was explicitly asked to verify), not a blanket
  // every-template-must-be-unique assertion: "classic" and "gcc" share
  // the identical (left, underline) combination too, a genuine,
  // separately-reported finding (see PHASE25_MILESTONE2 report) that
  // was deliberately NOT changed here — GCC's conservative styling is
  // established, shipped positioning from Phase 15 Milestone 4, outside
  // this milestone's explicitly-named scope, and changing it risks a
  // worse regression than documenting it for a future, dedicated pass.
  it("gives Graduate a structural (headerAlign, sectionHeadingStyle) combination distinct from every other single-column template", () => {
    const graduateTriple = `${TEMPLATE_REGISTRY.graduate.headerAlign}|${TEMPLATE_REGISTRY.graduate.sectionHeadingStyle}`;
    const otherTriples = TEMPLATE_LIST.filter((definition) => definition.id !== "graduate" && definition.layout === "single-column").map(
      (definition) => `${definition.headerAlign}|${definition.sectionHeadingStyle}`
    );

    expect(otherTriples).not.toContain(graduateTriple);
  });
});

describe("filterTemplates", () => {
  it("returns every template when no filters are set", () => {
    expect(filterTemplates(TEMPLATE_LIST, {})).toHaveLength(TEMPLATE_LIST.length);
  });

  it("filters by category", () => {
    const result = filterTemplates(TEMPLATE_LIST, { category: "GCC_PROFESSIONAL" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gcc");
  });

  it("filters to ATS-high-only templates", () => {
    const result = filterTemplates(TEMPLATE_LIST, { atsOnly: true });
    expect(result.every((definition) => definition.atsFriendliness === "high")).toBe(true);
    expect(result.some((definition) => definition.id === "technical")).toBe(false); // technical is "medium"
  });

  it("filters to one-page-friendly templates only", () => {
    const result = filterTemplates(TEMPLATE_LIST, { onePageOnly: true });
    expect(result.every((definition) => definition.isOnePage)).toBe(true);
    expect(result.some((definition) => definition.id === "minimal")).toBe(true);
  });

  it("AND-combines multiple filters", () => {
    const result = filterTemplates(TEMPLATE_LIST, { category: "GRADUATE", atsOnly: true, onePageOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("graduate");
  });
});
