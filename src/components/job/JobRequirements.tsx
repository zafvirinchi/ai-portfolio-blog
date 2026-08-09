import type { JobDescription } from "@/lib/ai/job/job-schema";

type Props = {
  job: JobDescription;
};

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-1 text-sm text-slate-600">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">None specified</p>
      )}
    </div>
  );
}

export default function JobRequirements({ job }: Props) {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Requirements</p>

      <ListSection title="Qualifications" items={job.qualifications} />
      <ListSection title="Education" items={job.education} />
      <ListSection title="Certifications" items={job.certifications} />
    </div>
  );
}
