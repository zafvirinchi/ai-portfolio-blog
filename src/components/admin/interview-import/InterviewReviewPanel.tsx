"use client";

import { useState } from "react";

import type { InterviewExtractApiResult } from "./InterviewDocumentUpload";
import InterviewFinalSummary from "./InterviewFinalSummary";
import type { ImportResult } from "@/lib/ai/interview-import/import-types";

interface ReviewItem {
  clientId: string;
  question: string;
  category: string;
  topic: string;
  answer: string;
  answerSource: "ORIGINAL" | "GENERATED";
  /** The answer exactly as extraction produced it — never mutated, so "Restore Original" always has something to go back to. */
  pristineAnswer: string;
  pristineAnswerSource: "ORIGINAL" | "GENERATED";
  confidence: number;
  order: number;
  documentName: string;
  approved: boolean;
  isEditing: boolean;
  aiCandidate: string | null;
  regenerating: boolean;
}

type Props = {
  result: InterviewExtractApiResult;
  onDone: () => void;
};

function toReviewItems(result: InterviewExtractApiResult): ReviewItem[] {
  return result.questions.map((question, index) => ({
    clientId: `${index}-${question.order}`,
    question: question.question,
    category: question.category,
    topic: question.topic,
    answer: question.answer,
    answerSource: question.answerSource,
    pristineAnswer: question.answer,
    pristineAnswerSource: question.answerSource,
    confidence: question.confidence,
    order: question.order,
    documentName: question.documentName,
    approved: true,
    isEditing: false,
    aiCandidate: null,
    regenerating: false,
  }));
}

async function regenerateAnswer(question: string, category: string, topic: string): Promise<string> {
  const response = await fetch("/api/admin/interview/regenerate-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, category, topic }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Answer regeneration failed");
  }

  return data.answer as string;
}

