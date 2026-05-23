import Link from "next/link";
import { getAllPosts, getAllTags } from "@/lib/mdx";

export default function BlogPage() {
  const posts = getAllPosts();
  const tags = getAllTags();

  return (
    <main className="px-6 py-16 md:px-16 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-4xl font-bold">Blog</h1>
        <p className="mb-10 max-w-3xl text-lg leading-8 text-gray-600">
          Technical writing on Java, Spring Boot, Angular, microservices, AWS,
          architecture, and AI-enabled product development.
        </p>

        <div className="mb-10 flex flex-wrap gap-3">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/blog/tag/${encodeURIComponent(tag)}`}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              {tag}
            </Link>
          ))}
        </div>

        <div className="space-y-6">
          {posts.map((post) => (
            <article key={post.slug} className="rounded-2xl border p-6 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span>{post.publishedAt}</span>
                <span>•</span>
                <span>{post.readingTime}</span>
              </div>

              <h2 className="mb-3 text-2xl font-semibold">
                <Link href={`/blog/${post.slug}`} className="hover:underline">
                  {post.title}
                </Link>
              </h2>

              <p className="mb-4 leading-7 text-gray-600">{post.excerpt}</p>

              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/blog/tag/${encodeURIComponent(tag)}`}
                    className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}