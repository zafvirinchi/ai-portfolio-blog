import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug, getRelatedPosts } from "@/lib/mdx";
import Link from "next/link";
import path from "path";
import fs from "fs";
import { compileMDX } from "next-mdx-remote/rsc";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post not found",
    };
  }

  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function BlogDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const fullPath = path.join(
    process.cwd(),
    "src/content/blog",
    `${slug}.mdx`
  );

  if (!fs.existsSync(fullPath)) {
    notFound();
  }

  const source = fs.readFileSync(fullPath, "utf8");

  const { content } = await compileMDX({
    source,
    options: {
      parseFrontmatter: true,
    },
  });

  const relatedPosts = getRelatedPosts(post.slug, post.tags, 3);

  return (
    <main className="px-6 py-16 md:px-16 lg:px-24">
      <article className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span>{post.publishedAt}</span>
          <span>•</span>
          <span>{post.readingTime}</span>
        </div>

        <h1 className="mb-4 text-4xl font-bold tracking-tight">{post.title}</h1>
        <p className="mb-8 text-lg leading-8 text-gray-600">{post.excerpt}</p>

        <div className="mb-10 flex flex-wrap gap-2">
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

        <div className="prose prose-lg max-w-none">{content}</div>
      </article>

      {relatedPosts.length > 0 && (
        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="mb-6 text-2xl font-bold">Related Posts</h2>

          <div className="space-y-4">
            {relatedPosts.map((related) => (
              <Link
                key={related.slug}
                href={`/blog/${related.slug}`}
                className="block rounded-xl border p-5 transition hover:bg-gray-50"
              >
                <h3 className="text-lg font-semibold">{related.title}</h3>
                <p className="mt-2 text-gray-600">{related.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}