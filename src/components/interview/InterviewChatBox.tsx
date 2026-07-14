"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

type InterviewSource = {
  category: string;
  topic: string;
  question: string;
  difficulty: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: InterviewSource[];
};

const SUGGESTED_QUESTIONS = [
  "Explain JVM",
  "Difference HashMap vs Hashtable",
  "Explain Spring IOC",
  "Explain Angular Signals",
  "Kafka Consumer Group",
  "Difference PUT vs PATCH",
  "Explain CAP Theorem",
];

const RECENT_QUESTIONS_LIMIT = 5;

export default function InterviewChatBox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [recentQuestions, setRecentQuestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function ask(question: string) {
    if (!question.trim() || loading) return;

    const userMessage = question.trim();

    // Reuses the same message-history shape and /api/ai/chat endpoint as
    // the site-wide ChatBox — no separate conversation system.
    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: userMessage },
    ];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setRecentQuestions((prev) =>
      [userMessage, ...prev.filter((q) => q !== userMessage)].slice(
        0,
        RECENT_QUESTIONS_LIMIT
      )
    );

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = await response.json();

      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: data.answer || data.error || "Something went wrong.",
          sources: Array.isArray(data.interviewSources)
            ? data.interviewSources
            : undefined,
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    ask(input);
  }

  function handleClearChat() {
    setMessages([]);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-6 py-4 text-white">
        <div>
          <h2 className="text-xl font-bold">Interview AI Chat</h2>
          <p className="text-sm text-slate-300">
            Ask any technical interview question — Java, Spring, Angular,
            React, Node, Databases, Kafka, System Design, Behavioral
          </p>
        </div>

        <button
          type="button"
          onClick={handleClearChat}
          className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
        >
          Clear Chat
        </button>
      </div>

      {(SUGGESTED_QUESTIONS.length > 0 || recentQuestions.length > 0) && (
        <div className="space-y-3 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Suggested Questions
            </p>

            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => ask(question)}
                  disabled={loading}
                  className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          {recentQuestions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Recent Questions
              </p>

              <div className="flex flex-wrap gap-2">
                {recentQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => ask(question)}
                    disabled={loading}
                    className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="h-[560px] space-y-5 overflow-y-auto bg-slate-50 p-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h3 className="text-2xl font-bold text-slate-900">
              Ready to prep for your next interview?
            </h3>

            <p className="mt-3 text-slate-600">
              Ask a technical question and I&apos;ll answer from Zafrul&apos;s
              imported interview question bank first, falling back to general
              knowledge when needed.
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 px-5 py-3 text-white shadow-sm"
                : "mr-auto max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-5 py-4 text-slate-800 shadow-sm"
            }
          >
            {message.role === "user" ? (
              <p className="whitespace-pre-line leading-7">
                {message.content}
              </p>
            ) : (
              <div className="prose prose-sm max-w-none prose-pre:p-0">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");

                      return match ? (
                        <SyntaxHighlighter
                          language={match[1]}
                          style={vscDarkPlus}
                          customStyle={{
                            margin: "0.75rem 0",
                            borderRadius: "0.75rem",
                            fontSize: "13px",
                          }}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {message.sources && message.sources.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Sources
                </p>

                <div className="space-y-2">
                  {message.sources.map((source, sourceIndex) => (
                    <div
                      key={sourceIndex}
                      className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"
                    >
                      <span className="font-semibold text-slate-800">
                        {source.category}
                      </span>{" "}
                      &rsaquo; {source.topic} &rsaquo; {source.question}

                      <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700">
                        {source.difficulty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="mr-auto max-w-[75%] rounded-2xl border border-slate-200 bg-white px-5 py-4 text-slate-600 shadow-sm">
            Thinking...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-3 border-t border-slate-200 bg-white p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask an interview question, e.g. Explain JVM memory model..."
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
