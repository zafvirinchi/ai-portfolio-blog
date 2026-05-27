import AdminLoginForm from "@/components/admin/AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <section className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-4xl font-bold">Admin Login</h1>

      <p className="mt-4 text-gray-600">
        Login to manage blogs, interview questions and RAG documents.
      </p>

      <AdminLoginForm />
    </section>
  );
}