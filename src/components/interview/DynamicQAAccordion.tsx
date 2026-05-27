"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InterviewQuestion } from "@/types/interview";

type Props = {
  questions: InterviewQuestion[];
};

export default function DynamicQAAccordion({ questions }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mt-8 space-y-4">
      {questions.map((item, index) => {
        const isOpen = openId === item.id;

        return (
          <div key={item.id} className="rounded-xl border bg-white shadow-sm">
            <button
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-lg font-semibold">
                {index + 1}. {item.question}
              </span>

              <span className="text-2xl text-blue-600">
                {isOpen ? "−" : "+"}
              </span>
            </button>

            {isOpen && (
              <div className="border-t px-5 py-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs text-green-700">
                    {item.level}
                  </span>

                  {item.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {item.diagram_url && (
                  <figure className="mb-6 rounded-xl border bg-gray-50 p-4">
                    <img
                      src={item.diagram_url}
                      alt={item.diagram_caption || item.question}
                      className="mx-auto h-auto w-full max-w-2xl max-h-[350px] rounded-lg object-contain shadow-sm"
        
                    />

                    {item.diagram_caption && (
                      <figcaption className="mt-3 text-center text-sm text-gray-500">
                        {item.diagram_caption}
                      </figcaption>
                    )}
                  </figure>
                )}

                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {item.answer}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}