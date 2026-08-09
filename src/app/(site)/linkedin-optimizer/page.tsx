"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import ChatBox from "@/components/ai/ChatBox";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import LinkedinSetupForm from "@/components/linkedin/LinkedinSetupForm";
import LinkedinHeadlineTab from "@/components/linkedin/LinkedinHeadlineTab";
import LinkedinAboutTab from "@/components/linkedin/LinkedinAboutTab";
import LinkedinExperienceTab from "@/components/linkedin/LinkedinExperienceTab";
import LinkedinSkillsTab from "@/components/linkedin/LinkedinSkillsTab";
import LinkedinSeoTab from "@/components/linkedin/LinkedinSeoTab";
import LinkedinScoreTab from "@/components/linkedin/LinkedinScoreTab";
import LinkedinExtrasTab from "@/components/linkedin/LinkedinExtrasTab";
import type { LinkedinRecord } from "@/lib/ai/linkedin/linkedin-types";

const SUGGESTIONS = [
  "Rewrite my headline",
  "Rewrite my About section",
  "Generate recruiter summary",
  "Improve LinkedIn SEO",
];

const EXPORT_FORMATS = [
  { format: "markdown", label: "Markdown" },
  { format: "pdf", label: "PDF" },
  { format: "docx", label: "DOCX" },
  { format: "html", label: "HTML" },
  { format: "text", label: "Plain Text" },
  { format: "linkedin", label: "LinkedIn Ready Text" },
] as const;

function LinkedinOptimizerContent() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resumeId");
  const rewriteId = searchParams.get("rewriteId") ?? undefined;
  const jdMatchId = searchParams.get("jdMatchId") ?? undefined;

  const [record, setRecord] = useState<LinkedinRecord | null>(null);
  const [activeTabId, setActiveTabId] = useState("headline");

  if (!resumeId) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Upload a resume first</p>
        <p className="mt-2 text-sm text-slate-600">
          The LinkedIn Profile Optimizer builds on your parsed resume, and optionally on a Resume Rewrite Engine
          session or a JD match — go analyze a resume first.
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

  const tabs: TabItem[] = record
    ? [
        { id: "headline", label: "Headline", content: <LinkedinHeadlineTab linkedinId={record.linkedinId} record={record} onUpdated={setRecord} /> },
        { id: "about", label: "About", content: <LinkedinAboutTab linkedinId={record.linkedinId} record={record} onUpdated={setRecord} /> },
        {
          id: "experience",
          label: "Experience & Projects",
          content: <LinkedinExperienceTab linkedinId={record.linkedinId} record={record} onUpdated={setRecord} />,
        },
        { id: "skills", label: "Skills", content: <LinkedinSkillsTab linkedinId={record.linkedinId} record={record} onUpdated={setRecord} /> },
        { id: "seo", label: "SEO", content: <LinkedinSeoTab linkedinId={record.linkedinId} record={record} onUpdated={setRecord} /> },
        { id: "score", label: "Score", content: <LinkedinScoreTab linkedinId={record.linkedinId} record={record} onUpdated={setRecord} /> },
        {
          id: "messages",
          label: "Messages & Branding",
          content: <LinkedinExtrasTab linkedinId={record.linkedinId} record={record} onUpdated={setRecord} />,
        },
        {
          id: "preview",
          label: "Preview",
          content: (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Headline</p>
                <p className="text-sm font-medium text-slate-800">
                  {record.acceptedHeadlineStyle
                    ? record.headlines[record.acceptedHeadlineStyle]?.text
                    : "Not yet accepted — generate and accept a headline style."}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">About</p>
                <p className="whitespace-pre-line text-sm leading-6 text-slate-800">
                  {record.acceptedAboutStyle
                    ? record.about[record.acceptedAboutStyle]?.text
                    : "Not yet accepted — generate and accept an About story style."}
                </p>
              </div>

              {record.profileScore && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center shadow-sm">
                  <p className="text-xs font-bold uppercase text-blue-700">Overall Profile Score</p>
                  <p className="text-4xl font-extrabold text-blue-900">{Math.round(record.profileScore.overall.score)}</p>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Experience Bullets</p>
                <p className="text-sm text-slate-600">{record.experience?.length ?? 0} rewritten bullets generated.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Skills</p>
                <p className="text-sm text-slate-600">
                  {record.skills ? `${record.skills.reduce((sum, g) => sum + g.skills.length, 0)} skills across ${record.skills.length} categories.` : "Not yet generated."}
                </p>
              </div>
            </div>
          ),
        },
        {
          id: "export",
          label: "Export",
          content: (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {EXPORT_FORMATS.map(({ format, label }) => (
                <a
                  key={format}
                  href={`/api/ai/linkedin/${record.linkedinId}/export?format=${format}`}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {label}
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
        <LinkedinSetupForm
          resumeId={resumeId}
          rewriteId={rewriteId}
          jdMatchId={jdMatchId}
          onStarted={(created) => {
            setRecord(created);
            setActiveTabId("headline");
          }}
        />
      ) : (
        <>
          <Tabs key={record.linkedinId} tabs={tabs} defaultTabId={activeTabId} />

          <ChatBox
            linkedinId={record.linkedinId}
            title="LinkedIn Optimizer Assistant"
            subtitle='Try "rewrite my headline", "rewrite my About section", or "improve my LinkedIn SEO"'
            placeholder="Ask to rewrite a section, or generate a networking message..."
            suggestions={SUGGESTIONS}
            emptyStateTitle="Chat alongside your LinkedIn profile"
            emptyStateBody="You can also use the tabs above directly."
          />
        </>
      )}
    </div>
  );
}

export default function LinkedinOptimizerPage() {
  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">LinkedIn Profile Optimizer</p>

          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">A recruiter-grade LinkedIn profile, built from your real resume</h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Generate a complete headline, About section, experience, projects, skills, SEO analysis, profile score,
            and recruiter outreach messages — grounded in your actual resume, never fabricated.
          </p>
        </div>

        <Suspense fallback={null}>
          <LinkedinOptimizerContent />
        </Suspense>
      </div>
    </section>
  );
}
