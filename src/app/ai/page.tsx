import ChatBox from "@/components/ai/ChatBox";

export default function AiPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-4xl font-bold">AI Assistant</h1>

      <p className="mt-4 text-gray-600">
        Ask questions about Java, Spring Boot, Angular, Microservices, AWS and
        interview preparation.
      </p>

      <ChatBox />
    </section>
  );
}