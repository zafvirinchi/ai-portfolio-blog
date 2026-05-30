// src/components/portfolio/AIAssistantPreview.tsx

import Link from "next/link";

export default function AIAssistantPreview() {
  return (
    <section className="bg-white px-6 py-20">
      <div className="mx-auto max-w-7xl rounded-3xl bg-slate-900 px-8 py-14 text-white">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-400">
          AI Assistant
        </p>

        <h2 className="max-w-3xl text-3xl font-bold md:text-4xl">
          Ask questions about my experience, projects, skills, blogs and interview content.
        </h2>

        <p className="mt-5 max-w-3xl text-slate-300">
          This AI assistant uses RAG to answer based on my professional profile,
          project experience, technical blogs, interview questions and uploaded documents.
        </p>

        <Link
          href="/ai"
          className="mt-8 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Ask AI Assistant
        </Link>
      </div>
    </section>
  );
}