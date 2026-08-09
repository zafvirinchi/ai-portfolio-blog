import type { JobDescription } from "@/lib/ai/job/job-schema";

type Props = {
  job: JobDescription;
};

export default function JobResponsibilities({ job }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Responsibilities</p>

      {job.responsibilities.length > 0 ? (
        <ul className="space-y-2 text-sm text-slate-700">
          {job.responsibilities.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-blue-600">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">No responsibilities listed.</p>
      )}
    </div>
  );
}
