export default function AnalyticsEmptyState({ message = "No data recorded yet for this period." }: { message?: string }) {
  return <p className="p-6 text-center text-sm text-slate-500">{message}</p>;
}
