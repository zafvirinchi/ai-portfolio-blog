"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InterviewQuestion } from "@/types/interview";

type TopicOption = {
  id: string;
  slug: string;
  title: string;
  interview_categories?: {
    id: string;
    slug: string;
    title: string;
  } | null;
};

type Props = {
  item?: InterviewQuestion | null;
  topics?: TopicOption[];
};

export default function InterviewQuestionForm({ item, topics = [] }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [question, setQuestion] = useState(item?.question || "");
  const [answer, setAnswer] = useState(item?.answer || "");
  const [showPreview, setShowPreview] = useState(false);

  async function handleFormat() {
    if (!answer.trim()) {
      alert("Write an answer first.");
      return;
    }

    setFormatting(true);

    try {
      const response = await fetch("/api/admin/interview/reformat-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Formatting failed");
      }

      setAnswer(result.answer);
      setShowPreview(true);
    } catch (error) {
      console.error("Format Error:", error);
      alert(error instanceof Error ? error.message : "Formatting failed");
    } finally {
      setFormatting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const codeExample = String(formData.get("code_example") || "").trim();
    const topicId = String(formData.get("topic_id") || "").trim();
    const level = String(formData.get("level") || "Beginner").trim();
    const tagsValue = String(formData.get("tags") || "").trim();
    const sortOrder = Number(formData.get("sort_order") || 0);

    const payload = {
      topic_id: topicId,
      question: question.trim(),
      answer: answer.trim(),
      level,
      code_example: codeExample || null,
      tags: tagsValue
        ? tagsValue
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
      sort_order: sortOrder,
      is_published: formData.get("is_published") === "on",
    };

    try {
      const url = item
        ? `/api/admin/interview-questions/${item.id}`
        : "/api/admin/interview-questions";

      const method = item ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("API Error:", result);
        alert(result.error || "Something went wrong.");
        return;
      }

      alert(
        item ? "Question updated successfully" : "Question created successfully"
      );

      router.push("/admin/interview-questions");
      router.refresh();
    } catch (error) {
      console.error("Submit Error:", error);
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <select
        name="topic_id"
        defaultValue={item?.topic_id || ""}
        required
        className="w-full rounded-xl border px-4 py-3"
      >
        <option value="">Select Topic</option>

        {topics.map((topic) => (
          <option key={topic.id} value={topic.id}>
            {topic.interview_categories?.title || "No Category"} /{" "}
            {topic.title}
          </option>
        ))}
      </select>

      <select
        name="level"
        defaultValue={item?.level || "Beginner"}
        className="w-full rounded-xl border px-4 py-3"
      >
        <option value="Beginner">Beginner</option>
        <option value="Intermediate">Intermediate</option>
        <option value="Advanced">Advanced</option>
      </select>

      <input
        name="tags"
        defaultValue={item?.tags?.join(", ") || ""}
        placeholder="Java, Collections, HashMap"
        className="w-full rounded-xl border px-4 py-3"
      />

      <input
        name="sort_order"
        type="number"
        defaultValue={item?.sort_order ?? 0}
        placeholder="Sort order"
        className="w-full rounded-xl border px-4 py-3"
      />

      <textarea
        name="question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        required
        rows={4}
        placeholder="Write interview question..."
        className="w-full rounded-xl border px-4 py-3"
      />

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-600">
            Answer — write in Markdown (blank line between paragraphs, `-` for
            bullets, `**bold**`) for it to display well.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFormat}
              disabled={formatting}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {formatting ? "Formatting..." : "Format with AI"}
            </button>

            <button
              type="button"
              onClick={() => setShowPreview((prev) => !prev)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showPreview ? "Hide Preview" : "Preview"}
            </button>
          </div>
        </div>

        <textarea
          name="answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          required
          rows={12}
          placeholder="Write answer..."
          className="w-full rounded-xl border px-4 py-3 font-mono text-sm"
        />

        {showPreview && (
          <div className="prose prose-sm mt-3 max-w-none rounded-xl border border-slate-200 bg-slate-50 p-4">
            {answer.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
            ) : (
              <p className="text-slate-500">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      <textarea
        name="code_example"
        defaultValue={item?.code_example || ""}
        rows={14}
        placeholder="Optional code example..."
        className="w-full rounded-xl border px-4 py-3 font-mono text-sm"
      />

      <label className="flex items-center gap-2">
        <input
          name="is_published"
          type="checkbox"
          defaultChecked={item?.is_published ?? true}
        />
        <span>Published</span>
      </label>

      <button
        disabled={loading}
        className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Saving..." : item ? "Update Question" : "Save Question"}
      </button>
    </form>
  );
}
