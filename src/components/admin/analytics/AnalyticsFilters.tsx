"use client";

import { DATE_RANGE_PRESETS, DateRangePreset } from "@/lib/analytics/analytics-schema";

const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_month: "This month",
  previous_month: "Previous month",
  this_year: "This year",
  custom: "Custom range",
};

export interface AnalyticsFiltersValue {
  range: DateRangePreset;
  from: string;
  to: string;
}

export default function AnalyticsFilters({ value, onChange }: { value: AnalyticsFiltersValue; onChange: (value: AnalyticsFiltersValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Date range
        <select
          value={value.range}
          onChange={(event) => onChange({ ...value, range: event.target.value as DateRangePreset })}
          className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-800"
        >
          {DATE_RANGE_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {PRESET_LABELS[preset]}
            </option>
          ))}
        </select>
      </label>

      {value.range === "custom" && (
        <>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            From
            <input
              type="date"
              value={value.from}
              onChange={(event) => onChange({ ...value, from: event.target.value })}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-800"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            To
            <input
              type="date"
              value={value.to}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-800"
            />
          </label>
        </>
      )}
    </div>
  );
}
