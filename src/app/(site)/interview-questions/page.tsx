import { getInterviewCategories } from "@/lib/admin/interview-category-service";
import PageHeader from "@/components/ui/PageHeader";
import ContentCard from "@/components/ui/ContentCard";

export default async function InterviewQuestionsPage() {
  const categories = await getInterviewCategories();

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
      <PageHeader
        label="Interview Preparation"
        title="Topic-wise Interview Questions"
        description="Prepare with structured questions and answers across Java, Spring Boot, Angular, Microservices, AWS, Kafka, React, AI and System Design."
      />

      {categories.length === 0 && (
        <div className="mt-10 rounded-2xl border border-yellow-200 bg-yellow-50 p-6 text-yellow-800">
          No categories found.
        </div>
      )}

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <ContentCard
            key={category.id}
            href={`/interview-questions/${category.slug}`}
            title={category.title}
            description={category.description}
            footer="Explore topics →"
          />
        ))}
      </div>
    </section>
  );
}