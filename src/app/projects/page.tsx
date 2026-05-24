import Link from "next/link";
import { projects } from "@/lib/projects";

export default function ProjectsPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-4xl font-bold">Projects</h1>

      <p className="mt-4 text-gray-600">
        Real-world project experience in Java, Spring Boot, Angular, AWS and AI-enabled systems.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {projects.map((project) => (
          <Link
            href={`/projects/${project.slug}`}
            key={project.slug}
            className="rounded-xl border p-6 shadow-sm transition hover:shadow-md"
          >
            <h2 className="text-2xl font-semibold">{project.title}</h2>

            <p className="mt-3 text-gray-600">{project.description}</p>

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
          </Link>
        ))}
      </div>
    </section>
  );
}