import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import {
  getInterviewCategories,
  getInterviewQuestion,
  getInterviewQuestionsByCategory,
} from "@/lib/mdx";

type Props = {
  params: Promise<{
    category: string;
    slug: string;
  }>;
};

export function generateStaticParams() {
  return getInterviewCategories().flatMap((category) =>
    getInterviewQuestionsByCategory(category).map((question) => ({
      category,
      slug: question.slug,
    }))
  );
}

export default async function InterviewQuestionDetailPage({ params }: Props) {
  const { category, slug } = await params;

  const question = getInterviewQuestion(category, slug);

  if (!question) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium uppercase text-green-600">
        {category.replace("-", " ")} · {question.level}
      </p>

      <h1 className="mt-3 text-4xl font-bold">{question.title}</h1>

      <div className="mt-8 prose prose-lg max-w-none">
        <MDXRemote source={question.content} />
      </div>
    </article>
  );
}