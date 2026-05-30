import BlogForm from "@/components/admin/BlogForm";

export default function NewBlogPage() {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-3xl font-bold">Create Blog</h1>

      <div className="mt-8">
        <BlogForm />
      </div>
    </section>
  );
}