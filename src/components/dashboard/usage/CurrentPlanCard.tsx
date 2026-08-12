import Link from "next/link";

import type { ResolvedSubscription } from "@/lib/billing/billing-types";

export default function CurrentPlanCard({
  subscription,
  busy,
  onManagePayment,
  onCancel,
  onResume,
}: {
  subscription: ResolvedSubscription;
  busy: string | null;
  onManagePayment: () => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Current Plan</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{subscription.plan.name}</p>
          <p className="mt-1 text-sm text-slate-500">
            Status: {subscription.status}
            {subscription.current_period_end && ` · Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}
            {subscription.cancel_at && ` · Cancels ${new Date(subscription.cancel_at).toLocaleDateString()}`}
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/billing/plans" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            {subscription.isImplicitFree ? "Upgrade Plan" : "Change Plan"}
          </Link>
          {!subscription.isImplicitFree && (
            <button
              onClick={onManagePayment}
              disabled={busy === "portal"}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Manage Payment Method
            </button>
          )}
        </div>
      </div>

      {!subscription.isImplicitFree && (
        <div className="mt-4">
          {subscription.cancel_at ? (
            <button onClick={onResume} disabled={busy === "resume"} className="text-xs font-semibold text-blue-600 hover:underline">
              Resume subscription
            </button>
          ) : (
            <button onClick={onCancel} disabled={busy === "cancel"} className="text-xs font-semibold text-red-600 hover:underline">
              Cancel subscription
            </button>
          )}
        </div>
      )}
    </div>
  );
}
