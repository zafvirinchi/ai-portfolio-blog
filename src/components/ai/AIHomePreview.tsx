import Link from "next/link";

export default function AIHomePreview() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="rounded-3xl bg-slate-900 p-10 text-white md:p-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
            AI Assistant
          </p>

          <h2 className="mt-4 max-w-3xl text-4xl font-bold">
            Ask questions about my experience, projects, blogs and interview
            preparation.
          </h2>

          <p className="mt-5 max-w-3xl text-lg text-slate-300">
            Powered by RAG documents, blogs, interview questions and my
            professional profile.
          </p>

          <Link
            href="/ai"
            className="mt-8 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Open AI Assistant
          </Link>
        </div>
      </div>
    </section>
  );
}