"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface DragHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

// One generic drag-and-drop wrapper shared by the section list and every
// section's entry list — @dnd-kit's useSortable() needs a DOM node ref,
// transform, and transition on the item itself, but SectionEditor/
// EntryEditor shouldn't need to know anything about @dnd-kit. This
// component owns all of that and hands the row only a `dragHandleProps`
// object to spread onto a small drag-handle button, keeping the two
// editor components' existing code (and their tests) untouched.
export default function SortableItem({ id, children }: { id: string; children: (dragHandleProps: DragHandleProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}
