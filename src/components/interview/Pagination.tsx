import Link from "next/link";

type Props = {
  currentPage: number;
  total: number;
  pageSize: number;
  searchParams: {
    q?: string;
    level?: string;
  };
};

export default function Pagination({
  currentPage,
  total,
  pageSize,
  searchParams,
}: Props) {
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  function buildUrl(page: number) {
    const params = new URLSearchParams();

    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.level && searchParams.level !== "all") {
      params.set("level", searchParams.level);
    }

    params.set("page", String(page));

    return `?${params.toString()}`;
  }

  return (
    <div className="mt-8 flex items-center justify-between">
      <Link
        href={buildUrl(currentPage - 1)}
        className={
          currentPage <= 1
            ? "pointer-events-none rounded-lg border px-4 py-2 text-gray-400"
            : "rounded-lg border px-4 py-2 hover:bg-gray-50"
        }
      >
        Previous
      </Link>

      <p className="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </p>

      <Link
        href={buildUrl(currentPage + 1)}
        className={
          currentPage >= totalPages
            ? "pointer-events-none rounded-lg border px-4 py-2 text-gray-400"
            : "rounded-lg border px-4 py-2 hover:bg-gray-50"
        }
      >
        Next
      </Link>
    </div>
  );
}