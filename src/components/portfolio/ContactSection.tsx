export default function ContactSection() {
  return (
    <section className="bg-gray-900 px-6 py-16 text-white md:px-16 lg:px-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-6 text-3xl font-bold">Contact Me</h2>
        <p className="mb-8 text-gray-300">
          Interested in full stack development, solution architecture, or AI-enabled
          product development? Let’s connect.
        </p>

        <form className="grid gap-4">
          <input
            type="text"
            placeholder="Your name"
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3"
          />
          <input
            type="email"
            placeholder="Your email"
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3"
          />
          <textarea
            placeholder="Your message"
            rows={5}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-700"
          >
            Send Message
          </button>
        </form>
      </div>
    </section>
  );
}