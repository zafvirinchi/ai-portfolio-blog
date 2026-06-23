import ChatBox from "@/components/ai/ChatBox";

export default function AIPage() {
  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            AI Portfolio Assistant
          </p>

          <h1 className="mt-4 text-5xl font-bold text-slate-950">
            Ask about my skills, projects and experience
          </h1>

          <p className="mx-auto mt-5 max-w-3xl text-lg text-slate-600">
            Get answers from my professional profile, blogs, projects, and
            interview preparation knowledge base.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl md:p-6">
          <ChatBox />
        </div>
      </div>
    </section>
  );
}