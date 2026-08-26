import Link from "next/link";
import Logo from "./Logo";
import MobileNav from "./MobileNav";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

// Phase 23 Milestone 1 — audit finding: this component previously had no
// Login/Sign Up entry point anywhere (and, on top of that, the entire
// `links` block above is only ever visible at the md breakpoint and up —
// mobile visitors saw no navigation at all, not even to the existing
// feature links). Fixed with the smallest correct change: a session-
// aware auth CTA that's visible at every breakpoint, not folded into the
// same `hidden md:flex` block as the feature links (which remain a
// separate, pre-existing, broader mobile-navigation gap outside this
// specific finding's scope). Deliberately just a session check
// (createSupabaseServerClient().auth.getUser() — the same cheap, non-
// Admin-API call already used by every other layout in this app, e.g.
// settings/layout.tsx, recruiter/layout.tsx), not a full persona
// resolution — this component renders on every page in the (site) route
// group, so adding a Supabase Admin API call here would mean paying that
// cost on every single page load for a decision ("is there a session at
// all") that doesn't need it.
async function AuthCta() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return (
      <Link href="/settings/profile" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        My Account
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:text-blue-600">
        Login
      </Link>
      <Link href="/signup" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        Sign Up
      </Link>
    </div>
  );
}

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur relative">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/">
          <Logo />
        </Link>

        <div className="hidden flex-1 items-center gap-6 text-sm font-medium text-slate-700 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-blue-600">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <AuthCta />
          <MobileNav links={links} />
        </div>
      </nav>
    </header>
  );
}