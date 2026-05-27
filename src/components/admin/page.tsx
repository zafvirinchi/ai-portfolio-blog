import Link from "next/link";

const cards = [
  {
    title: "Blogs",
    description: "Create, update and publish technical articles.",
    href: "/admin/blogs",
  },
  {
    title: "Interview Categories",
    description: "Manage Java, Spring Boot, Angular and more.",
    href: "/admin/interview-categories",
  },
  {
    title: "Interview Topics",
    description: "Organize questions topic-wise.",
    href: "/admin/interview-topics",
  },
  {
    title: "Interview Questions",
    description: "Create and manage Q&A content.",
    href: "/admin/questions",
  },
  {
    title: "Projects",
    description: "Showcase your real-world portfolio projects.",
    href: "/admin/projects",
  },
  {
    title: "RAG Documents",
    description: "Manage AI assistant knowledge base.",
    href: "/admin/rag-documents",
  },
];

export default function AdminDashboardPage() {
  return (
    <section>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Admin Dashboard
        </p>
        <h1 className="mt-2 text-4xl font-bold text-gray-900">
          Content Management
        </h1>
        <p className="mt-3 max-w-2xl text-gray-600">
          Manage blogs, interview questions, portfolio projects and RAG documents
          from one professional admin panel.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <h2 className="text-xl font-bold text-gray-900">{card.title}</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              {card.description}
            </p>
            <span className="mt-5 inline-block text-sm font-medium text-blue-600">
              Manage →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}