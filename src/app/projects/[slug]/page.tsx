import { notFound } from "next/navigation";
import { projects } from "@/lib/projects";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return projects.map((project) => ({
    slug: project.slug,
  }));
}

export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const project = projects.find((item) => item.slug === slug);

  if (!project) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-4xl font-bold">{project.title}</h1>

      <p className="mt-6 text-lg text-gray-700">{project.description}</p>

      <h2 className="mt-10 text-2xl font-semibold">Tech Stack</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.techStack.map((tech) => (
          <span
            key={tech}
            className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
          >
            {tech}
          </span>
        ))}
      </div>

      <h2 className="mt-10 text-2xl font-semibold">Project Highlights</h2>

      <ul className="mt-4 list-disc space-y-2 pl-6 text-gray-700">
        <li>Designed scalable and maintainable backend architecture.</li>
        <li>Implemented secure API communication and validation.</li>
        <li>Improved performance, maintainability and deployment workflow.</li>
      </ul>
    </section>
  );
}