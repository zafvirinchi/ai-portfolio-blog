import Link from "next/link";
import { getBlogPosts } from "@/lib/mdx";

export default function BlogPreview() {
  const posts = getBlogPosts().slice(0, 3);

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-3xl font-bold">Latest Blog Posts</h2>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="rounded-xl border p-6 shadow-sm transition hover:shadow-md"
          >
            <h3 className="text-xl font-semibold">{post.title}</h3>

            <p className="mt-3 text-gray-600">{post.excerpt}</p>

            <p className="mt-4 text-sm text-gray-500">
              {post.date} · {post.readingTime}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}