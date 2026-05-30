"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Blog } from "@/types/blog";

type Props = {
  blog?: Blog | null;
};

export default function BlogForm({ blog }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const title = String(formData.get("title") || "").trim();
    const slug = String(formData.get("slug") || "").trim();
    const excerpt = String(formData.get("excerpt") || "").trim();
    const content = String(formData.get("content") || "").trim();
    const coverImage = String(formData.get("cover_image") || "").trim();
    const tagsValue = String(formData.get("tags") || "").trim();

    const payload = {
      title,
      slug,
      excerpt: excerpt || null,
      content,
      cover_image: coverImage || null,
      tags: tagsValue
        ? tagsValue
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
      is_published: formData.get("is_published") === "on",
    };

    console.log("Submitting blog payload:", payload);

    try {
      const url = blog
        ? `/api/admin/blogs/${blog.id}`
        : "/api/admin/blogs";

      const method = blog ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        alert(blog ? "Blog updated successfully" : "Blog created successfully");

        router.push("/admin/blogs");
        router.refresh();
      } else {
        console.error("API Error:", result);

        alert(result.error || "Something went wrong.");
      }
    } catch (error) {
      console.error("Submit Error:", error);

      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label className="mb-2 block font-medium">Title</label>

        <input
          type="text"
          name="title"
          defaultValue={blog?.title || ""}
          required
          placeholder="Blog title"
          className="w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
        />
      </div>

      {/* Slug */}
      <div>
        <label className="mb-2 block font-medium">Slug</label>

        <input
          type="text"
          name="slug"
          defaultValue={blog?.slug || ""}
          required
          placeholder="stack-vs-heap-in-java"
          className="w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
        />
      </div>

      {/* Excerpt */}
      <div>
        <label className="mb-2 block font-medium">Excerpt</label>

        <textarea
          name="excerpt"
          defaultValue={blog?.excerpt || ""}
          rows={3}
          placeholder="Short description about the blog..."
          className="w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="mb-2 block font-medium">Tags</label>

        <input
          type="text"
          name="tags"
          defaultValue={blog?.tags?.join(", ") || ""}
          placeholder="Java, Spring Boot, Angular"
          className="w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
        />
      </div>

      {/* Cover Image */}
      <div>
        <label className="mb-2 block font-medium">Cover Image</label>

        <input
          type="text"
          name="cover_image"
          defaultValue={blog?.cover_image || ""}
          placeholder="/images/blog/java-memory.png"
          className="w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
        />
      </div>

      {/* Content */}
      <div>
        <label className="mb-2 block font-medium">Content</label>

        <textarea
          name="content"
          defaultValue={blog?.content || ""}
          required
          rows={18}
          placeholder="Write blog content in Markdown..."
          className="w-full rounded-xl border px-4 py-3 font-mono text-sm outline-none focus:border-blue-500"
        />
      </div>

      {/* Published */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={blog?.is_published ?? true}
        />

        <span>Published</span>
      </label>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? blog
            ? "Updating..."
            : "Saving..."
          : blog
          ? "Update Blog"
          : "Save Blog"}
      </button>
    </form>
  );
}