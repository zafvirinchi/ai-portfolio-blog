import Link from "next/link";

// The CTA always routes into the existing /billing/plans checkout flow
// (Milestone 3) — never a second payment implementation.
export default function UpgradePrompt({ message = "Upgrade your plan to continue using AI features without interruption." }: { message?: string }) {
  return (
    <div className="mt-3">
      <p className="text-sm text-slate-600">{message}</p>
      <Link href="/billing/plans" className="mt-2 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        Upgrade Plan
      </Link>
    </div>
  );
}
