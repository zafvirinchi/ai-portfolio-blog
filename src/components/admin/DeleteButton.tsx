"use client";

import { useRouter } from "next/navigation";

type Props = {
  id: string;
};

export default function DeleteBlogButton({ id }: Props) {
  const router = useRouter();

  async function handleDelete() {
    const confirmed = confirm(
      "Are you sure you want to delete this blog?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/blogs/${id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Delete error:", result);

        alert(result.error || "Failed to delete blog");

        return;
      }

      alert("Blog deleted successfully");

      router.refresh();
    } catch (error) {
      console.error("Delete request failed:", error);

      alert("Something went wrong.");
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
    >
      Delete
    </button>
  );
}