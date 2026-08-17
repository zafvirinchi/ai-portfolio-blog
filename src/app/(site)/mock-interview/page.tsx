"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import ChatBox from "@/components/ai/ChatBox";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import MockInterviewSetup from "@/components/mock-interview/MockInterviewSetup";
import MockInterviewControls from "@/components/mock-interview/MockInterviewControls";
import MockInterviewQuestionPanel from "@/components/mock-interview/MockInterviewQuestionPanel";
import MockInterviewLiveFeedback from "@/components/mock-interview/MockInterviewLiveFeedback";
import MockInterviewScore from "@/components/mock-interview/MockInterviewScore";
import MockInterviewReport from "@/components/mock-interview/MockInterviewReport";
import MockInterviewHistory from "@/components/mock-interview/MockInterviewHistory";
import MockInterviewDebrief from "@/components/mock-interview/MockInterviewDebrief";
import MockInterviewProgress from "@/components/mock-interview/MockInterviewProgress";
import { recordCompletedSession } from "@/lib/ai/mock-interview/practice-history-store";
import type { LiveFeedback } from "@/lib/ai/mock-interview/feedback-agent";
import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";

interface TurnResponse {
  session: SessionRecord;
  prompt: string;
  liveFeedback: LiveFeedback | null;
  completed: boolean;
}

const SUGGESTIONS = ["Skip this question", "Give me a harder question", "Explain the ideal answer", "End interview"];

function MockInterviewContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resumeId");
  const jdMatchId = searchParams.get("jdMatchId");
  const prepId = searchParams.get("prepId") ?? undefined;
  const sessionIdParam = searchParams.get("sessionId");

  const [session, setSession] = useState<SessionRecord | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [liveFeedback, setLiveFeedback] = useState<LiveFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState("setup");
  // Phase 21 Milestone 1 — audit finding: an in-progress session's own id
  // was never written to the URL, only ever held in this component's
  // useState. A page refresh mid-interview silently reset the UI to the
  // Setup tab even though the server-side session (in-memory, 2h TTL —
  // see session-service.ts) was still alive, and the only way forward
  // was clicking "Start" again — which re-invokes the requireQuota-gated
  // creation route and burns a second MOCK_INTERVIEWS unit for work
  // already in progress. Fixed by round-tripping sessionId through the
  // URL (mirroring how resumeId/jdMatchId/prepId already do) and
  // restoring from the existing GET /api/ai/mock-interview/[sessionId]
  // route on mount when present.
  const [restoringSession, setRestoringSession] = useState(!!sessionIdParam);
  // Phase 17 Milestone 6 — Tabs (ui/Tabs.tsx) is intentionally uncontrolled
  // and only reads `defaultTabId` once per mount; bumping this key forces a
  // fresh mount so the "View Latest Debrief" CTA (MockInterviewProgress)
  // can jump straight to the Debrief tab without a general Tabs control API.
  const [tabsRemountKey, setTabsRemountKey] = useState(0);

  function recordIfCompleted(record: SessionRecord, completed: boolean) {
    // Phase 17 Milestone 6 — remember this session's id (never its score/
    // content) so the Progress tab can ask the server about it later, even
    // after a restart or page reload. See practice-history-store.ts.
    if (completed && resumeId && jdMatchId) {
      recordCompletedSession({ sessionId: record.sessionId, prepId: record.prepId, resumeId, jdMatchId });
    }
  }

  function applyTurnResult(result: TurnResponse) {
    setSession(result.session);
    setPrompt(result.prompt);
    setLiveFeedback(result.liveFeedback);
    recordIfCompleted(result.session, result.completed);
    setSessionUrlParam(result.session.sessionId);
  }

  function setSessionUrlParam(sessionId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (sessionId) {
      params.set("sessionId", sessionId);
    } else {
      params.delete("sessionId");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Restore an in-progress session from the URL on mount (refresh, or a
  // returning visit within the server's 2h TTL) — the session record
  // itself already carries enough state (questions/currentIndex/status)
  // for MockInterviewQuestionPanel to render correctly with `prompt`
  // left null (it already falls back to the session's current question
  // text). If the id is stale/expired, drop it from the URL rather than
  // retrying forever.
  useEffect(() => {
    if (!sessionIdParam || session) return;

    let cancelled = false;

    fetch(`/api/ai/mock-interview/${sessionIdParam}`)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setSessionUrlParam(null);
          return;
        }
        const record: SessionRecord = await response.json();
        setSession(record);
        setActiveTabId(record.status === "completed" ? "debrief" : "interview");
      })
      .catch(() => {
        if (!cancelled) setSessionUrlParam(null);
      })
      .finally(() => {
        if (!cancelled) setRestoringSession(false);
      });

    return () => {
      cancelled = true;
    };
    // Intentionally runs once per distinct sessionIdParam value only —
    // re-running on every render (e.g. from `session` changing after a
    // successful restore) would re-fetch pointlessly; the `session` guard
    // above already prevents that without needing it in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdParam]);

  // Phase 17 Milestone 7 — audit finding: ChatBox can drive this exact
  // session (skip/end/restart/etc, see interview.tool.ts) entirely outside
  // this page's own UI, but had no way to tell this page its session state
  // just changed server-side — leaving Score/Report/Debrief showing stale
  // (sometimes permanently "not completed yet") data after an interview
  // was actually ended via chat, and silently skipping Milestone 6's
  // practice-history recording for that session entirely. Re-fetches the
  // authoritative record after every chat turn and reconciles both.
  async function resyncSessionFromChat() {
    if (!session) return;

    try {
      const response = await fetch(`/api/ai/mock-interview/${session.sessionId}`);
      if (!response.ok) return;

      const record: SessionRecord = await response.json();
      setSession(record);
      recordIfCompleted(record, record.status === "completed" && record.report !== null);
    } catch {
      // Best-effort resync — the next explicit UI action (or chat turn) will retry.
    }
  }

  async function callControl(action: string) {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/mock-interview/${session.sessionId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Action failed");
      }

      if ("session" in data) {
        applyTurnResult(data);
      } else {
        setSession(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnswer(answerText: string) {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/mock-interview/${session.sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit answer");
      }

      applyTurnResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer.");
    } finally {
      setLoading(false);
    }
  }

  if (restoringSession) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="status">
        <p className="text-lg font-semibold text-slate-900">Resuming your interview session...</p>
        <p className="mt-2 text-sm text-slate-600">Reconnecting to your in-progress mock interview.</p>
      </div>
    );
  }

  if (!resumeId || !jdMatchId) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Upload a resume and match it against a job first</p>
        <p className="mt-2 text-sm text-slate-600">
          A mock interview needs a parsed resume and a job description match to ask relevant, personalized questions.
        </p>
        <Link
          href="/resume-analyzer"
          className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to Resume Analyzer
        </Link>
      </div>
    );
  }

  const tabs: TabItem[] = [
    {
      id: "setup",
      label: "Setup",
      content: (
        <MockInterviewSetup
          resumeId={resumeId}
          jdMatchId={jdMatchId}
          prepId={prepId}
          hasSession={session !== null}
          onStarted={(result) => {
            applyTurnResult(result);
            setActiveTabId("interview");
          }}
        />
      ),
    },
    {
      id: "interview",
      label: "Interview",
      disabled: !session,
      content: session ? (
        <div className="space-y-6">
          <MockInterviewControls session={session} loading={loading} onAction={callControl} />
          <MockInterviewQuestionPanel session={session} prompt={prompt} loading={loading} error={error} onSubmitAnswer={handleAnswer} />
        </div>
      ) : null,
    },
    {
      id: "live-feedback",
      label: "Live Feedback",
      disabled: !session,
      content: <MockInterviewLiveFeedback feedback={liveFeedback} />,
    },
    {
      id: "score",
      label: "Score",
      disabled: !session,
      content: session ? <MockInterviewScore session={session} /> : null,
    },
    {
      id: "report",
      label: "Report",
      disabled: !session,
      content: session ? <MockInterviewReport session={session} /> : null,
    },
    {
      id: "debrief",
      label: "Debrief",
      disabled: !session,
      content: session ? <MockInterviewDebrief key={session.sessionId} session={session} resumeId={resumeId} jdMatchId={jdMatchId} prepId={prepId} /> : null,
    },
    {
      id: "progress",
      label: "Progress",
      // Not gated on `!session` — practice history is about PAST completed
      // sessions for this resume/JD context, independently of whether one
      // happens to be active right now.
      content: (
        <MockInterviewProgress
          resumeId={resumeId}
          jdMatchId={jdMatchId}
          prepId={prepId}
          latestSessionId={session?.sessionId ?? null}
          onViewLatestDebrief={() => {
            setActiveTabId("debrief");
            setTabsRemountKey((key) => key + 1);
          }}
        />
      ),
    },
    {
      id: "history",
      label: "History",
      disabled: !session,
      content: session ? <MockInterviewHistory session={session} /> : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Remounts exactly once, the moment a session starts, so the tab
          selection jumps from Setup to Interview — Tabs is otherwise
          uncontrolled and shouldn't reset on every subsequent action. */}
      <Tabs key={`${session ? "in-session" : "pre-session"}-${tabsRemountKey}`} tabs={tabs} defaultTabId={activeTabId} />

      {session && (
        <ChatBox
          resumeId={resumeId}
          jdMatchId={jdMatchId}
          prepId={prepId}
          sessionId={session.sessionId}
          onAfterMessage={resyncSessionFromChat}
          title="Mock Interview Assistant"
          subtitle="Type your answer, or ask to skip, go harder, explain the better answer, or end the interview"
          placeholder="Type your answer, or say 'skip', 'end interview'..."
          suggestions={SUGGESTIONS}
          emptyStateTitle="Chat alongside your interview"
          emptyStateBody="You can also answer directly in the Interview tab above."
        />
      )}
    </div>
  );
}

export default function MockInterviewPage() {
  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Mock Interview</p>

          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">Practice with a real, AI-driven interview</h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            One question at a time, evaluated as you answer — with follow-ups, live feedback, and a full readiness report at the
            end.
          </p>
        </div>

        <Suspense fallback={null}>
          <MockInterviewContent />
        </Suspense>
      </div>
    </section>
  );
}
