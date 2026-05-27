type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-4xl font-bold">Project Detail</h1>

      <p className="mt-4 text-gray-600">
        Project slug: <span className="font-semibold">{slug}</span>
      </p>

      <p className="mt-4 text-gray-600">
        Dynamic project content from database will be implemented in the next
        phase.
      </p>
    </section>
  );
}