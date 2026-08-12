import type { JdMatchResult } from "@/lib/ai/job-description/jd-schema";

type Props = {
  result: JdMatchResult;
};

// Milestone 15, §8/§29 — MATCHED / PARTIAL / MISSING, each with its own
// icon (never color alone, per §29's explicit accessibility requirement)
// so status is legible without relying on color perception.

function ChipList({ items, className }: { items: string[]; className: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">None</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className={`rounded-full px-3 py-1 text-sm font-medium ${className}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export default function JdKeywordMatch({ result }: Props) {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">✓ Matched keywords ({result.matchedSkills.length})</p>
        <ChipList items={result.matchedSkills} className="bg-green-50 text-green-700" />
      </div>

      {result.partialSkills.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">◐ Partial matches ({result.partialSkills.length})</p>
          <div className="space-y-1.5">
            {result.partialSkills.map((partial) => (
              <div key={partial.jdSkill} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="font-semibold">{partial.jdSkill}</span> — {partial.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">✕ Missing keywords ({result.missingKeywords.length})</p>
        <ChipList items={result.missingKeywords} className="bg-red-50 text-red-700" />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          + Additional skills on your resume ({result.additionalSkills.length})
        </p>
        <ChipList items={result.additionalSkills} className="bg-blue-50 text-blue-700" />
      </div>
    </div>
  );
}
