type SectionHeadingProps = {
  title: string;
  description?: string;
};

export default function SectionHeading({ title, description }: SectionHeadingProps) {
  return (
    <div>
      <h1 className="text-4xl font-bold">{title}</h1>
      {description && <p className="mt-4 text-gray-600">{description}</p>}
    </div>
  );
}