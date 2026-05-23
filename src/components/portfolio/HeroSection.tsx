import ResumeButton from "./ResumeButton";

export default function HeroSection() {
  return (
    <section className="px-6 py-20 md:px-16 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-600">
          Full Stack Java Architect-in-Progress
        </p>

        <h1 className="mb-6 text-4xl font-bold leading-tight md:text-6xl">
          Zafrul Islam
        </h1>

        <h2 className="mb-6 text-xl font-semibold text-gray-700 md:text-2xl">
          Java, Spring Boot, Angular, AWS, Microservices, AI-enabled Products
        </h2>

        <p className="mb-8 max-w-3xl text-lg leading-8 text-gray-600">
          I design and build scalable enterprise applications with Java, Spring
          Boot, Angular, Node.js, AWS, and microservices. My focus is on secure,
          high-performance systems that solve real business problems across
          government, banking, healthcare, and enterprise domains.
        </p>

        <div className="flex flex-wrap gap-4">
          <a
            href="/projects"
            className="rounded-lg bg-black px-6 py-3 text-white transition hover:opacity-90"
          >
            View Projects
          </a>

          <a
            href="/contact"
            className="rounded-lg border border-gray-300 px-6 py-3 transition hover:bg-gray-100"
          >
            Contact Me
          </a>

          <ResumeButton />
        </div>
      </div>
    </section>
  );
}