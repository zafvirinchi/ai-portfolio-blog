"use client";

import type { DynamicResumeDocument } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import { TEMPLATE_LIST } from "@/lib/ai/resume-versions/templates/template-registry";
import type { TemplateId, TemplateSettings } from "@/lib/ai/resume-versions/templates/template-schema";

import ResumePreview from "./ResumePreview";

// A professional "Choose Resume Template" grid — each card shows an
// actual miniature rendering of the CURRENT resume content in that
// template (via the same ResumePreview component the real live
// preview and export both use), not a static placeholder or a
// separate fake resume, per §4's explicit requirement. Switching
// templates NEVER touches document content — onSelect only ever
// changes templateId in TemplateSettings.
export default function TemplateGallery({
  document,
  currentSettings,
  onSelect,
}: {
  document: DynamicResumeDocument;
  currentSettings: TemplateSettings;
  onSelect: (templateId: TemplateId) => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-bold text-slate-800">Choose Resume Template</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATE_LIST.map((template) => {
          const selected = currentSettings.templateId === template.id;
          return (
            <div
              key={template.id}
              className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300"}`}
            >
              {/* aria-hidden: this is a live, scaled-down re-render of the user's own resume for visual scanning only — the resume's actual text content is already available elsewhere on the page, so exposing it again here (six times, once per template card) would be redundant screen-reader noise, not a genuine second source of information. */}
              <div aria-hidden="true" className="relative h-40 overflow-hidden border-b border-slate-100 bg-slate-50">
                <div className="absolute left-0 top-0 origin-top-left" style={{ width: 900, transform: "scale(0.22)" }}>
                  <ResumePreview document={document} templateSettings={{ ...currentSettings, templateId: template.id }} />
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{template.name}</h3>
                  {selected && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Selected</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{template.description}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{template.recommendedFor}</p>

                <button
                  type="button"
                  onClick={() => onSelect(template.id)}
                  disabled={selected}
                  aria-label={selected ? `${template.name} resume template is currently in use` : `Select ${template.name} resume template`}
                  className={`mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold ${
                    selected ? "cursor-default bg-slate-100 text-slate-400" : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {selected ? "In Use" : "Use This Template"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
