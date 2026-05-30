import Link from "next/link";
import { getAllBlogs } from "@/lib/admin/blog-service";
import DeleteButton from "@/components/admin/DeleteButton";
import { Blog } from "@/types/blog";

export default async function AdminBlogsPage() {
  const blogs: Blog[] = await getAllBlogs();

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold">Blogs</h1>
        </div>

        <Link
          href="/admin/blogs/new"
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
        >
          New Blog
        </Link>
      </div>

      <div className="mt-8 space-y-4">
        {blogs.map((blog: Blog) => (
          <div
            key={blog.id}
            className="flex items-center justify-between rounded-2xl border bg-white p-5 shadow-sm"
          >
            <div>
              <h2 className="text-xl font-bold">{blog.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{blog.slug}</p>
              <p className="mt-1 text-sm">
                {blog.is_published ? "Published" : "Draft"}
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                href={`/admin/blogs/${blog.id}/edit`}
                className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Edit
              </Link>

              <DeleteButton id={blog.id} />
            </div>
          </div>
        ))}

        {blogs.length === 0 && (
          <div className="rounded-2xl border bg-white p-6 text-slate-600">
            No blogs found.
          </div>
        )}
      </div>
    </section>
  );
}