"use client";

import { FormEvent, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatBoxProps = {
  /** When set, resume-aware questions are answered using this uploaded resume (see /resume-analyzer). */
  resumeId?: string;
  /** When set alongside resumeId, resume-aware questions also use this JD match result (see /resume-analyzer). */
  jdMatchId?: string;
  /** When set, resume/interview-aware questions also use this generated interview-prep report (see /interview-preparation). */
  prepId?: string;
  /** When set, a mock interview session is active (see /mock-interview) — chat can drive it ("ask next question", "evaluate my answer", "end interview") or treat a plain message as the candidate's answer. */
  sessionId?: string;
  /** When set, a resume-rewrite session is active (see /resume-rewriter) — chat can drive style/section-targeted rewrite requests. */
  rewriteId?: string;
  /** When set, a cover-letter session is active (see /cover-letter) — chat can drive letter/email/LinkedIn generation requests. */
  coverLetterId?: string;
  /** When set, a LinkedIn optimizer session is active (see /linkedin-optimizer) — chat can drive headline/about/SEO/networking-message generation requests. */
  linkedinId?: string;
  /** When true, the Recruiter Workspace is active (see /recruiter) — chat can search/compare/rank/recommend candidates. No session ID exists for this one; the workspace itself is the singleton. */
  recruiterMode?: boolean;
  /** When true, the Recruitment Pipeline is active (see /recruitment) — chat can query jobs, pipeline stages, interviews, and hiring funnel data. No session ID exists for this one either. */
  recruitmentMode?: boolean;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  suggestions?: string[];
  emptyStateTitle?: string;
  emptyStateBody?: string;
};

export default function ChatBox({
  resumeId,
  jdMatchId,
  prepId,
  sessionId,
  rewriteId,
  coverLetterId,
  linkedinId,
  recruiterMode,
  recruitmentMode,
  title = "AI Assistant",
  subtitle = "Ask about Zafrul's profile, projects, blogs and interview prep",
  placeholder = "Ask about Java, Spring Boot, Angular, projects...",
  suggestions = ["Java", "Spring Boot", "Angular", "Projects"],
  emptyStateTitle = "How can I help you?",
  emptyStateBody = "Try asking about Java, Spring Boot, Angular, projects, blogs, system design, or Zafrul's experience.",
}: ChatBoxProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!input.trim()) return;

    const userMessage = input.trim();

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: userMessage },
    ];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
          ...(resumeId ? { resumeId } : {}),
          ...(jdMatchId ? { jdMatchId } : {}),
          ...(prepId ? { prepId } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(rewriteId ? { rewriteId } : {}),
          ...(coverLetterId ? { coverLetterId } : {}),
          ...(linkedinId ? { linkedinId } : {}),
          ...(recruiterMode ? { recruiterMode: true } : {}),
          ...(recruitmentMode ? { recruitmentMode: true } : {}),
        }),
      });

      const data = await response.json();

      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: data.answer || data.error || "Something went wrong.",
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-6 py-4 text-white">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-slate-300">{subtitle}</p>
        </div>

        <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-300">
          Online
        </span>
      </div>

      <div className="h-[520px] space-y-5 overflow-y-auto bg-slate-50 p-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h3 className="text-2xl font-bold text-slate-900">
              {emptyStateTitle}
            </h3>

            <p className="mt-3 text-slate-600">{emptyStateBody}</p>

            <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
              {suggestions.map((suggestion) => (
                <span
                  key={suggestion}
                  className="rounded-full bg-blue-50 px-3 py-1 text-blue-700"
                >
                  {suggestion}
                </span>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[78%] rounded-2xl rounded-tr-sm bg-blue-600 px-5 py-3 text-white shadow-sm"
                : "mr-auto max-w-[78%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-5 py-4 text-slate-800 shadow-sm"
            }
          >
            <p className="whitespace-pre-line leading-7">{message.content}</p>
          </div>
        ))}

        {loading && (
          <div className="mr-auto max-w-[75%] rounded-2xl border border-slate-200 bg-white px-5 py-4 text-slate-600 shadow-sm">
            Thinking...
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-3 border-t border-slate-200 bg-white p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-slate-300 px-5 py-3 outline-none focus:border-blue-500"
        />

        <button
          disabled={loading}
          className="rounded-xl bg-blue-600 px-7 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}