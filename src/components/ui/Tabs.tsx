"use client";

import { ReactNode, useState } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

type Props = {
  tabs: TabItem[];
  defaultTabId?: string;
};

// Minimal, dependency-free tab primitive (no tabs component existed
// anywhere in the codebase before this) — Tailwind only, matching the
// existing slate/blue palette used throughout src/components/resume/*.
export default function Tabs({ tabs, defaultTabId }: Props) {
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id);
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab?.id}
            disabled={tab.disabled}
            onClick={() => setActiveId(tab.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab.id === activeTab?.id
                ? "bg-blue-600 text-white"
                : tab.disabled
                  ? "cursor-not-allowed text-slate-300"
                  : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-6">
        {activeTab?.content}
      </div>
    </div>
  );
}
