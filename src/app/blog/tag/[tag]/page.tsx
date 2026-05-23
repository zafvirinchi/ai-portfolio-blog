import Link from "next/link";
import { getAllTags, getPostsByTag } from "@/lib/mdx";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ tag: string }>;
};

export async function generateStaticParams() {
  return getAllTags().map((tag) => ({
    tag,
  }));
}

export default async function BlogTagPage({ params }: PageProps) {
  const { tag } = await params;
  const posts = getPostsByTag(tag);

  if (!posts.length) {
    notFound();
  }

  return (
    <main className="px-6 py-16 md:px-16 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <Link href="/blog" className="mb-6 inline-block text-blue-600 hover:underline">
          ← Back to Blog
        </Link>

        <h1 className="mb-4 text-4xl font-bold">Tag: {tag}</h1>
        <p className="mb-10 text-lg text-gray-600">
          Posts related to {tag}.
        </p>

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
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}