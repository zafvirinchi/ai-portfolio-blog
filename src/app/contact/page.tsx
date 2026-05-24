import ContactForm from "@/components/contact/ContactForm";

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">Contact</h1>

      <p className="mt-4 text-gray-600">
        You can reach me for collaboration, job opportunities, technical
        discussions or project work.
      </p>

      <ContactForm />
    </section>
  );
}