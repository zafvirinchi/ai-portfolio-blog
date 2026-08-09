"use client";

import { useState } from "react";

import type { RewriteSection, VariantVersion } from "@/lib/ai/resume-rewriter/rewrite-schema";
import type { SectionState } from "@/lib/ai/resume-rewriter/rewrite-types";
import RewriteHistoryPanel from "./RewriteHistoryPanel";
import RewriteVariantPicker from "./RewriteVariantPicker";

type Props = {
  section: RewriteSection;
  label: string;
  state: SectionState | null;
  loading: string | null;
  onRewrite: (itemIndex?: number) => void;
  onAction: (action: "accept" | "reject" | "restore", extra?: Record<string, unknown>) => void;
};

// One generic, parameterized card reused across Summary/Career
// Objective/Experience/Projects/Skills/Achievements/Certifications —
// their accept/reject/variant-picker interaction shape is identical
// even though the rendered content differs by section.

export default function RewriteSectionCard({ section, label, state, loading, onRewrite, onAction }: Props) {
  const [itemSelections, setItemSelections] = useState<Record<number, VariantVersion>>({});

  const isRewriting = loading === section || loading?.startsWith(`${section}-item-`);
  const isRestoring = loading === `${section}-restore`;
  const current = state?.current ?? [];
  const pending = state?.pending ?? null;

  function setSelection(index: number, version: VariantVersion) {
    setItemSelections((prev) => ({ ...prev, [index]: version }));
  }

  function handleAcceptBulk() {
    const itemSelectionsPayload = Object.entries(itemSelections).map(([itemIndex, version]) => ({
      itemIndex: Number(itemIndex),
      version,
    }));
    onAction("accept", { itemSelections: itemSelectionsPayload });
    setItemSelections({});
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onRewrite()}
            disabled={isRewriting}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isRewriting ? "Rewriting..." : pending ? "Generate Again" : "Rewrite"}
          </button>
          {pending && (
            <button
              type="button"
              onClick={() => onAction("reject")}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Reject
            </button>
          )}
        </div>
      </div>

      {!pending && (
        <div className="space-y-1.5 text-sm text-slate-700">
          {current.length > 0 && current.some((line) => line.trim()) ? (
            current.map((line, index) => <p key={index}>{line}</p>)
          ) : (
            <p className="text-slate-400">Nothing here yet.</p>
          )}
        </div>
      )}

      {pending?.variants && (
        <div className="space-y-3">
          <RewriteVariantPicker
            original={typeof pending.itemIndex === "number" ? current[pending.itemIndex] ?? "" : current[0] ?? ""}
            variants={pending.variants}
            selected={itemSelections[0]}
            onSelect={(version) => setSelection(0, version)}
          />
          <button
            type="button"
            onClick={() => onAction("accept", { variantVersion: itemSelections[0] ?? "A" })}
            className="rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700"
          >
            Accept Selected
          </button>
        </div>
      )}

      {pending?.items && (
        <div className="space-y-4">
          {pending.items.map((item, index) => (
            <div key={index} className="rounded-xl border border-slate-100 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400">Item {index + 1}</p>
                <button
                  type="button"
                  onClick={() => onRewrite(index)}
                  disabled={loading === `${section}-item-${index}`}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  Generate Again (this item only)
                </button>
              </div>
              <RewriteVariantPicker
                original={item.original}
                variants={item.variants}
                selected={itemSelections[index]}
                onSelect={(version) => setSelection(index, version)}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={handleAcceptBulk}
            className="rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700"
          >
            Accept Selected
          </button>
        </div>
      )}

      {pending?.projectItems && (
        <div className="space-y-4">
          {pending.projectItems.map((item, index) => (
            <div key={index} className="rounded-xl border border-slate-100 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-400">{item.projectName}</p>
              <div className="space-y-3">
                {item.variants.map((variant) => {
                  const active = (itemSelections[index] ?? item.variants[0]?.version) === variant.version;
                  return (
                    <label
                      key={variant.version}
                      className={`block cursor-pointer rounded-xl border p-4 transition ${
                        active ? "border-blue-400 bg-blue-50/50" : "border-slate-200"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input type="radio" checked={active} onChange={() => setSelection(index, variant.version)} />
                        Version {variant.version}
                      </div>
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">Problem:</span> {variant.problem}
                      </p>
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">Solution:</span> {variant.solution}
                      </p>
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">Technologies:</span> {variant.technologies.join(", ")}
                      </p>
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">Business Value:</span> {variant.businessValue}
                      </p>
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">Impact:</span> {variant.impact}
                      </p>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAcceptBulk}
            className="rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700"
          >
            Accept Selected
          </button>
        </div>
      )}

      {pending?.skillCategories && (
        <div className="space-y-3">
          <div className="space-y-2">
            {pending.skillCategories.map((group) => (
              <div key={group.category}>
                <p className="text-sm font-semibold text-slate-700">{group.category}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {group.skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onAction("accept")}
            className="rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700"
          >
            Accept
          </button>
        </div>
      )}

      {pending && pending.rejectedItems.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {pending.rejectedItems.length} item(s) couldn&apos;t be safely rewritten and were kept as-is —{" "}
          {pending.rejectedItems.map((item) => item.reason).join("; ")}
        </div>
      )}

      {state && state.versions.length > 1 && (
        <RewriteHistoryPanel
          versions={state.versions}
          loading={isRestoring}
          onRestore={(versionIndex) => onAction("restore", { versionIndex })}
        />
      )}
    </div>
  );
}
