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

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setLoading(true);

    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: userMessage }),
    });

    const data = await response.json();

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.answer || data.error || "Something went wrong.",
      },
    ]);

    setLoading(false);
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="h-[420px] space-y-4 overflow-y-auto rounded-xl border p-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[80%] rounded-xl bg-blue-600 p-3 text-white"
                : "mr-auto max-w-[80%] rounded-xl bg-slate-100 p-3 text-slate-900"
            }
          >
            {message.content}
          </div>
        ))}

        {loading && <p className="text-sm text-gray-500">Thinking...</p>}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Zafrul's skills, projects, blogs..."
          className="flex-1 rounded-xl border px-4 py-3"
        />

        <button className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white">
          Send
        </button>
      </form>
    </div>
  );
}