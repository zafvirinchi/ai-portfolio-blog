import BlogCard from "@/components/blog/BlogCard";
import { getPublishedBlogs } from "@/lib/admin/blog-service";

export default async function BlogPage() {
  const blogs = await getPublishedBlogs();

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <h1 className="text-4xl font-bold">Blogs</h1>

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {blogs.map((blog) => (
          <BlogCard
            key={blog.id}
            slug={blog.slug}
            title={blog.title}
            excerpt={blog.excerpt}
            tags={blog.tags || []}
            created_at={blog.created_at}
          />
        ))}
      </div>
    </section>
  );
}