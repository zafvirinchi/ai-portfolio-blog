const skillCategories = [
  {
    title: "Backend",
    skills: ["Java", "Spring Boot", "Node.js", "NestJS", "Microservices", "REST APIs"],
  },
  {
    title: "Frontend",
    skills: ["Angular", "React", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind"],
  },
  {
    title: "Cloud & DevOps",
    skills: ["AWS", "Docker", "CI/CD", "Elastic Beanstalk", "S3", "EC2"],
  },
  {
    title: "Data & Messaging",
    skills: ["PostgreSQL", "MySQL", "MongoDB", "Kafka"],
  },
];

export default function SkillsGrid() {
  return (
    <section className="px-6 py-16 md:px-16 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-10 text-3xl font-bold">Skills</h2>

        <div className="grid gap-6 md:grid-cols-2">
          {skillCategories.map((category) => (
            <div key={category.title} className="rounded-xl border p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-semibold">{category.title}</h3>
              <div className="flex flex-wrap gap-3">
                {category.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700"
                  >
                    {skill}
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