export default function AnalyticsError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      <p className="font-semibold">Couldn&apos;t load analytics</p>
      <p className="mt-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
          Retry
        </button>
      )}
    </div>
  );
}
