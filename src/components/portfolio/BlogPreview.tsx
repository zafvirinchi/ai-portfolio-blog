import Link from "next/link";
import { getPublishedBlogs } from "@/lib/admin/blog-service";

export default async function BlogPreview() {
  const blogs = await getPublishedBlogs();

  if (!blogs.length) {
    return null;
  }

  return (
    <section className="bg-slate-50 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
              Technical Articles
            </p>

            <h2 className="mt-3 text-4xl font-bold text-slate-900">
              Latest Blogs
            </h2>

            <p className="mt-4 max-w-3xl text-lg text-slate-600">
              Practical technical articles on Java, Spring Boot, Angular,
              Microservices, AWS, AI and system design.
            </p>
          </div>

          <Link
            href="/blog"
            className="hidden rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-white md:inline-flex"
          >
            View All
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {blogs.slice(0, 3).map((blog) => (
            <Link
              key={blog.id}
              href={`/blog/${blog.slug}`}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <h3 className="text-2xl font-bold text-slate-900">
                {blog.title}
              </h3>

              {blog.excerpt && (
                <p className="mt-4 text-slate-600">{blog.excerpt}</p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {blog.tags?.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <p className="mt-6 text-sm text-slate-500">
                {new Date(blog.created_at).toDateString()}
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-8 md:hidden">
          <Link
            href="/blog"
            className="inline-flex rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-white"
          >
            View All Blogs
          </Link>
        </div>
      </div>
    </section>
  );
}