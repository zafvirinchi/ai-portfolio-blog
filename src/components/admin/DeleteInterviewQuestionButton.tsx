"use client";

import { useRouter } from "next/navigation";

type Props = {
  id: string;
};

export default function DeleteInterviewQuestionButton({ id }: Props) {
  const router = useRouter();

  async function handleDelete() {
    const confirmed = confirm("Are you sure you want to delete this question?");

    if (!confirmed) return;

    const response = await fetch(`/api/admin/interview-questions/${id}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Delete error:", result);
      alert(result.error || "Failed to delete question");
      return;
    }

    alert("Question deleted successfully");
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
    >
      Delete
    </button>
  );
}