"use client";

import { useState } from "react";

import type { DynamicPersonalInformation } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";

// Phase 15 Milestone 2 — personalInformation has no section/entry of
// its own (it's a fixed set of top-level document fields), so it gets
// its own small always-visible editor rather than being forced through
// SectionEditor/EntryEditor's registry-driven machinery. Same on-blur
// commit convention as EntryEditor's fields.
const FIELDS: { key: keyof DynamicPersonalInformation; label: string; placeholder?: string }[] = [
  { key: "name", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/..." },
  { key: "github", label: "GitHub", placeholder: "https://github.com/..." },
  { key: "website", label: "Website", placeholder: "https://..." },
];

function Field({ label, value, placeholder, onCommit }: { label: string; value: string | null; placeholder?: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value ?? "");

  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => text.trim() !== (value ?? "") && onCommit(text.trim())}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

export default function PersonalInfoEditor({
  personalInformation,
  onUpdate,
}: {
  personalInformation: DynamicPersonalInformation;
  onUpdate: (updates: Partial<DynamicPersonalInformation>) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setCollapsed((value) => !value)} className="flex w-full items-center justify-between p-4 text-left">
        <h3 className="text-sm font-bold text-slate-800">Personal Information</h3>
        <span className="text-slate-400">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <Field
              // Remounts (resetting local input state) only when this
              // value actually changes from outside — same pattern as
              // EntryEditor's FieldInput.
              key={`${field.key}-${personalInformation[field.key] ?? ""}`}
              label={field.label}
              value={personalInformation[field.key]}
              placeholder={field.placeholder}
              onCommit={(value) => onUpdate({ [field.key]: value })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
