"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { InterviewCategory } from "@/types/interview";

type Props = {
  item?: InterviewCategory | null;
};

export default function InterviewCategoryForm({ item }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const payload = {
      slug: String(formData.get("slug") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      icon: String(formData.get("icon") || "").trim() || null,
      sort_order: Number(formData.get("sort_order") || 0),
      is_active: formData.get("is_active") === "on",
    };

    try {
      const url = item
        ? `/api/admin/interview-categories/${item.id}`
        : "/api/admin/interview-categories";

      const method = item ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("API Error:", result);
        alert(result.error || "Something went wrong.");
        return;
      }

      alert(item ? "Category updated successfully" : "Category created successfully");

      router.push("/admin/interview-categories");
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
      <input
        name="title"
        defaultValue={item?.title || ""}
        required
        placeholder="Java"
        className="w-full rounded-xl border px-4 py-3"
      />

      <input
        name="slug"
        defaultValue={item?.slug || ""}
        required
        placeholder="java"
        className="w-full rounded-xl border px-4 py-3"
      />

      <textarea
        name="description"
        defaultValue={item?.description || ""}
        rows={4}
        placeholder="Category description"
        className="w-full rounded-xl border px-4 py-3"
      />

      <input
        name="icon"
        defaultValue={item?.icon || ""}
        placeholder="☕ or /icons/java.svg"
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
        {loading ? "Saving..." : item ? "Update Category" : "Save Category"}
      </button>
    </form>
  );
}