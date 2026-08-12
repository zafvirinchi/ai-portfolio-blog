"use client";

import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

import type { FieldValue, ResumeSection } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import { getSectionDefinition } from "@/lib/ai/resume-versions/dynamic/section-registry";

import EntryEditor from "./EntryEditor";
import SortableItem, { type DragHandleProps } from "./SortableItem";

export default function SectionEditor({
  section,
  dragHandleProps,
  onRename,
  onToggleVisible,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUpdateSettings,
  onAddEntry,
  onUpdateEntry,
  onRemoveEntry,
  onDuplicateEntry,
  onMoveEntry,
  onReorderEntries,
  onAddCustomField,
  onUpdateCustomField,
  onRemoveCustomField,
}: {
  section: ResumeSection;
  dragHandleProps?: DragHandleProps;
  onRename: (title: string) => void;
  onToggleVisible: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateSettings: (settings: { showTitle?: boolean; showDivider?: boolean }) => void;
  onAddEntry: () => void;
  onUpdateEntry: (entryId: string, patch: { fields?: Record<string, FieldValue>; hiddenFieldKeys?: string[]; visible?: boolean }) => void;
  onRemoveEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onMoveEntry: (entryId: string, direction: "up" | "down") => void;
  onReorderEntries: (orderedEntryIds: string[]) => void;
  onAddCustomField: (entryId: string, label: string, value: string) => void;
  onUpdateCustomField: (entryId: string, fieldId: string, patch: { label?: string; value?: string; visible?: boolean }) => void;
  onRemoveCustomField: (entryId: string, fieldId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);
  const [showSettings, setShowSettings] = useState(false);
  const definition = getSectionDefinition(section.type);
  const sortedEntries = [...section.entries].sort((a, b) => a.order - b.order);

  function handleEntryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = sortedEntries.map((entry) => entry.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    onReorderEntries(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <div id={`section-${section.id}`} className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${section.visible ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <div className="flex min-w-0 items-center gap-2">
          {dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              className="cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
              aria-label={`Drag to reorder ${section.title} section`}
              title="Drag to reorder"
            >
              ☰
            </button>
          )}
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="text-slate-400 hover:text-slate-600">
            {collapsed ? "▸" : "▾"}
          </button>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (titleDraft.trim() && titleDraft.trim() !== section.title) onRename(titleDraft.trim());
              }}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm font-bold"
            />
          ) : (
            <h3 className="truncate text-sm font-bold text-slate-800">
              {section.title} <span className="ml-1 text-[10px] font-semibold uppercase text-slate-400">({definition.label})</span>
            </h3>
          )}
          {!editingTitle && (
            <button type="button" onClick={() => setEditingTitle(true)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">
              Rename
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
          <button type="button" onClick={onMoveUp} aria-label={`Move ${section.title} section up`} className="text-slate-400 hover:text-slate-700">
            ↑ Move Up
          </button>
          <button type="button" onClick={onMoveDown} aria-label={`Move ${section.title} section down`} className="text-slate-400 hover:text-slate-700">
            ↓ Move Down
          </button>
          <button type="button" onClick={onToggleVisible} className="text-slate-500 hover:text-slate-700">
            {section.visible ? "👁 Hide Section" : "🚫 Show Section"}
          </button>
          <div className="relative">
            <button type="button" onClick={() => setShowSettings((value) => !value)} className="text-slate-400 hover:text-slate-700">
              ⋮ Settings
            </button>
            {showSettings && (
              <div className="absolute right-0 top-6 z-10 w-48 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <label className="flex items-center gap-2 text-xs font-normal text-slate-600">
                  <input type="checkbox" checked={section.settings.showTitle} onChange={(event) => onUpdateSettings({ showTitle: event.target.checked })} />
                  Show section title
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs font-normal text-slate-600">
                  <input type="checkbox" checked={section.settings.showDivider} onChange={(event) => onUpdateSettings({ showDivider: event.target.checked })} />
                  Show divider line
                </label>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete the "${section.title}" section and all its entries? This cannot be undone.`)) onRemove();
            }}
            className="text-red-500 hover:text-red-700"
          >
            Delete Section
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-3 p-4">
          {sortedEntries.length === 0 && <p className="text-sm text-slate-400">No entries yet.</p>}

          <DndContext collisionDetection={closestCenter} onDragEnd={handleEntryDragEnd}>
            <SortableContext items={sortedEntries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
              {sortedEntries.map((entry) => (
                <SortableItem key={entry.id} id={entry.id}>
                  {(entryDragHandleProps) => (
                    <EntryEditor
                      sectionType={section.type}
                      entry={entry}
                      dragHandleProps={entryDragHandleProps}
                      onUpdate={(patch) => onUpdateEntry(entry.id, patch)}
                      onRemove={() => onRemoveEntry(entry.id)}
                      onDuplicate={() => onDuplicateEntry(entry.id)}
                      onMoveUp={() => onMoveEntry(entry.id, "up")}
                      onMoveDown={() => onMoveEntry(entry.id, "down")}
                      onAddCustomField={(label, value) => onAddCustomField(entry.id, label, value)}
                      onUpdateCustomField={(fieldId, patch) => onUpdateCustomField(entry.id, fieldId, patch)}
                      onRemoveCustomField={(fieldId) => onRemoveCustomField(entry.id, fieldId)}
                    />
                  )}
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>

          <button type="button" onClick={onAddEntry} className="rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600">
            + Add {definition.defaultEntryLabel}
          </button>
        </div>
      )}
    </div>
  );
}
