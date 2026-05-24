import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getInterviewCategories,
  getInterviewQuestionsByCategory,
} from "@/lib/mdx";

type Props = {
  params: Promise<{ category: string }>;
};

export function generateStaticParams() {
  return getInterviewCategories().map((category) => ({
    category,
  }));
}

export default async function InterviewCategoryPage({ params }: Props) {
  const { category } = await params;
  const questions = getInterviewQuestionsByCategory(category);

  if (!questions.length) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-4xl font-bold capitalize">
        {category.replace("-", " ")} Interview Questions
      </h1>

      <div className="mt-10 grid gap-6">
        {questions.map((question) => (
          <Link
            key={question.slug}
            href={`/interview-questions/${category}/${question.slug}`}
            className="rounded-xl border p-6 shadow-sm transition hover:shadow-md"
          >
            <h2 className="text-2xl font-semibold">{question.title}</h2>

            <p className="mt-3 text-sm text-gray-500">
              Level: {question.level}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {question.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full bg-green-50 px-3 py-1 text-sm text-green-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}