import Link from "next/link";

type ContentCardProps = {
  href: string;
  title: string;
  description?: string | null;
  footer?: string;
};

export default function ContentCard({
  href,
  title,
  description,
  footer = "Explore →",
}: ContentCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
    >
      <h2 className="text-2xl font-bold text-slate-950 group-hover:text-blue-600">
        {title}
      </h2>

      {description && (
        <p className="mt-4 leading-7 text-slate-600">{description}</p>
      )}

      <p className="mt-6 text-sm font-semibold text-blue-600">
        {footer}
      </p>
    </Link>
  );
}