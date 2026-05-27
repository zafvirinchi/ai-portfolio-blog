import Link from "next/link";
import { getInterviewCategories } from "@/lib/admin/interview-category-service";

export default async function InterviewCategoriesPreview() {
  const categories = await getInterviewCategories();

  if (!categories.length) {
    return null;
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Interview Preparation
        </p>

        <h2 className="mt-3 text-4xl font-bold text-slate-900">
          Practice Topic-wise Interview Questions
        </h2>

        <p className="mt-4 max-w-3xl text-lg text-slate-600">
          Explore curated interview questions across Java, Spring Boot, Angular,
          Microservices, AWS, Kafka, React, AI and System Design.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {categories.slice(0, 6).map((category) => (
          <Link
            key={category.id}
            href={`/interview-questions/${category.slug}`}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <h3 className="text-2xl font-bold text-slate-900">
              {category.title}
            </h3>

            <p className="mt-4 text-slate-600">
              {category.description}
            </p>

            <p className="mt-6 text-sm font-semibold text-blue-600">
              Explore →
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <Link
          href="/interview-questions"
          className="inline-flex rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          View All Interview Questions
        </Link>
      </div>
    </section>
  );
}