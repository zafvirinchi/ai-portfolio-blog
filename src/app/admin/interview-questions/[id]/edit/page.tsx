import { notFound } from "next/navigation";
import InterviewQuestionForm from "@/components/admin/InterviewQuestionForm";
import { getInterviewQuestionById } from "@/lib/admin/interview-question-service";
import { getAdminTopics } from "@/lib/admin/interview-topic-service";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditInterviewQuestionPage({ params }: Props) {
  const { id } = await params;

  const item = await getInterviewQuestionById(id);
  const topics = await getAdminTopics();

  if (!item) {
    notFound();
  }

  return (
    <section>
      <h1 className="mb-8 text-3xl font-bold">Edit Interview Question</h1>

      <InterviewQuestionForm item={item} topics={topics} />
    </section>
  );
}