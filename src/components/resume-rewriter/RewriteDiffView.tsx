import { wordDiff, DiffTokenType } from "@/lib/ai/resume-rewriter/rewrite-history";

type Props = {
  original: string;
  rewritten: string;
};

const TONE: Record<DiffTokenType, string> = {
  added: "rounded bg-green-200 px-0.5 text-green-900",
  modified: "rounded bg-amber-200 px-0.5 text-amber-900",
  reordered: "rounded bg-slate-200 px-0.5 text-slate-700",
  unchanged: "",
};

/** Green = Added, Yellow = Modified, Grey = Reordered — matches the spec's side-by-side legend, rendered inline as a word-level diff of the rewritten text against its original. */
export default function RewriteDiffView({ original, rewritten }: Props) {
  const tokens = wordDiff(original, rewritten);

  return (
    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
      {tokens.map((token, index) => (
        <span key={index} className={TONE[token.type] || undefined}>
          {token.text}
        </span>
      ))}
    </p>
  );
}
