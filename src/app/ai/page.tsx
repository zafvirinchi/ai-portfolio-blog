export default function AiPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-4xl font-bold">AI Assistant</h1>

      <p className="mt-4 text-gray-600">
        This page will later allow users to ask questions about my blogs,
        projects, interview questions and experience.
      </p>

      <div className="mt-8 rounded-xl border bg-gray-50 p-6">
        <h2 className="text-2xl font-semibold">Coming Features</h2>

        <ul className="mt-4 list-disc space-y-2 pl-6 text-gray-700">
          <li>Ask questions from my portfolio</li>
          <li>Search Java, Spring Boot and Angular interview questions</li>
          <li>Generate interview preparation plans</li>
          <li>Match my profile with job descriptions</li>
        </ul>
      </div>
    </section>
  );
}