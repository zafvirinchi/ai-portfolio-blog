import RagDocumentForm from "@/components/admin/RagDocumentForm";

export default function AdminRagDocumentsPage() {
  return (
    <section>
      <h1 className="text-3xl font-bold">RAG Documents</h1>

      <p className="mt-3 text-gray-600">
        Add profile, resume, project, blog, and interview preparation documents
        for AI assistant knowledge base.
      </p>

      <div className="mt-8">
        <RagDocumentForm />
      </div>
    </section>
  );
}