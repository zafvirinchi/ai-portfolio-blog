import BlogSearch from "@/components/blog/BlogSearch";
import SectionHeading from "@/components/ui/SectionHeading";
import { getBlogPosts } from "@/lib/mdx";

export default function BlogPage() {
  const posts = getBlogPosts();

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <SectionHeading
        title="Blog"
        description="Practical articles on Java, Spring Boot, Angular, Microservices, AWS and AI."
      />

      <BlogSearch posts={posts} />
    </section>
  );
}