import HeroSection from "@/components/portfolio/HeroSection";
import InterviewCategoriesPreview from "@/components/interview/InterviewCategoriesPreview";
import BlogPreview from "@/components/portfolio/BlogPreview";
import SkillsGrid from "@/components/portfolio/SkillsGrid";

export default function HomePage() {
  return (
    <>
      <HeroSection />

      <section className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-4xl font-bold text-slate-900">
            Ask me anything
          </h2>

          <p className="mt-4 text-lg text-slate-600">
            Ask about my skills, projects, blogs, interview questions, and
            professional experience.
          </p>

          <div className="mt-8 rounded-3xl border bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-8 text-white shadow-xl">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-blue-300">
                AI Portfolio Assistant
              </p>

              <h3 className="mt-4 text-3xl font-bold">
                Ask questions about my skills, projects, blogs and interview preparation.
              </h3>

              <p className="mt-4 text-slate-300">
                Get instant answers powered by my professional profile, RAG documents,
                blogs and interview Q&A knowledge base.
              </p>

              <a
                href="/ai"
                className="mt-6 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
              >
                Open AI Assistant
              </a>
            </div>
          </div>
        </div>
      </section>

      <InterviewCategoriesPreview />
      <BlogPreview />
      <SkillsGrid />
    </>
  );
}