import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlogBySlug } from "@/lib/admin/blog-service";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

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