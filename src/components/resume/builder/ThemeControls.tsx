"use client";

import {
  ACCENT_COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  MARGIN_OPTIONS,
  PAGE_LENGTHS,
  PAGE_SIZES,
  SPACING_OPTIONS,
  type AccentColor,
  type FontFamily,
  type FontSizeOption,
  type MarginOption,
  type PageLength,
  type PageSize,
  type SpacingOption,
  type TemplateSettings,
  type UpdateTemplateSettingsInput,
} from "@/lib/ai/resume-versions/templates/template-schema";
import { getTemplateDefinition } from "@/lib/ai/resume-versions/templates/template-registry";
import { ACCENT_HEX } from "@/lib/ai/resume-versions/templates/template-styles";

const ACCENT_LABELS: Record<AccentColor, string> = { blue: "Blue", navy: "Navy", green: "Green", purple: "Purple", black: "Black", gray: "Gray" };
const FONT_LABELS: Record<FontFamily, string> = { inter: "Inter", arial: "Arial", helvetica: "Helvetica", georgia: "Georgia", times: "Times New Roman" };
const FONT_SIZE_LABELS: Record<FontSizeOption, string> = { compact: "Compact", standard: "Standard", large: "Large" };
const SPACING_LABELS: Record<SpacingOption, string> = { compact: "Compact", standard: "Standard", spacious: "Spacious" };
const PAGE_LENGTH_LABELS: Record<PageLength, string> = { auto: "Automatic", one: "One Page", two: "Two Pages" };
const MARGIN_LABELS: Record<MarginOption, string> = { narrow: "Narrow", normal: "Normal", wide: "Wide" };
const PAGE_SIZE_LABELS: Record<PageSize, string> = { letter: "Letter", a4: "A4" };

function SegmentedControl<T extends string>({
  options,
  labels,
  value,
  onChange,
  ariaLabel,
  optionAriaLabel,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Per-button aria-label override — e.g. "Select Compact spacing" instead of just "Compact" — used where the group label alone wouldn't be descriptive enough read out of context. */
  optionAriaLabel?: (option: T) => string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-xl border border-slate-300 p-1">
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            aria-label={optionAriaLabel?.(option)}
            onClick={() => onChange(option)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selected ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

// Every control here maps to exactly one of TemplateSettings' small,
// closed set of options (§9–§11) — never a free-form color picker or
// an arbitrary numeric input, so a user can't accidentally produce a
// broken/unprofessional layout. Accent selection never relies on color
// alone (§33): the selected swatch also gets a checkmark and a visible
// focus ring, and every swatch has an aria-label naming its color.
export default function ThemeControls({ settings, onChange }: { settings: TemplateSettings; onChange: (patch: UpdateTemplateSettingsInput) => void }) {
  // Phase 15 Milestone 5 — restores THIS template's own defaults
  // (defaultAccent/defaultFont come from the template registry itself,
  // not a generic system default) plus the schema's own standard
  // values for every other control. Never touches resume content —
  // onChange here is the exact same TemplateSettings patch callback
  // every other control already uses.
  function resetDesign() {
    const definition = getTemplateDefinition(settings.templateId);
    onChange({
      accentColor: definition.defaultAccent,
      fontFamily: definition.defaultFont,
      fontSize: "standard",
      spacing: "standard",
      pageLength: "auto",
      margin: "normal",
      pageSize: "letter",
      atsMode: false,
    });
  }

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">Design</h2>
        <button type="button" onClick={resetDesign} aria-label="Reset design to this template's defaults" className="text-xs font-semibold text-slate-400 hover:text-slate-600">
          Reset Design
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Accent Color</p>
        <div role="group" aria-label="Accent color" className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((accent) => {
            const selected = settings.accentColor === accent;
            return (
              <button
                key={accent}
                type="button"
                aria-label={`Select ${ACCENT_LABELS[accent]} accent color`}
                aria-pressed={selected}
                title={ACCENT_LABELS[accent]}
                onClick={() => onChange({ accentColor: accent })}
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${selected ? "border-slate-900" : "border-transparent"}`}
                style={{ backgroundColor: ACCENT_HEX[accent] }}
              >
                {selected && <span className="text-xs font-bold text-white">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="font-family-select" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Font Family
        </label>
        <select
          id="font-family-select"
          value={settings.fontFamily}
          onChange={(event) => onChange({ fontFamily: event.target.value as FontFamily })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font} value={font}>
              {FONT_LABELS[font]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Font Size</p>
        <SegmentedControl options={FONT_SIZES} labels={FONT_SIZE_LABELS} value={settings.fontSize} onChange={(fontSize) => onChange({ fontSize })} ariaLabel="Font size" />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Spacing</p>
        <SegmentedControl options={SPACING_OPTIONS} labels={SPACING_LABELS} value={settings.spacing} onChange={(spacing) => onChange({ spacing })} ariaLabel="Spacing density" />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Page Length</p>
        <SegmentedControl options={PAGE_LENGTHS} labels={PAGE_LENGTH_LABELS} value={settings.pageLength} onChange={(pageLength) => onChange({ pageLength })} ariaLabel="Target page length" />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Margin</p>
        <SegmentedControl
          options={MARGIN_OPTIONS}
          labels={MARGIN_LABELS}
          value={settings.margin}
          onChange={(margin) => onChange({ margin })}
          ariaLabel="Page margin"
          optionAriaLabel={(option) => `Select ${MARGIN_LABELS[option]} margin`}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Page Size</p>
        <SegmentedControl
          options={PAGE_SIZES}
          labels={PAGE_SIZE_LABELS}
          value={settings.pageSize}
          onChange={(pageSize) => onChange({ pageSize })}
          ariaLabel="Page size"
          optionAriaLabel={(option) => `Select ${PAGE_SIZE_LABELS[option]} page size`}
        />
      </div>

      <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <input type="checkbox" checked={settings.atsMode} onChange={(event) => onChange({ atsMode: event.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>
          <span className="block text-sm font-semibold text-slate-800">ATS Friendly Mode</span>
          <span className="block text-xs text-slate-500">Forces a single-column layout and avoids decorative structures that can confuse applicant tracking systems.</span>
        </span>
      </label>
    </div>
  );
}
