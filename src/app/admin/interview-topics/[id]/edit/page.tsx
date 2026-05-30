import { notFound } from "next/navigation";
import InterviewTopicForm from "@/components/admin/InterviewTopicForm";
import { getInterviewCategories } from "@/lib/admin/interview-category-service";
import { getInterviewTopicById } from "@/lib/admin/interview-topic-service";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditInterviewTopicPage({ params }: Props) {
  const { id } = await params;

  const item = await getInterviewTopicById(id);
  const categories = await getInterviewCategories();

  if (!item) {
    notFound();
  }

  return (
    <section>
      <h1 className="mb-8 text-3xl font-bold">Edit Topic</h1>
      <InterviewTopicForm item={item} categories={categories} />
    </section>
  );
}