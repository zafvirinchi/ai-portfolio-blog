import ChatBox from "@/components/ai/ChatBox";

export default function AIPage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-bold">AI Assistant</h1>

      <div className="mt-8">
        <ChatBox />
      </div>
    </section>
  );
}