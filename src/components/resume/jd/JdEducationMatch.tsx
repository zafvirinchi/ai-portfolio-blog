import type { JdMatchResult } from "@/lib/ai/job-description/jd-schema";

type Props = {
  result: JdMatchResult;
};

export default function JdEducationMatch({ result }: Props) {
  const { educationMatch } = result;

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Education &amp; Certification Match</p>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Matched</p>
        {educationMatch.matched.length > 0 ? (
          <ul className="space-y-1 text-sm text-slate-600">
            {educationMatch.matched.map((item) => (
              <li key={item}>✓ {item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">None</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Missing</p>
        {educationMatch.missing.length > 0 ? (
          <ul className="space-y-1 text-sm text-red-600">
            {educationMatch.missing.map((item) => (
              <li key={item}>✗ {item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">None</p>
        )}
      </div>

      {educationMatch.betterAlternatives.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Related certifications you already have</p>
          <ul className="space-y-1 text-sm text-amber-700">
            {educationMatch.betterAlternatives.map((item) => (
              <li key={item}>~ {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
