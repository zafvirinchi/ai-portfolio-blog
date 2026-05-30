import HeroSection from "@/components/portfolio/HeroSection";
import InterviewCategoriesPreview from "@/components/interview/InterviewCategoriesPreview";
import BlogPreview from "@/components/portfolio/BlogPreview";
import SkillsGrid from "@/components/portfolio/SkillsGrid";
import ChatBox from "@/components/ai/ChatBox";

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

          <div className="mt-8">
            <ChatBox />
          </div>
        </div>
      </section>

      <InterviewCategoriesPreview />
      <BlogPreview />
      <SkillsGrid />
    </>
  );
}