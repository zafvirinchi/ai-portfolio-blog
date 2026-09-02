"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

import type { DynamicResumeDocument, SectionType } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import { containsPdfUnsafeCharacters } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-render";
import { getSectionDefinition } from "@/lib/ai/resume-versions/dynamic/section-registry";
import { DEFAULT_TEMPLATE_SETTINGS, TemplateId, TemplateSettings, UpdateTemplateSettingsInput } from "@/lib/ai/resume-versions/templates/template-schema";
import { resolveTemplateStyles } from "@/lib/ai/resume-versions/templates/template-styles";

import AddSectionMenu from "./AddSectionMenu";
import DownloadMenu from "./DownloadMenu";
import PersonalInfoEditor from "./PersonalInfoEditor";
import ResumePreview from "./ResumePreview";
import ResumeQualityPanel from "./ResumeQualityPanel";
import SectionEditor from "./SectionEditor";
import SectionNav from "./SectionNav";
import SortableItem from "./SortableItem";
import TemplateGallery from "./TemplateGallery";
import ThemeControls from "./ThemeControls";

const QUICK_START_SECTION_TYPES: SectionType[] = ["EXPERIENCE", "EDUCATION", "PROJECTS", "SKILLS", "CERTIFICATIONS"];

type BuilderTab = "sections" | "template" | "design";

const TEMPLATE_SETTINGS_SAVE_DEBOUNCE_MS = 600;

