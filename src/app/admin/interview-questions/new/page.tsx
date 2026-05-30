import InterviewQuestionForm from "@/components/admin/InterviewQuestionForm";
import { getAdminTopics } from "@/lib/admin/interview-topic-service";

export default async function NewInterviewQuestionPage() {
  const topics = await getAdminTopics();

  return (
    <section>
      <h1 className="mb-8 text-3xl font-bold">Add Interview Question</h1>

      <InterviewQuestionForm topics={topics} />
    </section>
  );
}