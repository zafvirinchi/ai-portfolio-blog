import StatCard, { formatMetric } from "./StatCard";
import type { ChurnMetrics, SubscriptionMetrics } from "@/lib/analytics/analytics-types";

export default function SubscriptionAnalytics({ subscriptions, churn }: { subscriptions: SubscriptionMetrics; churn: ChurnMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Free" value={subscriptions.byPlan.free} />
        <StatCard label="Professional" value={subscriptions.byPlan.professional} />
        <StatCard label="Premium" value={subscriptions.byPlan.premium} />
        <StatCard label="Enterprise" value={subscriptions.byPlan.enterprise} />
        <StatCard label="Active Subscriptions" value={subscriptions.activeSubscriptions} />
        <StatCard label="Trials" value={subscriptions.trials} />
        <StatCard label="Cancellations (range)" value={subscriptions.cancellationsInRange} />
        <StatCard label="Expired" value={subscriptions.expiredSubscriptions} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Churn</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
          <StatCard label="Customer Churn" value={formatMetric(churn.customerChurnRate)} />
          <StatCard label="Subscription Churn" value={formatMetric(churn.subscriptionChurnRate)} />
          <StatCard label="Revenue Churn" value={formatMetric(churn.revenueChurn)} />
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{churn.formula}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Plan Conversion</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <StatCard label="Free → Paid" value={formatMetric(subscriptions.planConversion.freeToPaid)} />
          <StatCard label="Trial → Paid" value={formatMetric(subscriptions.planConversion.trialToPaid)} />
          <StatCard label="Professional → Premium" value={formatMetric(subscriptions.planConversion.professionalToPremium)} />
          <StatCard label="Premium → Enterprise" value={formatMetric(subscriptions.planConversion.premiumToEnterprise)} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Upgrades / Downgrades / Renewals</h2>
        </div>
        <div className="grid grid-cols-3 gap-4 p-5">
          <StatCard label="Upgrades" value={formatMetric(subscriptions.upgrades, String)} />
          <StatCard label="Downgrades" value={formatMetric(subscriptions.downgrades, String)} />
          <StatCard label="Renewals" value={formatMetric(subscriptions.renewals, String)} />
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Not available — subscriptions only store current state, not a change history. See Known Limitations in PHASE14_MILESTONE5 docs.
        </p>
      </div>
    </div>
  );
}
