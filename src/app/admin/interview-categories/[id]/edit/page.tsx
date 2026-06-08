import { notFound } from "next/navigation";
import InterviewCategoryForm from "@/components/admin/InterviewCategoryForm";
import { getInterviewCategoryById } from "@/lib/admin/interview-category-service";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditInterviewCategoryPage({ params }: Props) {
  const { id } = await params;

  const item = await getInterviewCategoryById(id);

  if (!item) {
    notFound();
  }

  return (
    <section>
      <h1 className="mb-8 text-3xl font-bold">Edit Category</h1>

      <InterviewCategoryForm item={item} />
    </section>
  );
}