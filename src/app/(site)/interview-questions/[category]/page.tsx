import { notFound } from "next/navigation";
import { getTopicsByCategory } from "@/lib/admin/interview-topic-service";
import PageHeader from "@/components/ui/PageHeader";
import ContentCard from "@/components/ui/ContentCard";

type Props = {
  params: Promise<{ category: string }>;
};

export default async function InterviewCategoryPage({ params }: Props) {
  const { category } = await params;
  const topics = await getTopicsByCategory(category);

  if (!topics.length) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
      <PageHeader
        label="Interview Topics"
        title={`${category.replace("-", " ")} Topics`}
        description="Choose a topic to view structured interview questions and answers."
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
          <ContentCard
            key={topic.id}
            href={`/interview-questions/${category}/${topic.slug}`}
            title={topic.title}
            description={topic.description}
            footer="View questions →"
          />
        ))}
      </div>
    </section>
  );
}