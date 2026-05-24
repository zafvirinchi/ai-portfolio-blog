import Link from "next/link";
import Badge from "@/components/ui/Badge";

type QuestionCardProps = {
  slug: string;
  category: string;
  title: string;
  level: string;
  tags: string[];
};

export default function QuestionCard({
  slug,
  category,
  title,
  level,
  tags,
}: QuestionCardProps) {
  return (
    <Link
      href={`/interview-questions/${category}/${slug}`}
      className="rounded-xl border p-6 shadow-sm transition hover:shadow-md"
    >
      <h2 className="text-2xl font-semibold">{title}</h2>

      <p className="mt-3 text-sm text-gray-500">Level: {level}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>
    </Link>
  );
}