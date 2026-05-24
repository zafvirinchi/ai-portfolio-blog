const skills = [
  "Java",
  "Spring Boot",
  "Microservices",
  "Angular",
  "TypeScript",
  "Node.js",
  "NestJS",
  "AWS",
  "Kafka",
  "PostgreSQL",
  "Docker",
  "LLM / RAG",
];

export default function SkillsGrid() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-3xl font-bold">Technical Skills</h2>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {skills.map((skill) => (
          <div key={skill} className="rounded-xl border bg-white p-4 shadow-sm">
            {skill}
          </div>
        ))}
      </div>
    </section>
  );
}