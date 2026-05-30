import InterviewTopicForm from "@/components/admin/InterviewTopicForm";
import { getInterviewCategories } from "@/lib/admin/interview-category-service";

export default async function NewInterviewTopicPage() {
  const categories = await getInterviewCategories();

  return (
    <section>
      <h1 className="mb-8 text-3xl font-bold">Add Topic</h1>
      <InterviewTopicForm categories={categories} />
    </section>
  );
}