import { TECHNOLOGY_DICTIONARY } from "@/lib/ai/resume-enterprise/ats";
import type { JobDescription } from "@/lib/ai/job/job-schema";

type Props = {
  job: JobDescription;
};

// The 4 categories not already covered by job-schema.ts's own categorized
// fields (Testing/Architecture/Security) are derived from
// resume-enterprise/ats's TECHNOLOGY_DICTIONARY — read-only reuse, same
// cross-package precedent already established by job-description/ats-engine.ts
// in Phase 12. "Messaging" isn't a dictionary category there (Kafka/RabbitMQ
// are filed under "Backend"), so it gets its own small local list.
const MESSAGING_TECHNOLOGIES = ["Kafka", "RabbitMQ", "ActiveMQ", "Amazon SQS", "Amazon SNS", "Pub/Sub", "MQTT"];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function findDictionaryCategoryMatches(job: JobDescription, category: string): string[] {
  const haystack = [...job.technologies, ...job.tools, ...job.keywords].map(normalize);
  const names = TECHNOLOGY_DICTIONARY.filter((entry) => entry.category === category).map((entry) => entry.name);

  return names.filter((name) => haystack.some((term) => term.includes(normalize(name)) || normalize(name).includes(term)));
}

function findListMatches(job: JobDescription, candidates: string[]): string[] {
  const haystack = [...job.technologies, ...job.tools, ...job.keywords].map(normalize);

  return candidates.filter((name) => haystack.some((term) => term.includes(normalize(name)) || normalize(name).includes(term)));
}

function StackGroup({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function JobTechnologyStack({ job }: Props) {
  const groups: { title: string; items: string[] }[] = [
    { title: "Languages", items: job.programmingLanguages },
    { title: "Frameworks", items: job.frameworks },
    { title: "Databases", items: job.databases },
    { title: "Cloud", items: job.cloudPlatforms },
    { title: "DevOps", items: job.devOps },
    { title: "AI", items: job.aiSkills },
    { title: "Testing", items: findDictionaryCategoryMatches(job, "Testing") },
    { title: "Architecture", items: findDictionaryCategoryMatches(job, "Architecture") },
    { title: "Messaging", items: findListMatches(job, MESSAGING_TECHNOLOGIES) },
    { title: "Security", items: findDictionaryCategoryMatches(job, "Security") },
  ];

  const hasAnything = groups.some((group) => group.items.length > 0);

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Technology Stack</p>

      {hasAnything ? (
        groups.map((group) => <StackGroup key={group.title} title={group.title} items={group.items} />)
      ) : (
        <p className="text-sm text-slate-400">No technologies identified.</p>
      )}
    </div>
  );
}
