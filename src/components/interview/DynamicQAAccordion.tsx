"use client";

import { useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { InterviewQuestion } from "@/types/interview";

type Props = {
  questions: InterviewQuestion[];
};

export default function DynamicQAAccordion({ questions }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopy(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);

      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Failed to copy code.");
    }
  }

  return (
    <div className="mt-8 space-y-4">
      {questions.map((item, index) => {
        const isOpen = openId === item.id;

        return (
          <div key={item.id} className="rounded-xl border bg-white shadow-sm">
            <button
              type="button"
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
                    <div className="relative mx-auto h-[350px] w-full max-w-2xl">
                      <Image
                        src={item.diagram_url}
                        alt={item.diagram_caption || item.question}
                        fill
                        className="rounded-lg object-contain shadow-sm"
                      />
                    </div>

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

                {item.code_example && (
                  <div className="mt-6 overflow-hidden rounded-xl border border-slate-700">
                    <div className="flex items-center justify-between bg-slate-900 px-4 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                        {item.code_language || "java"}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(item.id, item.code_example || "")
                        }
                        className="rounded-md bg-slate-700 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-600"
                      >
                        {copiedId === item.id ? "Copied!" : "Copy"}
                      </button>
                    </div>

                    <SyntaxHighlighter
                      language={item.code_language || "java"}
                      style={vscDarkPlus}
                      showLineNumbers
                      customStyle={{
                        margin: 0,
                        padding: "1.25rem",
                        fontSize: "14px",
                        borderRadius: 0,
                      }}
                    >
                      {item.code_example}
                    </SyntaxHighlighter>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}