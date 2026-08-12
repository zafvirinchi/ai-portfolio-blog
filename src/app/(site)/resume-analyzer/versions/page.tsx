"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import VersionsList from "@/components/resume/versions/VersionsList";

function VersionsPageContent() {
  const searchParams = useSearchParams();
  const sourceResumeId = searchParams.get("resumeId") ?? undefined;

  return <VersionsList sourceResumeId={sourceResumeId} />;
}

export default function ResumeVersionsPage() {
  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={<p className="text-sm text-slate-500">Loading...</p>}>
          <VersionsPageContent />
        </Suspense>
      </div>
    </section>
  );
}
