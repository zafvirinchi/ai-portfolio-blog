import type { JobDescription } from "@/lib/ai/job/job-schema";

type Props = {
  job: JobDescription;
};

function formatSalary(salary: JobDescription["salary"]): string | null {
  if (salary.raw) return salary.raw;

  if (salary.min !== null || salary.max !== null) {
    const range = [salary.min, salary.max].filter((value) => value !== null).join(" - ");
    const currency = salary.currency ? `${salary.currency} ` : "";
    const period = salary.period ? ` / ${salary.period}` : "";
    return `${currency}${range}${period}`;
  }

  return null;
}

function formatBoolean(value: boolean | null): string {
  if (value === null) return "Not specified";
  return value ? "Yes" : "No";
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value ?? "Not specified"}</p>
    </div>
  );
}

export default function JobBenefits({ job }: Props) {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Benefits &amp; Logistics</p>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Benefits</p>
        {job.benefits.length > 0 ? (
          <ul className="space-y-1 text-sm text-slate-600">
            {job.benefits.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">None listed</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Field label="Salary" value={formatSalary(job.salary)} />
        <Field label="Visa Sponsorship" value={formatBoolean(job.visaSponsorship)} />
        <Field label="Relocation" value={formatBoolean(job.relocation)} />
        <Field label="Travel" value={job.travel} />
        <Field label="Security Clearance" value={job.securityClearance} />
        <Field label="Team Size" value={job.teamSize} />
        <Field label="Hiring Manager" value={job.hiringManager} />
        <Field label="Recruitment Agency" value={job.recruitmentAgency} />
      </div>
    </div>
  );
}
