import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import ContentCard from "@/components/ui/ContentCard";

export const metadata: Metadata = {
  title: "Projects",
  description: "Selected projects built and shipped by Zafrul Islam.",
};

// Static for now — no projects table/CRUD exists yet (see
// projects/[slug]/page.tsx, still a placeholder). Add entries here until a
// database-backed admin flow is built.
const projects = [
  {
    slug: "legacy-modernization",
    title: "Legacy System Modernization",
    description:
      "Modernizing a legacy application onto a current tech stack and architecture.",
    href: "https://legacy.zafrultechstack.com",
  },
];

export default function ProjectsPage() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
      <PageHeader
        label="Projects"
        title="Selected Work"
        description="A few projects I've built and shipped."
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ContentCard
            key={project.slug}
            href={project.href}
            title={project.title}
            description={project.description}
            footer="View project →"
          />
        ))}
      </div>
    </section>
  );
}
