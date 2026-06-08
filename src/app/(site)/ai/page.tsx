import ChatBox from "@/components/ai/ChatBox";

export default function AIPage() {
  return (
    <section className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-white px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-pink-500">
            AI Assistant
          </p>

          <h1 className="mt-3 text-5xl font-bold text-slate-900">
            AI Assistant 💖
          </h1>

          <p className="mt-4 text-lg text-slate-600">
            A special surprise created with love for my beautiful Tona Darling.
          </p>
        </div>

        <div className="rounded-[2rem] border border-pink-200 bg-white/80 p-4 shadow-2xl backdrop-blur md:p-6">
          <div className="rounded-[1.5rem] border border-pink-100 bg-gradient-to-br from-white via-pink-50 to-white p-4">
            <ChatBox />
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Made with ❤️ by Zafrul for Tona Darling
        </p>
      </div>
    </section>
  );
}