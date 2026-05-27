import Link from "next/link";

const cards = [
  {
    href: "/admin/interview-categories",
    title: "Interview Categories",
    desc: "Manage Java, Spring Boot, Angular, AWS and more.",
  },
  {
    href: "/admin/interview-topics",
    title: "Interview Topics",
    desc: "Manage Core Java, Collections, REST API and topics.",
  },
  {
    href: "/admin/interview-questions",
    title: "Interview Questions",
    desc: "Create, update and publish Q&A content.",
  },
  {
    href: "/admin/blogs",
    title: "Blogs",
    desc: "Write and manage technical blog articles.",
  },
  {
    href: "/admin/projects",
    title: "Projects",
    desc: "Manage portfolio project case studies.",
  },
  {
    href: "/admin/rag-documents",
    title: "RAG Documents",
    desc: "Manage AI assistant knowledge base.",
  },
];

export default function AdminPage() {
  return (
    <section>
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 to-blue-900 p-8 text-white shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-200">
          Dashboard
        </p>

        <h1 className="mt-3 text-4xl font-bold">Welcome back, Zafrul</h1>

        <p className="mt-3 max-w-2xl text-slate-300">
          Manage blogs, interview questions, projects, and AI knowledge base from one place.
        </p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <h2 className="text-xl font-bold text-slate-900">{card.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{card.desc}</p>
            <p className="mt-5 text-sm font-semibold text-blue-600">
              Manage →
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}