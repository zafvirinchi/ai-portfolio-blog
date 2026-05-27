type PageHeaderProps = {
  label: string;
  title: string;
  description: string;
};

export default function PageHeader({ label, title, description }: PageHeaderProps) {
  return (
    <div className="max-w-4xl">
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
        {label}
      </p>

      <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
        {title}
      </h1>

      <p className="mt-5 text-lg leading-8 text-slate-600">
        {description}
      </p>
    </div>
  );
}