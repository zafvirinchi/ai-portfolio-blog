"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import ChatBox from "@/components/ai/ChatBox";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import MockInterviewSetup from "@/components/mock-interview/MockInterviewSetup";
import MockInterviewControls from "@/components/mock-interview/MockInterviewControls";
import MockInterviewQuestionPanel from "@/components/mock-interview/MockInterviewQuestionPanel";
import MockInterviewLiveFeedback from "@/components/mock-interview/MockInterviewLiveFeedback";
import MockInterviewScore from "@/components/mock-interview/MockInterviewScore";
import MockInterviewReport from "@/components/mock-interview/MockInterviewReport";
import MockInterviewHistory from "@/components/mock-interview/MockInterviewHistory";
import type { LiveFeedback } from "@/lib/ai/mock-interview/feedback-agent";
import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";

interface TurnResponse {
  session: SessionRecord;
  prompt: string;
  liveFeedback: LiveFeedback | null;
}

const SUGGESTIONS = ["Skip this question", "Give me a harder question", "Explain the ideal answer", "End interview"];

function MockInterviewContent() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resumeId");
  const jdMatchId = searchParams.get("jdMatchId");
  const prepId = searchParams.get("prepId") ?? undefined;

  const [session, setSession] = useState<SessionRecord | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [liveFeedback, setLiveFeedback] = useState<LiveFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState("setup");

  function applyTurnResult(result: TurnResponse) {
    setSession(result.session);
    setPrompt(result.prompt);
    setLiveFeedback(result.liveFeedback);
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
      <Tabs key={session ? "in-session" : "pre-session"} tabs={tabs} defaultTabId={activeTabId} />

      {session && (
        <ChatBox
          resumeId={resumeId}
          jdMatchId={jdMatchId}
          prepId={prepId}
          sessionId={session.sessionId}
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
