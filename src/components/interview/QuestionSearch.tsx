"use client";

import { useState } from "react";
import SearchBox from "@/components/ui/SearchBox";
import QuestionCard from "@/components/interview/QuestionCard";
import { InterviewQuestion } from "@/types/interview";

type QuestionSearchProps = {
  questions: InterviewQuestion[];
};

export default function QuestionSearch({ questions }: QuestionSearchProps) {
  const [query, setQuery] = useState("");

  const filteredQuestions = questions.filter((question) => {
    const text = `${question.title} ${question.level} ${question.tags.join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <>
      <div className="mt-8 max-w-xl">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search questions..."
        />
      </div>

      <div className="mt-10 grid gap-6">
        {filteredQuestions.map((question) => (
          <QuestionCard key={question.slug} {...question} />
        ))}
      </div>

      {filteredQuestions.length === 0 && (
        <p className="mt-8 text-gray-500">No questions found.</p>
      )}
    </>
  );
}