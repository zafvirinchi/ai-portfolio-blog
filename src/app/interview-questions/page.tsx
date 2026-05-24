import Link from "next/link";
import { getInterviewCategories } from "@/lib/mdx";

const categoryLabels: Record<string, string> = {
  java: "Java",
  "spring-boot": "Spring Boot",
  angular: "Angular",
  microservices: "Microservices",
  "system-design": "System Design",
};

export default function InterviewQuestionsPage() {
  const categories = getInterviewCategories();

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-4xl font-bold">Interview Questions</h1>

      <p className="mt-4 text-gray-600">
        Topic-wise interview questions and answers for Java full stack developers.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category}
            href={`/interview-questions/${category}`}
            className="rounded-xl border p-6 shadow-sm transition hover:shadow-md"
          >
            <h2 className="text-2xl font-semibold">
              {categoryLabels[category] || category}
            </h2>

            <p className="mt-3 text-gray-600">
              Explore important {categoryLabels[category] || category} interview questions.
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}