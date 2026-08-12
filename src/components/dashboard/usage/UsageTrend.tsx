"use client";

import UsageTrendChart from "@/components/admin/analytics/UsageTrendChart";
import { CUSTOMER_RANGE_PRESETS, CustomerRangePreset } from "@/lib/analytics/customer-usage-shared";

const RANGE_LABELS: Record<CustomerRangePreset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  billing_period: "Current billing period",
};

export interface UsageTrendPoint {
  date: string;
  requests: number;
  credits: number;
}

export default function UsageTrend({
  data,
  range,
  onRangeChange,
  isRealBillingCycle,
}: {
  data: UsageTrendPoint[];
  range: CustomerRangePreset;
  onRangeChange: (range: CustomerRangePreset) => void;
  isRealBillingCycle?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h3 className="text-sm font-bold text-slate-700">Usage Trend</h3>
        <label className="text-xs font-semibold text-slate-500">
          Range{" "}
          <select
            value={range}
            onChange={(event) => onRangeChange(event.target.value as CustomerRangePreset)}
            className="ml-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
          >
            {CUSTOMER_RANGE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {RANGE_LABELS[preset]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {range === "billing_period" && (
        <p className="px-5 pt-2 text-xs text-slate-400">
          {isRealBillingCycle ? "Based on your subscription's actual renewal date." : "No active billing cycle yet — showing the current calendar month."}
        </p>
      )}
      <UsageTrendChart data={data} />
    </div>
  );
}
