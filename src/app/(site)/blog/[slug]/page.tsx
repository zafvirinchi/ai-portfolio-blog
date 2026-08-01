import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlogBySlug } from "@/lib/admin/blog-service";
import { stripEmojiForMetadata } from "@/lib/utils/metadata-text";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const blog = await getBlogBySlug(slug);

  if (!blog) {
    return {};
  }

  const description = blog.excerpt ? stripEmojiForMetadata(blog.excerpt) : undefined;

  return {
    title: blog.title,
    description,
    openGraph: {
      type: "article",
      title: blog.title,
      description,
      images: blog.cover_image ? [{ url: blog.cover_image }] : undefined,
      publishedTime: blog.created_at,
      modifiedTime: blog.updated_at,
      tags: blog.tags ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: blog.title,
      description,
      images: blog.cover_image ? [blog.cover_image] : undefined,
    },
  };
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;

  const blog = await getBlogBySlug(slug);

  if (!blog) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
        Blog
      </p>

      <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
        {blog.title}
      </h1>

      {blog.excerpt && (
        <p className="mt-4 text-lg text-gray-600">{blog.excerpt}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {blog.tags?.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
          >
            {tag}
          </span>
        ))}
      </div>

      {blog.cover_image && (
        <img
          src={blog.cover_image}
          alt={blog.title}
          className="mt-8 max-h-[420px] w-full rounded-2xl object-cover"
        />
      )}

      <div className="prose prose-lg mt-10 max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {blog.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}