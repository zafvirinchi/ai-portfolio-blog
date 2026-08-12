import { describe, expect, it } from "vitest";

import { TEMPLATE_LIST, TEMPLATE_REGISTRY, getTemplateDefinition } from "./template-registry";
import { TEMPLATE_IDS } from "./template-schema";

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
});
