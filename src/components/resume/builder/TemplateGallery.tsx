"use client";

import { useMemo, useState } from "react";

import type { DynamicResumeDocument } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import { filterTemplates, TEMPLATE_LIST } from "@/lib/ai/resume-versions/templates/template-registry";
import { TEMPLATE_CATEGORIES, type TemplateCategory, type TemplateId, type TemplateSettings } from "@/lib/ai/resume-versions/templates/template-schema";

import ResumePreview from "./ResumePreview";

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  ATS_CLASSIC: "ATS Classic",
  PROFESSIONAL: "Professional",
  MODERN: "Modern",
  EXECUTIVE: "Executive",
  TECH: "Tech",
  GRADUATE: "Graduate",
  GCC_PROFESSIONAL: "GCC Professional",
  ACADEMIC: "Academic",
};

// A professional "Choose Resume Template" grid — each card shows an
// actual miniature rendering of the CURRENT resume content in that
// template (via the same ResumePreview component the real live
// preview and export both use), not a static placeholder or a
// separate fake resume, per §4's explicit requirement. Switching
// templates NEVER touches document content — onSelect only ever
// changes templateId in TemplateSettings.
//
// Phase 25 Milestone 1 — filter bar kept deliberately small (category
// chips + 2 toggles) rather than a control per spec'd filter dimension
// (ATS/Experience/Industry/Layout/One-Page/GCC): category already
// distinguishes GCC/Tech/Academic/etc., so a separate "GCC" or
// "Industry" control would just duplicate the category filter.
export default function TemplateGallery({
  document,
  currentSettings,
  onSelect,
}: {
  document: DynamicResumeDocument;
  currentSettings: TemplateSettings;
  onSelect: (templateId: TemplateId) => void;
}) {
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const [atsOnly, setAtsOnly] = useState(false);
  const [onePageOnly, setOnePageOnly] = useState(false);

  const filteredTemplates = useMemo(
    () => filterTemplates(TEMPLATE_LIST, { category: category ?? undefined, atsOnly, onePageOnly }),
    [category, atsOnly, onePageOnly]
  );

  return (
    <div>
      <h2 className="text-sm font-bold text-slate-800">Choose Resume Template</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter templates by category">
          <button
            type="button"
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${category === null ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            All
          </button>
          {TEMPLATE_CATEGORIES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory((current) => (current === value ? null : value))}
              aria-pressed={category === value}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${category === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAtsOnly((value) => !value)}
          aria-pressed={atsOnly}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${atsOnly ? "border-green-600 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
        >
          ATS: High only
        </button>
        <button
          type="button"
          onClick={() => setOnePageOnly((value) => !value)}
          aria-pressed={onePageOnly}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${onePageOnly ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
        >
          One-page friendly
        </button>
      </div>

      {filteredTemplates.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No templates match these filters.</p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredTemplates.map((template) => {
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

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{CATEGORY_LABELS[template.category]}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      template.atsFriendliness === "high" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    ATS: {template.atsFriendliness === "high" ? "High" : "Medium"}
                  </span>
                  {template.isOnePage && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">One-page</span>}
                </div>

                <p className="mt-2 text-xs text-slate-500">{template.description}</p>
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
