import BlogCard from "@/components/blog/BlogCard";
import PageHeader from "@/components/ui/PageHeader";
import { getPublishedBlogs } from "@/lib/admin/blog-service";

export default async function BlogPage() {
  const blogs = await getPublishedBlogs();

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
      <PageHeader
        label="Technical Blog"
        title="Blogs and Articles"
        description="Practical articles on Java, Spring Boot, Angular, Microservices, AWS, System Design and AI."
      />

      {blogs.length === 0 && (
        <div className="mt-10 rounded-2xl border border-yellow-200 bg-yellow-50 p-6 text-yellow-800">
          No blogs found.
        </div>
      )}

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {blogs.map((blog) => (
          <BlogCard key={blog.id} {...blog} />
        ))}
      </div>
    </section>
  );
}