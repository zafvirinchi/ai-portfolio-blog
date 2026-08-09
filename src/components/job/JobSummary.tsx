import type { JobDescription } from "@/lib/ai/job/job-schema";

type Props = {
  job: JobDescription;
};

// A deterministic, templated "at a glance" sentence built from the parsed
// fields — no LLM call, consistent with this milestone's "no comparison,
// just parsing" scope (the JSON schema itself has no free-text summary
// field, so this is computed client-side from what was extracted).
function buildSummarySentence(job: JobDescription): string {
  const parts: string[] = [];

  const role = job.jobTitle ?? "This role";
  const company = job.companyName ? ` at ${job.companyName}` : "";
  parts.push(`${role}${company}`);

  if (job.domain) parts.push(`in the ${job.domain} domain`);

  const experience = job.experienceRequired.raw
    ? `requires ${job.experienceRequired.raw}`
    : job.experienceRequired.minYears !== null
      ? `requires ${job.experienceRequired.minYears}+ years of experience`
      : null;
  if (experience) parts.push(experience);

  if (job.workMode) parts.push(`(${job.workMode})`);

  const location = [job.location.city, job.location.country].filter(Boolean).join(", ");
  if (location) parts.push(`based in ${location}`);

  const topSkills = [...job.mandatorySkills, ...job.requiredSkills].slice(0, 5);
  const skillsSentence = topSkills.length > 0 ? `Key skills: ${topSkills.join(", ")}.` : null;

  return `${parts.join(" ")}.${skillsSentence ? ` ${skillsSentence}` : ""}`;
}

export default function JobSummary({ job }: Props) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">At a Glance</p>
      <p className="mt-2 text-sm leading-6 text-blue-900">{buildSummarySentence(job)}</p>
    </div>
  );
}
