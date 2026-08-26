"use client";

import { useState } from "react";
import Link from "next/link";

// Phase 23 Milestone 3 — audit finding: Navbar.tsx's feature links
// (Resume Analyzer, Job Match, Recruiter, Billing, ...) are wrapped in
// `hidden md:flex` — a mobile visitor had no way to reach any of them
// except by typing the URL directly, even after Phase 23 M1 added the
// Login/Sign-Up/My-Account CTA outside that wrapper. This is the
// smallest fix: a plain disclosure toggle reusing the exact same links
// array, visible only below the md breakpoint (`md:hidden`), with no new
// routing/auth logic of its own.
export default function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50"
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full flex flex-col gap-3 border-b border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="hover:text-blue-600">
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
