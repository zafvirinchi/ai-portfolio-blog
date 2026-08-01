import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DynamicQAAccordion from "@/components/interview/DynamicQAAccordion";
import Pagination from "@/components/interview/Pagination";
import QuestionFilters from "@/components/interview/QuestionFilters";
import PageHeader from "@/components/ui/PageHeader";
import { getTopicInfo } from "@/lib/admin/interview-topic-service";
import { getQuestionsByTopic } from "@/lib/admin/interview-question-service";
import { stripEmojiForMetadata } from "@/lib/utils/metadata-text";

type Props = {
  params: Promise<{
    category: string;
    topic: string;
  }>;
  searchParams: Promise<{
    q?: string;
    level?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 10;

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { category, topic } = await params;
  const topicInfo = await getTopicInfo(category, topic);

  if (!topicInfo) {
    return {};
  }

  const description = stripEmojiForMetadata(
    topicInfo.description ??
      `Practice structured interview questions and answers on ${topicInfo.title}.`
  );

  return {
    title: `${topicInfo.title} Interview Questions`,
    description,
    openGraph: { title: `${topicInfo.title} Interview Questions`, description },
    twitter: { card: "summary", title: `${topicInfo.title} Interview Questions`, description },
  };
}

export default async function InterviewTopicPage({
  params,
  searchParams,
}: Props) {
  const { category, topic } = await params;
  const resolvedSearchParams = await searchParams;

  const q = resolvedSearchParams.q || "";
  const level = resolvedSearchParams.level || "all";
  const page = Number(resolvedSearchParams.page || "1");

  const topicInfo = await getTopicInfo(category, topic);

  if (!topicInfo) {
    notFound();
  }

  const categoryTitle = Array.isArray(topicInfo.interview_categories)
    ? topicInfo.interview_categories[0]?.title
    : topicInfo.interview_categories?.title;

  const { questions, total } = await getQuestionsByTopic({
    categorySlug: category,
    topicSlug: topic,
    search: q,
    level,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <section className="mx-auto max-w-5xl px-6 py-16 md:py-20">
      <PageHeader
        label={categoryTitle || "Interview Questions"}
        title={topicInfo.title}
        description={
          topicInfo.description ||
          "Practice structured interview questions and answers for this topic."
        }
      />

      <QuestionFilters />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span>
          Showing <strong>{questions.length}</strong> of{" "}
          <strong>{total}</strong> questions
        </span>

        {(q || level !== "all") && (
          <span>
            Filter: {q && `"${q}"`} {level !== "all" && `• ${level}`}
          </span>
        )}
      </div>

      {questions.length > 0 ? (
        <>
          <DynamicQAAccordion questions={questions} />

          <Pagination
            currentPage={page}
            total={total}
            pageSize={PAGE_SIZE}
            searchParams={{ q, level }}
          />
        </>
      ) : (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
          No questions found. Try changing the search keyword or level filter.
        </div>
      )}
    </section>
  );
}