"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import ChatBox from "@/components/ai/ChatBox";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import CoverLetterSetupForm from "@/components/cover-letter/CoverLetterSetupForm";
import CoverLetterVariantCard from "@/components/cover-letter/CoverLetterVariantCard";
import CoverLetterEmailPanel from "@/components/cover-letter/CoverLetterEmailPanel";
import CoverLetterLinkedinPanel from "@/components/cover-letter/CoverLetterLinkedinPanel";
import type { EmailAudience, VariantVersion } from "@/lib/ai/cover-letter/cover-schema";
import type { CoverLetterRecord } from "@/lib/ai/cover-letter/cover-types";

const SUGGESTIONS = ["Generate startup version", "Generate executive version", "Generate recruiter email", "Generate LinkedIn message"];

function CoverLetterContent() {
  const searchParams = useSearchParams();
  const jdMatchId = searchParams.get("jdMatchId");

  const [record, setRecord] = useState<CoverLetterRecord | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState("cover-letter");

  async function handleAccept(version: VariantVersion) {
    if (!record) return;

    setLoading(`accept-${version}`);
    setError(null);

    try {
      const response = await fetch(`/api/ai/cover-letter/${record.coverLetterId}/letter/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to accept variant");
      setRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept variant.");
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateEmail(audience: EmailAudience) {
    if (!record) return;

    setError(null);

    try {
      const response = await fetch(`/api/ai/cover-letter/${record.coverLetterId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Email generation failed");
      setRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email generation failed.");
    }
  }

  async function handleGenerateLinkedin() {
    if (!record) return;

    setError(null);

    try {
      const response = await fetch(`/api/ai/cover-letter/${record.coverLetterId}/linkedin`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "LinkedIn message generation failed");
      setRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "LinkedIn message generation failed.");
    }
  }

  if (!jdMatchId) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Match your resume against a job description first</p>
        <p className="mt-2 text-sm text-slate-600">
          The Cover Letter Generator needs a JD match — it draws on the resume, the parsed job description, the ATS
          analysis, and (if generated) the Resume Optimizer output.
        </p>
        <Link
          href="/resume-analyzer"
          className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to Resume Analyzer
        </Link>
      </div>
    );
  }

  const acceptedText = record?.acceptedLetter?.sections.fullText ?? record?.letterVariants[0]?.sections.fullText ?? "";

  const tabs: TabItem[] = record
    ? [
        {
          id: "cover-letter",
          label: "Cover Letter",
          content: (
            <div className="space-y-4">
              {record.letterVariants.map((variant) => (
                <CoverLetterVariantCard
                  key={variant.version}
                  variant={variant}
                  isAccepted={record.acceptedLetter?.version === variant.version}
                  loading={loading === `accept-${variant.version}`}
                  onAccept={() => handleAccept(variant.version)}
                />
              ))}
            </div>
          ),
        },
        {
          id: "email",
          label: "Application Email",
          content: <CoverLetterEmailPanel emails={record.emails} onGenerate={handleGenerateEmail} />,
        },
        {
          id: "linkedin",
          label: "LinkedIn",
          content: <CoverLetterLinkedinPanel messages={record.linkedinMessages} onGenerate={handleGenerateLinkedin} />,
        },
        {
          id: "variants",
          label: "Variants",
          content: (
            <div className="space-y-4">
              {record.letterHistory.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                  No prior accepted versions yet — accept a variant, then regenerate, to build history.
                </div>
              ) : (
                record.letterHistory.map((variant, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Previously accepted — Version {variant.version} ({variant.wordCount} words)
                    </p>
                    <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{variant.sections.fullText}</p>
                  </div>
                ))
              )}
            </div>
          ),
        },
        {
          id: "preview",
          label: "Preview",
          content: (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {record.acceptedLetter ? "Accepted Letter" : "Version A (not yet accepted)"}
                </p>
                <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{acceptedText}</p>
              </div>

              {record.keywordCoverage && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Keyword Coverage</p>
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">JD keywords used:</span>{" "}
                    {record.keywordCoverage.jdKeywordsUsed.join(", ") || "none"}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-semibold">Still missing:</span>{" "}
                    {record.keywordCoverage.missingKeywords.join(", ") || "none"}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{record.keywordCoverage.atsImprovementNote}</p>
                </div>
              )}

              {record.reasoning && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Why This Letter</p>
                  <p className="text-sm text-slate-700">{record.reasoning.whyGenerated}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="font-semibold">Resume sections referenced:</span>{" "}
                    {record.reasoning.resumeSectionsReferenced.join(", ") || "none"}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-semibold">JD sections referenced:</span>{" "}
                    {record.reasoning.jdSectionsReferenced.join(", ") || "none"}
                  </p>
                </div>
              )}
            </div>
          ),
        },
        {
          id: "export",
          label: "Export",
          content: (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {(["markdown", "pdf", "docx", "html", "text"] as const).map((format) => (
                <a
                  key={format}
                  href={`/api/ai/cover-letter/${record.coverLetterId}/export?format=${format}`}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {format === "markdown" ? "Markdown" : format === "text" ? "Plain Text" : format.toUpperCase()}
                </a>
              ))}
            </div>
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {!record ? (
        <CoverLetterSetupForm
          jdMatchId={jdMatchId}
          loading={loading === "start"}
          error={error}
          onGenerated={(created) => {
            setRecord(created);
            setActiveTabId("cover-letter");
          }}
        />
      ) : (
        <>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          <Tabs key={record.coverLetterId} tabs={tabs} defaultTabId={activeTabId} />

          <ChatBox
            coverLetterId={record.coverLetterId}
            title="Cover Letter Assistant"
            subtitle='Try "generate startup version", "generate recruiter email", or "generate LinkedIn message"'
            placeholder="Ask to regenerate in a style, or generate an email/LinkedIn message..."
            suggestions={SUGGESTIONS}
            emptyStateTitle="Chat alongside your cover letter"
            emptyStateBody="You can also use the tabs above directly."
          />
        </>
      )}
    </div>
  );
}

export default function CoverLetterPage() {
  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Cover Letter Generator</p>

          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">Recruiter-grade cover letters, grounded in your real resume</h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Generate a cover letter, application email, and LinkedIn outreach messages tailored to a specific job —
            never inventing an experience, metric, or company fact you didn&apos;t actually provide.
          </p>
        </div>

        <Suspense fallback={null}>
          <CoverLetterContent />
        </Suspense>
      </div>
    </section>
  );
}
