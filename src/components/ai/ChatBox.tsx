"use client";

import { FormEvent, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatBox() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: input }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.answer || "Sorry, I could not answer that.",
      },
    ]);

    setLoading(false);
  }

  return (
    <div className="mt-8 rounded-xl border bg-white p-4">
      <div className="min-h-[300px] space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "rounded-lg bg-blue-50 p-3 text-blue-900"
                : "rounded-lg bg-gray-100 p-3 text-gray-800"
            }
          >
            <strong>{message.role === "user" ? "You" : "AI"}:</strong>{" "}
            {message.content}
          </div>
        ))}

        {loading && <p className="text-sm text-gray-500">AI is thinking...</p>}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Java, Spring Boot, Angular..."
          className="flex-1 rounded-xl border px-4 py-3"
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}