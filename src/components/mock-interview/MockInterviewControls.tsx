"use client";

import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";

type Props = {
  session: SessionRecord;
  loading: boolean;
  onAction: (action: string) => void;
};

const BUTTONS: { action: string; label: string }[] = [
  { action: "pause", label: "Pause" },
  { action: "resume", label: "Resume" },
  { action: "skip", label: "Skip Question" },
  { action: "previous", label: "Previous" },
  { action: "next", label: "Next" },
  { action: "harder", label: "Harder Question" },
  { action: "easier", label: "Easier Question" },
  { action: "restart", label: "Restart" },
  { action: "end", label: "End Interview" },
];

export default function MockInterviewControls({ session, loading, onAction }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-700">
        Status: <span className="capitalize text-blue-600">{session.status.replace("_", " ")}</span> — Question{" "}
        {session.currentIndex + 1} of {session.questions.length}
      </p>

      <div className="flex flex-wrap gap-2">
        {BUTTONS.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            disabled={loading || session.status === "completed"}
            onClick={() => onAction(action)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
