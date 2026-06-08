"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { InterviewCategory, InterviewTopic } from "@/types/interview";

type Props = {
  item?: InterviewTopic | null;
  categories?: InterviewCategory[];
};

export default function InterviewTopicForm({ item, categories = [], }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const payload = {
      category_id: String(formData.get("category_id") || "").trim(),
      slug: String(formData.get("slug") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      sort_order: Number(formData.get("sort_order") || 0),
      is_active: formData.get("is_active") === "on",
    };

    const url = item
      ? `/api/admin/interview-topics/${item.id}`
      : "/api/admin/interview-topics";

    const method = item ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    setLoading(false);

    if (!response.ok) {
      alert(result.error || "Something went wrong.");
      return;
    }

    router.push("/admin/interview-topics");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <select
        name="category_id"
        defaultValue={item?.category_id || ""}
        required
        className="w-full rounded-xl border px-4 py-3"
      >
        <option value="">Select Category</option>

        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.title}
          </option>
        ))}
      </select>

      <input
        name="title"
        defaultValue={item?.title || ""}
        required
        placeholder="Core Java"
        className="w-full rounded-xl border px-4 py-3"
      />

      <input
        name="slug"
        defaultValue={item?.slug || ""}
        required
        placeholder="core-java"
        className="w-full rounded-xl border px-4 py-3"
      />

      <textarea
        name="description"
        defaultValue={item?.description || ""}
        rows={4}
        placeholder="Topic description"
        className="w-full rounded-xl border px-4 py-3"
      />

      <input
        type="number"
        name="sort_order"
        defaultValue={item?.sort_order ?? 0}
        placeholder="Sort order"
        className="w-full rounded-xl border px-4 py-3"
      />

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={item?.is_active ?? true}
        />
        Active
      </label>

      <button
        disabled={loading}
        className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Saving..." : item ? "Update Topic" : "Save Topic"}
      </button>
    </form>
  );
}