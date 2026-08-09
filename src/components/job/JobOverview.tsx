import type { JobDescription } from "@/lib/ai/job/job-schema";

type Props = {
  job: JobDescription;
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value ?? "Not specified"}</p>
    </div>
  );
}

function formatLocation(location: JobDescription["location"]): string | null {
  const parts = [location.city, location.state, location.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : location.raw;
}

function formatExperience(experience: JobDescription["experienceRequired"]): string | null {
  if (experience.raw) return experience.raw;
  if (experience.minYears !== null && experience.maxYears !== null) {
    return `${experience.minYears}-${experience.maxYears} years`;
  }
  if (experience.minYears !== null) return `${experience.minYears}+ years`;
  return null;
}

export default function JobOverview({ job }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Job Overview</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">{job.jobTitle ?? "Untitled role"}</h2>
      <p className="mt-1 text-slate-600">
        {job.companyName ?? "Company not specified"}
        {job.industry ? ` — ${job.industry}` : ""}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Field label="Job Category" value={job.jobCategory} />
        <Field label="Employment Type" value={job.employmentType} />
        <Field label="Work Mode" value={job.workMode} />
        <Field label="Location" value={formatLocation(job.location)} />
        <Field label="Experience Required" value={formatExperience(job.experienceRequired)} />
        <Field label="Domain" value={job.domain} />
        <Field label="Business Area" value={job.businessArea} />
        <Field label="Role Level" value={job.roleLevel} />
        <Field label="Seniority" value={job.seniority} />
      </div>
    </div>
  );
}
