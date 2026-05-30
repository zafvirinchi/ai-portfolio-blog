import Link from "next/link";
import { getInterviewQuestions } from "@/lib/admin/interview-question-service";
import DeleteInterviewQuestionButton from "@/components/admin/DeleteInterviewQuestionButton";

export default async function AdminInterviewQuestionsPage() {
  const questions = await getInterviewQuestions();

  return (
    <section>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Interview Questions</h1>
          <p className="mt-2 text-gray-600">
            Manage interview questions and answers.
          </p>
        </div>

        <Link
          href="/admin/interview-questions/new"
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
        >
          Add Question
        </Link>
      </div>

      <div className="space-y-4">
        {questions.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-semibold text-blue-600">
                  Level: {item.level || "Beginner"} / Sort:{" "}
                  {item.sort_order ?? 0}
                </p>

                <h2 className="mt-2 text-xl font-bold">{item.question}</h2>

                <p className="mt-2 line-clamp-2 text-gray-600">
                  {item.answer}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {item.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-xs text-gray-500">
                  Status: {item.is_published ? "Published" : "Draft"}
                </p>
              </div>

              <div className="flex gap-3">
                <Link
                  href={`/admin/interview-questions/${item.id}/edit`}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Edit
                </Link>

                <DeleteInterviewQuestionButton id={item.id} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}