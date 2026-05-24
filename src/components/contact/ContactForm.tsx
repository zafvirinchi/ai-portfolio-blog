"use client";

import { FormEvent, useState } from "react";

export default function ContactForm() {
  const [status, setStatus] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Sending...");

    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/contact", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        message: formData.get("message"),
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      setStatus("Message sent successfully.");
      event.currentTarget.reset();
    } else {
      setStatus("Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <input
        name="name"
        required
        placeholder="Your name"
        className="w-full rounded-xl border px-4 py-3"
      />

      <input
        name="email"
        type="email"
        required
        placeholder="Your email"
        className="w-full rounded-xl border px-4 py-3"
      />

      <textarea
        name="message"
        required
        rows={5}
        placeholder="Your message"
        className="w-full rounded-xl border px-4 py-3"
      />

      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
      >
        Send Message
      </button>

      {status && <p className="text-sm text-gray-600">{status}</p>}
    </form>
  );
}