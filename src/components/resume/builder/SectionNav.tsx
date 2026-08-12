"use client";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

import type { DynamicResumeDocument, SectionType } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import { ADDABLE_SECTION_TYPES, SECTION_REGISTRY } from "@/lib/ai/resume-versions/dynamic/section-registry";

import SortableItem from "./SortableItem";

// Phase 15 Milestone 1 gave this an at-a-glance overview of every
// section type; Milestone 3 turns it into a second, compact
// drag-and-drop reordering surface for the sections that already
// exist — same underlying `document.sections[].order` field and the
// exact same reorderSections/moveSectionUp/moveSectionDown mutations
// the main section-card list already uses (via onReorder/onMove,
// wired to the same routes in ResumeBuilder.tsx), never a second
// ordering representation. Present sections (including CUSTOM ones —
// they participate exactly like any built-in type, never segregated
// into their own row) are shown in their REAL current order, not the
// registry's fixed declaration order the old static list used.
function jumpTo(sectionId: string) {
  globalThis.document?.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function SectionNav({
  document,
  onAdd,
  onReorder,
  onMove,
}: {
  document: DynamicResumeDocument;
  onAdd: (type: SectionType) => void;
  onReorder: (orderedSectionIds: string[]) => void;
  onMove: (sectionId: string, direction: "up" | "down") => void;
}) {
  const presentSections = [...document.sections].sort((a, b) => a.order - b.order);
  const presentTypes = new Set(document.sections.map((section) => section.type));
  // CUSTOM is never "missing" — a user can always add another one from AddSectionMenu below; it doesn't belong in this quick-add list of not-yet-added fixed types.
  const missingTypes = ADDABLE_SECTION_TYPES.filter((type) => type !== "CUSTOM" && !presentTypes.has(type));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = presentSections.map((section) => section.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Resume Sections</p>

      {presentSections.length > 0 && (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={presentSections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
            <div className="mb-3 space-y-0.5 border-b border-slate-100 pb-3">
              {presentSections.map((section, index) => (
                <SortableItem key={section.id} id={section.id}>
                  {(dragHandleProps) => (
                    <div className="flex items-center gap-1.5 rounded-lg px-1 py-1 hover:bg-slate-50">
                      <button
                        type="button"
                        {...dragHandleProps.attributes}
                        {...dragHandleProps.listeners}
                        aria-label={`Drag to reorder ${section.title} section`}
                        title="Drag to reorder"
                        className="cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                      >
                        ☷
                      </button>
                      <button type="button" onClick={() => jumpTo(section.id)} title="Jump to this section" className="flex flex-1 items-center justify-between text-left text-sm">
                        <span className={section.visible ? "text-slate-700" : "text-slate-400"}>
                          {section.title}
                          {!section.visible && <span className="ml-1 text-[10px] font-semibold uppercase text-slate-400">(hidden)</span>}
                        </span>
                        <span className={`text-xs font-semibold ${section.entries.length > 0 ? "text-green-600" : "text-slate-400"}`}>✓ {section.entries.length}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onMove(section.id, "up")}
                        disabled={index === 0}
                        aria-label={`Move ${section.title} section up`}
                        className="text-slate-300 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onMove(section.id, "down")}
                        disabled={index === presentSections.length - 1}
                        aria-label={`Move ${section.title} section down`}
                        className="text-slate-300 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {missingTypes.length > 0 && (
        <div className="grid gap-1 sm:grid-cols-2">
          {missingTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              title={`Add ${SECTION_REGISTRY[type].label}`}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-slate-400 hover:bg-slate-50"
            >
              <span>{SECTION_REGISTRY[type].label}</span>
              <span className="text-xs font-semibold">0</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
