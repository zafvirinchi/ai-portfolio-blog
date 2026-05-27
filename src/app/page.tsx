import HeroSection from "@/components/portfolio/HeroSection";
import InterviewCategoriesPreview from "@/components/interview/InterviewCategoriesPreview";
import BlogPreview from "@/components/portfolio/BlogPreview";
import SkillsGrid from "@/components/portfolio/SkillsGrid";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <InterviewCategoriesPreview />
      <BlogPreview />
      <SkillsGrid />
    </>
  );
}