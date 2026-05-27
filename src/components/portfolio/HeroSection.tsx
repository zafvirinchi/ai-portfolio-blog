import Link from "next/link";

export default function HeroSection() {
  return (
    <section className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-300">
          Full Stack Developer • Java • Spring Boot • Angular • AI
        </p>

        <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
          Building scalable enterprise applications and AI-powered developer knowledge platforms.
        </h1>

        <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
          Explore my blogs, real-world projects, interview questions, and AI assistant for Java,
          Spring Boot, Angular, Microservices, AWS, Kafka and System Design.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/interview-questions" className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700">
            Start Interview Prep
          </Link>

          <Link href="/blog" className="rounded-xl border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">
            Read Blogs
          </Link>

          <a href="/zafrul-islam-resume.pdf" className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 hover:bg-slate-100">
            Download Resume
          </a>
        </div>
      </div>
    </section>
  );
}