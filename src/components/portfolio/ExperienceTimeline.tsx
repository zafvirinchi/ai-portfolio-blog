const experiences = [
  {
    role: "Full Stack Developer",
    company: "Government / Enterprise Projects",
    period: "Recent Years",
    description:
      "Built secure and scalable applications using Java, Spring Boot, Angular, NestJS, AWS, and microservices for government-grade and enterprise systems.",
  },
  {
    role: "Full Stack Developer",
    company: "Commercial Bank of Dubai",
    period: "Project Experience",
    description:
      "Worked on secure banking workflows, loan dashboard features, account validation, caching, and performance-focused full stack development.",
  },
  {
    role: "Software Engineer",
    company: "Healthcare Product Development",
    period: "Earlier Experience",
    description:
      "Developed hospital systems including Doctor Portal, Patient Center, CRM, video consultation, scheduling, reporting, and database optimization.",
  },
];

export default function ExperienceTimeline() {
  return (
    <section className="bg-gray-50 px-6 py-16 md:px-16 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-10 text-3xl font-bold">Experience Timeline</h2>

        <div className="space-y-8">
          {experiences.map((item, index) => (
            <div key={index} className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold">
                {item.role} · {item.company}
              </h3>
              <p className="mt-1 text-sm text-gray-500">{item.period}</p>
              <p className="mt-4 text-gray-600 leading-7">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}