import Link from "next/link";

// Phase 23 Milestone 3 — audit finding: the homepage had zero mention of
// either AI product surface (Job Seeker tools or Recruiter Workspace) —
// only the Navbar's static links exposed them, and only at the md
// breakpoint and up. This is a small, additive section, not a homepage
// redesign — the portfolio identity (HeroSection) stays first and
// dominant; this just gives both personas a clear, direct entry point.
// Both links are always shown to everyone, authenticated or not: each
// destination already self-gates correctly (Resume Analyzer works
// anonymously by design; Recruiter Workspace redirects a signed-out
// visitor to /login?redirect=/recruiter) — hiding one from the "wrong"
// persona would only hurt discovery (e.g. a job seeker who later wants
// to hire), not improve security or UX.
export default function ProductEntryPoints() {
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-3xl font-bold text-slate-900">AI-Powered Career Tools</h2>
        <p className="mt-3 text-slate-600">Free to start — for people looking for their next role, and for recruiters screening candidates.</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <Link
            href="/resume-analyzer"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <h3 className="text-xl font-bold text-slate-900">For Job Seekers</h3>
            <p className="mt-2 text-sm text-slate-600">
              Resume analysis, ATS scoring, JD matching, resume rewriting, interview prep, mock interviews, LinkedIn
              optimization, and cover letters.
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-blue-600">Analyze your resume &rarr;</span>
          </Link>

          <Link href="/recruiter" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md">
            <h3 className="text-xl font-bold text-slate-900">For Recruiters</h3>
            <p className="mt-2 text-sm text-slate-600">
              Post jobs, import candidates, screen against a job description, rank and shortlist, schedule
              interviews, and export reports.
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-blue-600">Open Recruiter Workspace &rarr;</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
