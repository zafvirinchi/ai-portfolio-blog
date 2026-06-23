"use client";

import { FormEvent, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatBox() {
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
          <h2 className="text-xl font-bold">AI Assistant</h2>
          <p className="text-sm text-slate-300">
            Ask about Zafrul&apos;s profile, projects, blogs and interview prep
          </p>
        </div>

        <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-300">
          Online
        </span>
      </div>

      <div className="h-[520px] space-y-5 overflow-y-auto bg-slate-50 p-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h3 className="text-2xl font-bold text-slate-900">
              How can I help you?
            </h3>

            <p className="mt-3 text-slate-600">
              Try asking about Java, Spring Boot, Angular, projects, blogs,
              system design, or Zafrul&apos;s experience.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                Java
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                Spring Boot
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                Angular
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                Projects
              </span>
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
          placeholder="Ask about Java, Spring Boot, Angular, projects..."
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