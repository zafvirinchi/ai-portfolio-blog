import { notFound } from "next/navigation";
import BlogForm from "@/components/admin/BlogForm";
import { getBlogById } from "@/lib/admin/blog-service";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditBlogPage({ params }: Props) {
  const { id } = await params;
  const blog = await getBlogById(id);

  if (!blog) {
    notFound();
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-3xl font-bold">Edit Blog</h1>

      <div className="mt-8">
        <BlogForm blog={blog} />
      </div>
    </section>
  );
}