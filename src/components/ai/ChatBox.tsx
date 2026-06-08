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
    <div className="overflow-hidden rounded-[1.5rem] border border-pink-200 bg-white shadow-xl">
      <div className="flex items-center justify-between bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-4 text-white">
        <div>
          <h2 className="text-xl font-bold">Tona&apos;s Birthday Chat 💐</h2>
          <p className="text-sm text-pink-100">
            Ask anything and unlock your surprise
          </p>
        </div>

        <div className="rounded-full bg-white/20 px-4 py-2 text-sm">
          💖 Online
        </div>
      </div>

      <div className="h-[460px] space-y-5 overflow-y-auto bg-[radial-gradient(circle_at_top_left,_#ffe4ec,_transparent_35%),radial-gradient(circle_at_bottom_right,_#fecdd3,_transparent_30%)] p-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md rounded-2xl border border-pink-200 bg-white/80 p-6 text-center shadow">
            <div className="text-5xl">🌹</div>
            <h3 className="mt-4 text-2xl font-bold text-slate-900">
              Welcome Beautiful
            </h3>
            <p className="mt-2 text-slate-600">
              Start with: <b>Hi, my name is Zafrul</b>
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[78%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3 text-white shadow"
                : "mr-auto max-w-[78%] rounded-2xl rounded-tl-sm border border-pink-100 bg-white px-5 py-4 text-slate-800 shadow"
            }
          >
            <p className="whitespace-pre-line leading-7">{message.content}</p>
          </div>
        ))}

        {loading && (
          <div className="mr-auto max-w-[75%] rounded-2xl border border-pink-100 bg-white px-5 py-4 text-slate-600 shadow">
            Thinking with love... 💕
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 border-t border-pink-100 bg-white p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer here..."
          className="flex-1 rounded-2xl border border-pink-200 px-5 py-3 outline-none focus:border-pink-500"
        />

        <button
          disabled={loading}
          className="rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-7 py-3 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}