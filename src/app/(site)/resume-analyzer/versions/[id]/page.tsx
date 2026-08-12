"use client";

import { use } from "react";

import VersionDetail from "@/components/resume/versions/VersionDetail";

export default function ResumeVersionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <VersionDetail versionId={id} />
      </div>
    </section>
  );
}
