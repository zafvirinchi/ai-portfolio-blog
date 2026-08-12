"use client";

import { useState } from "react";

// Phase 15 Milestone 2 — a reusable chip-style editor for "list"-typed
// fields (Technologies, Achievements, Skills, Interests, ...), used by
// every such field via EntryEditor's FieldInput rather than each field
// duplicating its own add/remove UI. Commits the whole array on every
// add/remove — these are discrete clicks, not keystrokes, so this
// doesn't reintroduce the per-keystroke-save problem on-blur commits
// elsewhere in the builder avoid.
export default function ArrayFieldEditor({ value, onCommit }: { value: string[]; onCommit: (value: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function addItem() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onCommit([...value, trimmed]);
    setDraft("");
  }

  function removeItem(index: number) {
    onCommit(value.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {value.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
          {item}
          <button type="button" onClick={() => removeItem(index)} aria-label={`Remove ${item}`} className="text-blue-400 hover:text-blue-700">
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addItem();
          }
        }}
        placeholder="Add..."
        className="w-24 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs focus:border-blue-400 focus:outline-none"
      />
      <button type="button" onClick={addItem} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
        + Add
      </button>
    </div>
  );
}
