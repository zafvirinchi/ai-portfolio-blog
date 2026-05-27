import ContactForm from "@/components/contact/ContactForm";
import PageHeader from "@/components/ui/PageHeader";

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16 md:py-20">
      <PageHeader
        label="Contact"
        title="Let’s Connect"
        description="Reach out for collaboration, job opportunities, technical discussions, or project work."
      />

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ContactForm />
      </div>
    </section>
  );
}