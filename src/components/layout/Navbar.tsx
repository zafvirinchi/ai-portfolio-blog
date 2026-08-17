import Link from "next/link";
import Logo from "./Logo";

// Phase 19 Milestone 1, Step 9 — audit finding: /recruiter (the entire
// Recruiter workspace) and /settings/billing had no link anywhere in
// primary navigation — /recruiter was only reachable by typing the URL,
// and /settings/billing was only ever reached reactively, after an
// UpgradePrompt rejection (never proactively, to just check a plan or
// usage). Both destinations already redirect an unauthenticated visitor
// to /login on their own (unchanged, existing behavior) — adding a
// static link here is safe regardless of session state, exactly like
// the existing Resume Analyzer/Job Match links, which are equally
// reachable by anonymous visitors.
const links = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/interview-questions", label: "Interview Q&A" },
  { href: "/projects", label: "Projects" },
  { href: "/ai", label: "AI Assistant" },
  { href: "/resume-analyzer", label: "Resume Analyzer" },
  { href: "/job-match", label: "Job Match" },
  { href: "/recruiter", label: "Recruiter" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/">
          <Logo />
        </Link>

        <div className="hidden items-center gap-6 text-sm font-medium text-slate-700 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-blue-600">
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}