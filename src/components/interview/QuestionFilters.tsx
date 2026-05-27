"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export default function QuestionFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [level, setLevel] = useState(searchParams.get("level") || "all");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();

    if (search.trim()) params.set("q", search.trim());
    if (level !== "all") params.set("level", level);

    params.set("page", "1");

    router.push(`?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 grid gap-4 rounded-2xl border bg-white p-4 md:grid-cols-[1fr_200px_120px]"
    >
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search questions..."
        className="rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
      />

      <select
        value={level}
        onChange={(e) => setLevel(e.target.value)}
        className="rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
      >
        <option value="all">All Levels</option>
        <option value="Beginner">Beginner</option>
        <option value="Intermediate">Intermediate</option>
        <option value="Advanced">Advanced</option>
      </select>

      <button
        type="submit"
        className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
      >
        Search
      </button>
    </form>
  );
}