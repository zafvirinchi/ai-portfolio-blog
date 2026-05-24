import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getBlogPostBySlug, getBlogPosts } from "@/lib/mdx";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getBlogPosts().map((post) => ({
    slug: post.slug,
  }));
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">{post.title}</h1>

      <p className="mt-4 text-sm text-gray-500">
        {post.date} · {post.readingTime}
      </p>

      <div className="mt-8 prose prose-lg max-w-none">
        <MDXRemote source={post.content} />
      </div>
    </article>
  );
}