"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AnalyticsFilters, { AnalyticsFiltersValue } from "@/components/admin/analytics/AnalyticsFilters";
import AnalyticsLoading from "@/components/admin/analytics/AnalyticsLoading";
import AnalyticsError from "@/components/admin/analytics/AnalyticsError";
import AnalyticsOverview from "@/components/admin/analytics/AnalyticsOverview";
import RevenueAnalytics from "@/components/admin/analytics/RevenueAnalytics";
import SubscriptionAnalytics from "@/components/admin/analytics/SubscriptionAnalytics";
import UserAnalytics from "@/components/admin/analytics/UserAnalytics";
import OrganizationAnalytics from "@/components/admin/analytics/OrganizationAnalytics";
import AIUsageAnalytics from "@/components/admin/analytics/AIUsageAnalytics";
import FeatureAnalytics from "@/components/admin/analytics/FeatureAnalytics";
import ConversionAnalytics from "@/components/admin/analytics/ConversionAnalytics";

import type { AnomalyEvent, OverviewMetrics, RevenueMetrics, SubscriptionMetrics, ChurnMetrics, UserMetrics, TopUserRow, OrganizationMetrics, AIUsageMetrics, FeatureMetrics, ConversionMetrics } from "@/lib/analytics/analytics-types";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "revenue", label: "Revenue" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "users", label: "Users" },
  { key: "organizations", label: "Organizations" },
  { key: "ai-usage", label: "AI Usage" },
  { key: "features", label: "Features" },
  { key: "conversion", label: "Conversion" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const EXPORTABLE_TABS: Record<string, string> = {
  revenue: "revenue",
  subscriptions: "subscriptions",
  "ai-usage": "ai-usage",
  users: "users",
  organizations: "organizations",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildQuery(filters: AnalyticsFiltersValue): string {
  const params = new URLSearchParams({ range: filters.range });
  if (filters.range === "custom") {
    if (filters.from) params.set("from", new Date(filters.from).toISOString());
    if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59.999Z`).toISOString());
  }
  return params.toString();
}

export default function AdminAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [filters, setFilters] = useState<AnalyticsFiltersValue>({ range: "last_30_days", from: todayIso(), to: todayIso() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [revenue, setRevenue] = useState<RevenueMetrics | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionMetrics | null>(null);
  const [churn, setChurn] = useState<ChurnMetrics | null>(null);
  const [users, setUsers] = useState<UserMetrics | null>(null);
  const [topUsers, setTopUsers] = useState<TopUserRow[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationMetrics | null>(null);
  const [aiUsage, setAiUsage] = useState<AIUsageMetrics | null>(null);
  const [features, setFeatures] = useState<FeatureMetrics | null>(null);
  const [conversion, setConversion] = useState<ConversionMetrics | null>(null);

  const query = useMemo(() => buildQuery(filters), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      switch (activeTab) {
        case "overview": {
          const res = await fetch(`/api/admin/analytics/overview?${query}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to load overview");
          setOverview(data.overview);
          setAnomalies(data.anomalies ?? []);
          break;
        }
        case "revenue": {
          const res = await fetch(`/api/admin/analytics/revenue?${query}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to load revenue");
          setRevenue(data.revenue);
          break;
        }
        case "subscriptions": {
          const res = await fetch(`/api/admin/analytics/subscriptions?${query}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to load subscriptions");
          setSubscriptions(data.subscriptions);
          setChurn(data.churn);
          break;
        }
        case "users": {
          const res = await fetch(`/api/admin/analytics/users?${query}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to load users");
          setUsers(data.users);
          setTopUsers(data.topUsers ?? []);
          break;
        }
        case "organizations": {
          const res = await fetch(`/api/admin/analytics/organizations?${query}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to load organizations");
          setOrganizations(data.organizations);
          break;
        }
        case "ai-usage": {
          const res = await fetch(`/api/admin/analytics/ai-usage?${query}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to load AI usage");
          setAiUsage(data.aiUsage);
          break;
        }
        case "features": {
          const res = await fetch(`/api/admin/analytics/features?${query}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to load features");
          setFeatures(data.features);
          break;
        }
        case "conversion": {
          const res = await fetch(`/api/admin/analytics/conversion?${query}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to load conversion");
          setConversion(data.conversion);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, query]);

  useEffect(() => {
    load();
  }, [load]);

  const exportTable = EXPORTABLE_TABS[activeTab];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Enterprise Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Business, subscription, billing, and AI usage intelligence.</p>
        </div>
        {exportTable && (
          <a
            href={`/api/admin/analytics/export?table=${exportTable}&${query}`}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </a>
        )}
      </div>

      <AnalyticsFilters value={filters} onChange={setFilters} />

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${activeTab === tab.key ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <AnalyticsLoading />}
      {!loading && error && <AnalyticsError message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          {activeTab === "overview" && overview && <AnalyticsOverview overview={overview} anomalies={anomalies} />}
          {activeTab === "revenue" && revenue && <RevenueAnalytics revenue={revenue} />}
          {activeTab === "subscriptions" && subscriptions && churn && <SubscriptionAnalytics subscriptions={subscriptions} churn={churn} />}
          {activeTab === "users" && users && <UserAnalytics users={users} topUsers={topUsers} />}
          {activeTab === "organizations" && organizations && <OrganizationAnalytics organizations={organizations} />}
          {activeTab === "ai-usage" && aiUsage && <AIUsageAnalytics aiUsage={aiUsage} />}
          {activeTab === "features" && features && <FeatureAnalytics features={features} />}
          {activeTab === "conversion" && conversion && <ConversionAnalytics conversion={conversion} />}
        </>
      )}
    </div>
  );
}
