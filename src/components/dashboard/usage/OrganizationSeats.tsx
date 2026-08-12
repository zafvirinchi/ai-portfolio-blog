import UsageProgress from "./UsageProgress";
import type { OrganizationSeatSummary } from "@/lib/analytics/customer-analytics-service";

export default function OrganizationSeats({ seats }: { seats: OrganizationSeatSummary }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-bold text-slate-700">Seat Utilization</h2>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase text-slate-400">Total Seats</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{seats.totalSeats === null ? "Unlimited" : seats.totalSeats}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-400">Assigned</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{seats.assignedSeats}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-400">Available</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{seats.availableSeats === null ? "Unlimited" : seats.availableSeats}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-400">Utilization</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{seats.utilizationPercent === null ? "N/A" : `${seats.utilizationPercent}%`}</p>
        </div>
      </div>

      {seats.utilizationPercent !== null && (
        <div className="mt-4">
          <UsageProgress percent={seats.utilizationPercent} label="Seat utilization" />
          {seats.utilizationPercent >= 90 && <p className="mt-2 text-sm font-semibold text-amber-600">You are nearing your organization&apos;s seat capacity.</p>}
        </div>
      )}
    </div>
  );
}
