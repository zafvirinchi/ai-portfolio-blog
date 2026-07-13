import { KnowledgeStatsSummary } from "@/types/knowledge";

type Props = {
  stats: KnowledgeStatsSummary;
  averageProcessingTimeMs: number | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function KnowledgeStats({ stats, averageProcessingTimeMs }: Props) {
  const cards = [
    { label: "Total Documents", value: stats.totalDocuments.toLocaleString() },
    { label: "Total Chunks", value: stats.totalChunks.toLocaleString() },
    { label: "Total Embeddings", value: stats.totalEmbeddings.toLocaleString() },
    { label: "Latest Upload", value: formatDate(stats.latestUploadAt) },
    {
      label: "Avg. Processing Time",
      value: formatDuration(averageProcessingTimeMs),
      hint: averageProcessingTimeMs == null ? undefined : "Uploads this session",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {card.label}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
          {card.hint && <p className="mt-1 text-xs text-slate-400">{card.hint}</p>}
        </div>
      ))}
    </div>
  );
}
