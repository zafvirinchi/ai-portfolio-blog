import Link from "next/link";

const navItems = [
  { href: "/admin", label: "Dashboard" },

  // Interview Management
  { href: "/admin/interview-categories", label: "Categories" },
  { href: "/admin/interview-topics", label: "Topics" },
  { href: "/admin/interview-questions", label: "Interview Questions" },
  { href: "/admin/interview-import", label: "Interview Import" },

  // Blog Management
  { href: "/admin/blogs", label: "Blogs" },

  // Portfolio Management
  { href: "/admin/projects", label: "Projects" },

  // AI / RAG Management
  { href: "/admin/rag-documents", label: "RAG Documents" },
  { href: "/admin/knowledge", label: "Knowledge Base" },
];

export default function AdminSidebar() {
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Admin Menu
      </p>

      <nav className="space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}