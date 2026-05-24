import Link from "next/link";
import { getBlogPosts } from "@/lib/mdx";

export default function BlogPage() {
  const posts = getBlogPosts();

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-4xl font-bold">Blog</h1>

      <p className="mt-4 text-gray-600">
        Practical articles on Java, Spring Boot, Angular, Microservices, AWS and AI.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="rounded-xl border p-6 shadow-sm transition hover:shadow-md"
          >
            <h2 className="text-2xl font-semibold">{post.title}</h2>

            <p className="mt-3 text-gray-600">{post.excerpt}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
                >
                  {tag}
                </span>
              ))}
            </div>

            <p className="mt-4 text-sm text-gray-500">
              {post.date} · {post.readingTime}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}