export default function InterviewReviewPanel({ result, onDone }: Props) {
  const [items, setItems] = useState<ReviewItem[]>(() => toReviewItems(result));
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function updateItem(clientId: string, patch: Partial<ReviewItem>) {
    setItems((prev) => prev.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)));
  }

  function removeItem(clientId: string) {
    setItems((prev) => prev.filter((item) => item.clientId !== clientId));
  }

  async function handleRegenerate(item: ReviewItem) {
    updateItem(item.clientId, { regenerating: true });

    try {
      const answer = await regenerateAnswer(item.question, item.category, item.topic);
      updateItem(item.clientId, { aiCandidate: answer, regenerating: false });
    } catch (err) {
      updateItem(item.clientId, { regenerating: false });
      window.alert(err instanceof Error ? err.message : "Answer regeneration failed");
    }
  }

  function keepOriginal(item: ReviewItem) {
    updateItem(item.clientId, { aiCandidate: null });
  }

  function keepAi(item: ReviewItem) {
    if (!item.aiCandidate) return;
    updateItem(item.clientId, { answer: item.aiCandidate, answerSource: "GENERATED", aiCandidate: null });
  }

  function mergeBoth(item: ReviewItem) {
    if (!item.aiCandidate) return;
    const merged = `${item.answer}\n\n---\n\n**AI-Improved Version**\n\n${item.aiCandidate}`;
    updateItem(item.clientId, { answer: merged, aiCandidate: null });
  }

  function restoreOriginal(item: ReviewItem) {
    updateItem(item.clientId, {
      answer: item.pristineAnswer,
      answerSource: item.pristineAnswerSource,
      aiCandidate: null,
    });
  }

  async function handleConfirmImport() {
    const approved = items.filter((item) => item.approved);

    if (approved.length === 0) {
      setImportError("No questions are approved — nothing to import.");
      return;
    }

    setImporting(true);
    setImportError(null);

    try {
      const response = await fetch("/api/admin/interview/confirm-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: approved.map((item) => ({
            question: item.question,
            category: item.category,
            topic: item.topic,
            answer: item.answer,
            answerSource: item.answerSource,
            confidence: item.confidence,
            order: item.order,
            documentName: item.documentName,
          })),
          qualityScore: result.quality.qualityScore,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Interview import failed");
      }

      setImportResult(data.import as ImportResult);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Interview import failed");
    } finally {
      setImporting(false);
    }
  }

  if (importResult) {
    return (
      <div className="space-y-6">
        <InterviewFinalSummary result={importResult} filename={result.filename} />

        <button
          onClick={onDone}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Import another document
        </button>
      </div>
    );
  }

  const approvedCount = items.filter((item) => item.approved).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="font-semibold text-slate-900">{result.filename}</p>
          <p className="mt-1 text-sm text-slate-500">
            {items.length} question{items.length === 1 ? "" : "s"} extracted &middot; {approvedCount} approved
            &middot; Quality score {result.quality.qualityScore}/100
          </p>
        </div>

        <button
          onClick={handleConfirmImport}
          disabled={importing || approvedCount === 0}
          className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {importing ? "Importing..." : `Import ${approvedCount} Approved Question${approvedCount === 1 ? "" : "s"}`}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Original Answers", value: result.quality.originalAnswers },
          { label: "AI Generated", value: result.quality.generatedAnswers },
          { label: "Missing Answers", value: result.quality.missingAnswers },
          { label: "Removed (dupe/broken)", value: result.removed.length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{stat.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {importError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{importError}</div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <ReviewCard
            key={item.clientId}
            item={item}
            onUpdate={(patch) => updateItem(item.clientId, patch)}
            onRemove={() => removeItem(item.clientId)}
            onRegenerate={() => handleRegenerate(item)}
            onKeepOriginal={() => keepOriginal(item)}
            onKeepAi={() => keepAi(item)}
            onMergeBoth={() => mergeBoth(item)}
            onRestoreOriginal={() => restoreOriginal(item)}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({
  item,
  onUpdate,
  onRemove,
  onRegenerate,
  onKeepOriginal,
  onKeepAi,
  onMergeBoth,
  onRestoreOriginal,
}: {
  item: ReviewItem;
  onUpdate: (patch: Partial<ReviewItem>) => void;
  onRemove: () => void;
  onRegenerate: () => void;
  onKeepOriginal: () => void;
  onKeepAi: () => void;
  onMergeBoth: () => void;
  onRestoreOriginal: () => void;
}) {
  const hasDiverged = item.answer !== item.pristineAnswer;
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        item.approved ? "border-slate-200" : "border-red-200 bg-red-50/40 opacity-75"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              item.answerSource === "ORIGINAL" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
            }`}
          >
            {item.answerSource === "ORIGINAL" ? "Original Document" : "AI Generated"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {item.category} &rsaquo; {item.topic}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate({ approved: !item.approved })}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              item.approved
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {item.approved ? "Reject" : "Approve"}
          </button>
          <button
            onClick={() => onUpdate({ isEditing: !item.isEditing })}
            className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            {item.isEditing ? "Done Editing" : "Edit"}
          </button>
          <button
            onClick={onRemove}
            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Delete
          </button>
        </div>
      </div>

      {item.isEditing ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">
              Category
              <input
                value={item.category}
                onChange={(event) => onUpdate({ category: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Topic
              <input
                value={item.topic}
                onChange={(event) => onUpdate({ topic: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-500">
            Question
            <textarea
              value={item.question}
              onChange={(event) => onUpdate({ question: event.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-500">
            Answer
            <textarea
              value={item.answer}
              onChange={(event) => onUpdate({ answer: event.target.value })}
              rows={8}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </label>
        </div>
      ) : (
        <div className="mt-4">
          <p className="font-semibold text-slate-900">{item.question}</p>
          <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-700">
            {item.answer || "(no answer)"}
          </pre>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onRegenerate}
          disabled={item.regenerating}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {item.regenerating ? "Regenerating..." : "Regenerate Answer"}
        </button>

        {hasDiverged && (
          <button
            onClick={onRestoreOriginal}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Restore Original
          </button>
        )}
      </div>

      {item.aiCandidate && (
        <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50/50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-purple-700">
            Compare — Original vs AI Improved
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Original</p>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs text-slate-700">
                {item.answer}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">AI Improved</p>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs text-slate-700">
                {item.aiCandidate}
              </pre>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onKeepOriginal}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Keep Original
            </button>
            <button
              onClick={onKeepAi}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
            >
              Keep AI
            </button>
            <button
              onClick={onMergeBoth}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Merge Both
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
