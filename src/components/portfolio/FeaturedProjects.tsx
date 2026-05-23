const projects = [
  {
    title: "Government E-Authorization Platform",
    description:
      "Built secure and scalable authorization workflows for high-volume users using Angular, NestJS, microservices, and AWS.",
    tech: ["Angular", "NestJS", "AWS", "Microservices"],
  },
  {
    title: "Banking Loan Dashboard & Autopay Module",
    description:
      "Developed customer-facing banking features with validation, secure workflows, and performance improvements.",
    tech: ["Java", "Spring Boot", "Angular", "Caching"],
  },
  {
    title: "AI-enabled Portfolio & Blog",
    description:
      "Building a modern portfolio with MDX blog, semantic search, embeddings, and AI assistant using Next.js and Supabase.",
    tech: ["Next.js", "TypeScript", "Supabase", "OpenAI"],
  },
];

export default function FeaturedProjects() {
  return (
    <section className="bg-gray-50 px-6 py-16 md:px-16 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-10 text-3xl font-bold">Featured Projects</h2>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.title} className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="mb-3 text-xl font-semibold">{project.title}</h3>
              <p className="mb-4 text-gray-600 leading-7">{project.description}</p>
              <div className="flex flex-wrap gap-2">
                {project.tech.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}