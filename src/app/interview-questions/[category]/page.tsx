import { notFound } from "next/navigation";
import QuestionSearch from "@/components/interview/QuestionSearch";
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

      <QuestionSearch questions={questions} />
    </section>
  );
}