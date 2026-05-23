import Link from "next/link";
import { getAllPosts } from "@/lib/mdx";

export default function BlogPreview() {
  const posts = getAllPosts().slice(0, 3);

  return (
    <section className="px-6 py-16 md:px-16 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Latest Blogs</h2>
          <Link href="/blog" className="text-blue-600 hover:underline">
            View all
          </Link>
        </div>

        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block rounded-xl border p-5 transition hover:bg-gray-50"
            >
              <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span>{post.publishedAt}</span>
                <span>•</span>
                <span>{post.readingTime}</span>
              </div>
              <h3 className="text-lg font-semibold">{post.title}</h3>
              <p className="mt-2 text-gray-600">{post.excerpt}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}