// The Resume Builder — a generic, section/entry/field-based editor on
// top of one resume version's dynamic document, now also the home of
// Milestone 14's template/design controls. Every content mutation
// still calls one of the granular structural API routes built in the
// prior milestone; template/theme changes call the new
// /template PATCH route. Both kinds of state update the SAME local
// `document`/`templateSettings` state that the always-visible
// ResumePreview reads from, so the live preview reacts identically no
// matter which tab produced the change (§22).
export default function ResumeBuilder({ versionId }: { versionId: string }) {
  const [document, setDocument] = useState<DynamicResumeDocument | null>(null);
  const [templateSettings, setTemplateSettings] = useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<BuilderTab>("sections");

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [documentResponse, templateResponse] = await Promise.all([
        fetch(`/api/ai/resume/versions/${versionId}/document`),
        fetch(`/api/ai/resume/versions/${versionId}/template`),
      ]);
      const documentData = await documentResponse.json();
      const templateData = await templateResponse.json();
      if (!documentResponse.ok) throw new Error(documentData.error || "Failed to load the resume builder");
      if (!templateResponse.ok) throw new Error(templateData.error || "Failed to load template settings");
      setDocument(documentData.document);
      setTemplateSettings(templateData.templateSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the resume builder.");
    } finally {
      setLoading(false);
    }
  }, [versionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Structural content mutations (sections/entries/custom fields) —
  // unchanged from Milestone 13: every route returns the full version,
  // and sectionsData from that response is always the new source of
  // truth. No debouncing here — these are discrete, one-click actions,
  // not continuous input (§34's debounce concern applies to the design
  // controls below, not to "add section"/"delete entry" etc.).
  const mutate = useCallback(
    async (path: string, options?: RequestInit) => {
      setSaving(true);
      setError(null);
      try {
        const response = await fetch(`/api/ai/resume/versions/${versionId}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...options,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "That change could not be saved");
        if (data.version?.sectionsData) setDocument(data.version.sectionsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That change could not be saved.");
      } finally {
        setSaving(false);
      }
    },
    [versionId]
  );

  // Template/theme changes: update local state (and therefore the live
  // preview) immediately, but debounce the actual PATCH so dragging
  // through, say, 3 accent swatches in a row doesn't fire 3 requests
  // (§34's explicit "debounce persistence if necessary").
  const updateTemplateSettings = useCallback(
    (patch: UpdateTemplateSettingsInput) => {
      setTemplateSettings((current) => ({ ...current, ...patch }));

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true);
        setError(null);
        try {
          const response = await fetch(`/api/ai/resume/versions/${versionId}/template`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Template settings could not be saved");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Template settings could not be saved.");
        } finally {
          setSaving(false);
        }
      }, TEMPLATE_SETTINGS_SAVE_DEBOUNCE_MS);
    },
    [versionId]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading builder...</p>;
  if (error && !document) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!document) return null;

  const sortedSections = [...document.sections].sort((a, b) => a.order - b.order);
  const resolvedStyles = resolveTemplateStyles(templateSettings);

  function moveEntry(sectionId: string, entryId: string, direction: "up" | "down") {
    const section = document!.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const ordered = [...section.entries].sort((a, b) => a.order - b.order).map((e) => e.id);
    const index = ordered.indexOf(entryId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];
    mutate(`/sections/${sectionId}/entries/reorder`, { body: JSON.stringify({ orderedEntryIds: ordered }) });
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = sortedSections.map((section) => section.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    mutate(`/sections/reorder`, { body: JSON.stringify({ orderedSectionIds: arrayMove(ids, oldIndex, newIndex) }) });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {saving && <p className="text-xs font-semibold text-blue-500">Saving...</p>}

        <div className="flex gap-2 border-b border-slate-200">
          {(["sections", "template", "design"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`border-b-2 px-4 py-2 text-sm font-semibold capitalize ${tab === value ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              {value}
            </button>
          ))}
        </div>

        {tab === "sections" && (
          <div className="space-y-4">
            <PersonalInfoEditor
              personalInformation={document.personalInformation}
              onUpdate={(updates) => mutate(`/document`, { method: "PATCH", body: JSON.stringify(updates) })}
            />

            <SectionNav
              document={document}
              onAdd={(type) => mutate(`/sections`, { body: JSON.stringify({ type }) })}
              onReorder={(orderedSectionIds) => mutate(`/sections/reorder`, { body: JSON.stringify({ orderedSectionIds }) })}
              onMove={(sectionId, direction) => mutate(`/sections/${sectionId}/move`, { body: JSON.stringify({ direction }) })}
            />

            {sortedSections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">Your resume is ready to build.</p>
                <p className="mt-1 text-xs text-slate-500">Start with the sections most resumes need — you can add, reorder, or remove any of them later.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {QUICK_START_SECTION_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => mutate(`/sections`, { body: JSON.stringify({ type }) })}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600"
                    >
                      + Add {getSectionDefinition(type).label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <DndContext collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
                <SortableContext items={sortedSections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
                  {sortedSections.map((section) => (
                    <SortableItem key={section.id} id={section.id}>
                      {(dragHandleProps) => (
                        <SectionEditor
                          versionId={versionId}
                          section={section}
                          dragHandleProps={dragHandleProps}
                          onRename={(title) => mutate(`/sections/${section.id}`, { method: "PATCH", body: JSON.stringify({ title }) })}
                          onToggleVisible={() => mutate(`/sections/${section.id}`, { method: "PATCH", body: JSON.stringify({ visible: !section.visible }) })}
                          onRemove={() => mutate(`/sections/${section.id}`, { method: "DELETE" })}
                          onMoveUp={() => mutate(`/sections/${section.id}/move`, { body: JSON.stringify({ direction: "up" }) })}
                          onMoveDown={() => mutate(`/sections/${section.id}/move`, { body: JSON.stringify({ direction: "down" }) })}
                          onUpdateSettings={(settings) => mutate(`/sections/${section.id}`, { method: "PATCH", body: JSON.stringify({ settings }) })}
                          onAddEntry={() => mutate(`/sections/${section.id}/entries`, { body: JSON.stringify({}) })}
                          onUpdateEntry={(entryId, patch) => mutate(`/sections/${section.id}/entries/${entryId}`, { method: "PATCH", body: JSON.stringify(patch) })}
                          onRemoveEntry={(entryId) => mutate(`/sections/${section.id}/entries/${entryId}`, { method: "DELETE" })}
                          onDuplicateEntry={(entryId) => mutate(`/sections/${section.id}/entries/${entryId}/duplicate`)}
                          onMoveEntry={(entryId, direction) => moveEntry(section.id, entryId, direction)}
                          onReorderEntries={(orderedEntryIds) => mutate(`/sections/${section.id}/entries/reorder`, { body: JSON.stringify({ orderedEntryIds }) })}
                          onAddCustomField={(entryId, label, value) => mutate(`/sections/${section.id}/entries/${entryId}/custom-fields`, { body: JSON.stringify({ label, value }) })}
                          onUpdateCustomField={(entryId, fieldId, patch) =>
                            mutate(`/sections/${section.id}/entries/${entryId}/custom-fields/${fieldId}`, { method: "PATCH", body: JSON.stringify(patch) })
                          }
                          onRemoveCustomField={(entryId, fieldId) => mutate(`/sections/${section.id}/entries/${entryId}/custom-fields/${fieldId}`, { method: "DELETE" })}
                        />
                      )}
                    </SortableItem>
                  ))}
                </SortableContext>
              </DndContext>
            )}

            <AddSectionMenu onAdd={(type: SectionType, title?: string) => mutate(`/sections`, { body: JSON.stringify({ type, title }) })} />
          </div>
        )}

        {tab === "template" && <TemplateGallery document={document} currentSettings={templateSettings} onSelect={(templateId: TemplateId) => updateTemplateSettings({ templateId })} />}

        {tab === "design" && (
          <div className="space-y-4">
            <ThemeControls settings={templateSettings} onChange={updateTemplateSettings} />
            <ResumeQualityPanel document={document} styles={resolvedStyles} />
          </div>
        )}
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <DownloadMenu versionId={versionId} atsFriendliness={resolvedStyles.atsFriendliness} hasPdfUnsafeCharacters={containsPdfUnsafeCharacters(document)} />
        <ResumePreview document={document} templateSettings={templateSettings} />
      </div>
    </div>
  );
}
