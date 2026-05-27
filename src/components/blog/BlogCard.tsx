import Link from "next/link";

type BlogCardProps = {
  slug: string;
  title: string;
  excerpt: string | null;
  tags: string[];
  created_at: string;
};

export default function BlogCard({
  slug,
  title,
  excerpt,
  tags,
  created_at,
}: BlogCardProps) {
  return (
    <Link
      href={`/blog/${slug}`}
      className="rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >
      <h2 className="text-2xl font-bold">{title}</h2>

      {excerpt && <p className="mt-3 text-gray-600">{excerpt}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {tags?.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
          >
            {tag}
          </span>
        ))}
      </div>

      <p className="mt-5 text-sm text-gray-500">
        {new Date(created_at).toDateString()}
      </p>
    </Link>
  );
}