import PageHeader from "@/components/ui/PageHeader";
import InterviewChatBox from "@/components/interview/InterviewChatBox";

export default function InterviewChatPage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 md:py-20">
      <PageHeader
        label="Interview Preparation"
        title="Interview AI Chat"
        description="Chat with Zafrul's imported interview question bank across Java, Spring Boot, Angular, React, Node, Databases, Kafka, System Design, and Behavioral topics."
      />

      <div className="mt-12">
        <InterviewChatBox />
      </div>
    </section>
  );
}
