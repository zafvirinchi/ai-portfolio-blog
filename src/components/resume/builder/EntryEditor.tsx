"use client";

import { useState } from "react";

import type { CustomField, FieldValue, ResumeEntry, SectionType } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import { getSectionDefinition, type FieldDefinition } from "@/lib/ai/resume-versions/dynamic/section-registry";

import ArrayFieldEditor from "./ArrayFieldEditor";
import type { DragHandleProps } from "./SortableItem";

// Generic, registry-driven entry editor — renders one <input>/<textarea>/
// checkbox/chip-list per field the section-registry declares for this
// entry's section type (never a per-section-type hard-coded form), plus
// the entry's own custom fields. Text-field edits commit on blur (not
// per keystroke); "list" fields (via ArrayFieldEditor) commit per
// add/remove click — neither hammers the PATCH route while the user is
// still typing.

function toStringArray(value: FieldValue | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function FieldInput({
  definition,
  value,
  hidden,
  onCommit,
  onToggleHidden,
}: {
  definition: FieldDefinition;
  value: FieldValue | undefined;
  hidden: boolean;
  onCommit: (value: FieldValue) => void;
  onToggleHidden: () => void;
}) {
  // No external-value-changed effect here: FieldInput is remounted (via a
  // value-derived `key` set by the caller) whenever the committed value
  // changes from outside, which is the recommended way to reset local
  // input state without a setState-in-effect anti-pattern.
  const [text, setText] = useState(typeof value === "string" ? value : "");

  if (definition.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value === true} onChange={(event) => onCommit(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        {definition.label}
      </label>
    );
  }

  return (
    <div className={hidden ? "opacity-50" : ""}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{definition.label}</label>
        <button type="button" onClick={onToggleHidden} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">
          {hidden ? "Hidden — show" : "Hide"}
        </button>
      </div>
      {definition.type === "list" ? (
        <ArrayFieldEditor value={toStringArray(value)} onCommit={onCommit} />
      ) : definition.type === "textarea" ? (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => onCommit(text)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      ) : (
        <input
          type={definition.type === "date" ? "text" : definition.type === "url" ? "url" : "text"}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => onCommit(text)}
          placeholder={definition.type === "date" ? "e.g. Jan 2022" : undefined}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}

function CustomFieldRow({
  field,
  onUpdate,
  onRemove,
}: {
  field: CustomField;
  onUpdate: (patch: { label?: string; value?: string; visible?: boolean }) => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [value, setValue] = useState(field.value);

  return (
    <div className={`flex items-start gap-2 ${field.visible ? "" : "opacity-50"}`}>
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onBlur={() => label.trim() && onUpdate({ label: label.trim() })}
        className="w-1/3 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        placeholder="Field label"
      />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onUpdate({ value })}
        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        placeholder="Value"
      />
      <button type="button" onClick={() => onUpdate({ visible: !field.visible })} className="whitespace-nowrap text-[11px] font-semibold text-slate-400 hover:text-slate-600">
        {field.visible ? "Hide" : "Show"}
      </button>
      <button type="button" onClick={onRemove} className="text-[11px] font-semibold text-red-500 hover:text-red-700">
        Remove
      </button>
    </div>
  );
}

export default function EntryEditor({
  sectionType,
  entry,
  dragHandleProps,
  onUpdate,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onAddCustomField,
  onUpdateCustomField,
  onRemoveCustomField,
}: {
  sectionType: SectionType;
  entry: ResumeEntry;
  dragHandleProps?: DragHandleProps;
  onUpdate: (patch: { fields?: Record<string, FieldValue>; hiddenFieldKeys?: string[]; visible?: boolean }) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddCustomField: (label: string, value: string) => void;
  onUpdateCustomField: (fieldId: string, patch: { label?: string; value?: string; visible?: boolean }) => void;
  onRemoveCustomField: (fieldId: string) => void;
}) {
  const definition = getSectionDefinition(sectionType);
  const [addingCustomField, setAddingCustomField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  function toggleFieldHidden(key: string) {
    const hidden = entry.hiddenFieldKeys.includes(key);
    onUpdate({ hiddenFieldKeys: hidden ? entry.hiddenFieldKeys.filter((k) => k !== key) : [...entry.hiddenFieldKeys, key] });
  }

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/60 p-4 ${entry.visible ? "" : "opacity-60"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              className="cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
              aria-label="Drag to reorder entry"
              title="Drag to reorder"
            >
              ☰
            </button>
          )}
          <button type="button" onClick={() => onUpdate({ visible: !entry.visible })} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">
            {entry.visible ? "Visible" : "Hidden — show"}
          </button>
        </div>
        <div className="flex gap-3 text-[11px] font-semibold">
          <button type="button" onClick={onMoveUp} className="text-slate-400 hover:text-slate-700">
            ↑ Move Up
          </button>
          <button type="button" onClick={onMoveDown} className="text-slate-400 hover:text-slate-700">
            ↓ Move Down
          </button>
          <button type="button" onClick={onDuplicate} className="text-blue-500 hover:text-blue-700">
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Delete this entry? This cannot be undone.")) onRemove();
            }}
            className="text-red-500 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      {definition.entryFields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {definition.entryFields.map((field) => (
            <div key={field.key} className={field.type === "textarea" || field.type === "list" ? "sm:col-span-2" : ""}>
              <FieldInput
                // Remounts (resetting local input state) only when the
                // committed value actually changes from outside — never
                // mid-typing, since onChange only updates local state.
                key={JSON.stringify(entry.fields[field.key] ?? null)}
                definition={field}
                value={entry.fields[field.key]}
                hidden={entry.hiddenFieldKeys.includes(field.key)}
                onCommit={(value) => onUpdate({ fields: { [field.key]: value } })}
                onToggleHidden={() => toggleFieldHidden(field.key)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custom Fields</p>
        {entry.customFields.map((field) => (
          <CustomFieldRow key={field.id} field={field} onUpdate={(patch) => onUpdateCustomField(field.id, patch)} onRemove={() => onRemoveCustomField(field.id)} />
        ))}

        {addingCustomField ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newFieldLabel}
              onChange={(event) => setNewFieldLabel(event.target.value)}
              placeholder="Field label (e.g. Client)"
              className="w-1/3 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                if (!newFieldLabel.trim()) return;
                onAddCustomField(newFieldLabel.trim(), "");
                setNewFieldLabel("");
                setAddingCustomField(false);
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Add
            </button>
            <button type="button" onClick={() => setAddingCustomField(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAddingCustomField(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
            + Add Custom Field
          </button>
        )}
      </div>
    </div>
  );
}
