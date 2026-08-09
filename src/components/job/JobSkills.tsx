import type { JobDescription } from "@/lib/ai/job/job-schema";

type Props = {
  job: JobDescription;
};

function ChipGroup({ title, items, className }: { title: string; items: string[]; className: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">
        {title} ({items.length})
      </p>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className={`rounded-full px-3 py-1 text-sm font-medium ${className}`}>
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">None listed</p>
      )}
    </div>
  );
}

export default function JobSkills({ job }: Props) {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Skills</p>

      <ChipGroup title="Mandatory Skills" items={job.mandatorySkills} className="bg-red-50 text-red-700" />
      <ChipGroup title="Required Skills" items={job.requiredSkills} className="bg-blue-50 text-blue-700" />
      <ChipGroup title="Preferred Skills" items={job.preferredSkills} className="bg-amber-50 text-amber-700" />
      <ChipGroup title="Nice to Have Skills" items={job.niceToHaveSkills} className="bg-slate-100 text-slate-600" />
      <ChipGroup title="Soft Skills" items={job.softSkills} className="bg-green-50 text-green-700" />
    </div>
  );
}
