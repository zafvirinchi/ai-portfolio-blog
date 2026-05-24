import Link from "next/link";
import ResumeButton from "@/components/portfolio/ResumeButton";

export default function HeroSection() {
  return (
    <section className="bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-blue-600">
          Full Stack Developer
        </p>

        <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-gray-900 md:text-6xl">
          Building scalable web apps with Java, Spring Boot, Angular, AWS and AI.
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-gray-600">
          I write practical blogs and interview questions on Java, Spring Boot,
          Angular, Microservices, System Design and AI-enabled development.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/interview-questions"
            className="rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
          >
            Explore Interview Q&A
          </Link>

          <Link
            href="/blog"
            className="rounded-lg border px-5 py-3 hover:bg-gray-50"
          >
            Read Blog
          </Link>

          <ResumeButton />
        </div>
      </div>
    </section>
  );
}