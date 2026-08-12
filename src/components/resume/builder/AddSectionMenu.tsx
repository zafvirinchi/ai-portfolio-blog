"use client";

import { useState } from "react";

import { MORE_SECTION_TYPES, RECOMMENDED_SECTION_TYPES, SECTION_REGISTRY } from "@/lib/ai/resume-versions/dynamic/section-registry";
import type { SectionType } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";

// The professional "Add Section" picker the milestone spec asks for:
// a Recommended group (the sections most resumes need) and a More
// group (everything else), both sourced from the section registry's
// own `group` field so this list can never drift from what's actually
// addable. Custom Section is always its own trailing option.
export default function AddSectionMenu({ onAdd }: { onAdd: (type: SectionType, title?: string) => void }) {
  const [type, setType] = useState<SectionType>(RECOMMENDED_SECTION_TYPES[0]);

  function handleAdd() {
    if (type === "CUSTOM") {
      const title = window.prompt("Name this custom section:", "Custom Section");
      if (!title || !title.trim()) return;
      onAdd(type, title.trim());
      return;
    }
    onAdd(type);
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
      <select value={type} onChange={(event) => setType(event.target.value as SectionType)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <optgroup label="Recommended">
          {RECOMMENDED_SECTION_TYPES.map((sectionType) => (
            <option key={sectionType} value={sectionType}>
              {SECTION_REGISTRY[sectionType].label}
            </option>
          ))}
        </optgroup>
        <optgroup label="More">
          {MORE_SECTION_TYPES.map((sectionType) => (
            <option key={sectionType} value={sectionType}>
              {SECTION_REGISTRY[sectionType].label}
            </option>
          ))}
          <option value="CUSTOM">Custom Section</option>
        </optgroup>
      </select>
      <button type="button" onClick={handleAdd} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        + Add Section
      </button>
    </div>
  );
}
