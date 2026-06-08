import Link from "next/link";
import { getInterviewTopics } from "@/lib/admin/interview-topic-service";

export default async function AdminInterviewTopicsPage() {
  const topics = await getInterviewTopics();

  return (
    <section>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Interview Topics</h1>

        <Link
          href="/admin/interview-topics/new"
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
        >
          Add Topic
        </Link>
      </div>

      <div className="space-y-4">
        {topics.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-2xl border bg-white p-5"
          >
            <div>
              <h2 className="text-xl font-bold">{item.title}</h2>
              <p className="text-sm text-gray-500">/{item.slug}</p>
              <p className="mt-2 text-gray-600">{item.description}</p>
            </div>

            <Link
              href={`/admin/interview-topics/${item.id}/edit`}
              className="rounded-lg bg-slate-900 px-4 py-2 text-white"
            >
              Edit
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}