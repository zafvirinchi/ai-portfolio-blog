import { AnomalySeverity, AnomalyType, DateRangePreset } from "./analytics-schema";
import { PlanKey } from "../billing/billing-schema";
import { UsageFeatureKey } from "../ai/usage/usage-schema";

// Non-schema row/wrapper types — mirrors every prior milestone's
// *-types.ts role relative to its own *-schema.ts.

/** A resolved, concrete [from, to) window — every analytics function takes this, never a raw preset string. */
export interface DateRange {
  preset: DateRangePreset;
  from: Date;
  to: Date;
}

/**
 * Wraps any metric that cannot be honestly computed from the data that
 * currently exists (e.g. no subscription-history log exists yet, so a
 * true cohort churn rate isn't derivable) — the spec explicitly
 * requires "N/A"/"Insufficient data" over a fabricated number.
 */
export type Metric<T> = { available: true; value: T } | { available: false; reason: string };

export interface OverviewMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  paidUsers: number;
  activeSubscriptions: number;
  mrrCents: number;
  arrCents: number;
  churnRate: Metric<number>;
  aiCreditsUsed: number;
  estimatedAiCostCents: number;
}

export interface RevenueMetrics {
  grossRevenueCents: number;
  netRevenueCents: number;
  recurringRevenueCents: number;
  oneTimeRevenueCents: number;
  refundsCents: number;
  discountsCents: number;
  taxesCents: number;
  failedPaymentsCents: number;
  failedPaymentsCount: number;
  mrrCents: number;
  arrCents: number;
  revenueTrend: { date: string; grossCents: number; refundsCents: number }[];
  revenueByPlan: { planKey: PlanKey; planName: string; mrrCents: number; subscriptions: number }[];
  revenueByOrganization: { organizationId: string; organizationName: string; totalCents: number }[];
}

export interface SubscriptionCounts {
  free: number;
  professional: number;
  premium: number;
  enterprise: number;
}

export interface SubscriptionMetrics {
  byPlan: SubscriptionCounts;
  activeSubscriptions: number;
  trials: number;
  cancellationsInRange: number;
  expiredSubscriptions: number;
  upgrades: Metric<number>;
  downgrades: Metric<number>;
  renewals: Metric<number>;
  planConversion: {
    freeToPaid: Metric<number>;
    trialToPaid: Metric<number>;
    professionalToPremium: Metric<number>;
    premiumToEnterprise: Metric<number>;
  };
}

export interface ChurnMetrics {
  /** Documented approximation: subscriptions.status='canceled' rows whose updated_at falls in range, over the active+canceled base — see docs for the exact formula and its limitation (no subscription-history log exists, so this reads the current-state table's last-updated timestamp rather than a true point-in-time cohort). */
  customerChurnRate: Metric<number>;
  subscriptionChurnRate: Metric<number>;
  revenueChurn: Metric<number>;
  canceledInRange: number;
  formula: string;
}

export interface UserActivityDefinition {
  dau: string;
  wau: string;
  mau: string;
}

export interface UserMetrics {
  totalUsers: number;
  newUsers: number;
  activeUsers: { dau: number; wau: number; mau: number };
  returningUsers: number;
  paidUsers: number;
  freeUsers: number;
  usersByPlan: SubscriptionCounts;
  activityTrend: { date: string; activeUsers: number }[];
  activityDefinition: UserActivityDefinition;
}

export interface TopUserRow {
  userId: string;
  email: string | null;
  organizationId: string | null;
  organizationName: string | null;
  planKey: PlanKey | null;
  aiRequests: number;
  creditsUsed: number;
  lastActivity: string | null;
  featuresUsed: string[];
}

export interface LimitWarning {
  organizationId: string;
  organizationName: string;
  limitType: "credits" | "seats";
  usagePercent: number;
  description: string;
}

export interface TopOrganizationRow {
  organizationId: string;
  organizationName: string;
  planKey: PlanKey;
  seats: number;
  activeUsers: number;
  aiCreditsUsed: number;
  estimatedAiCostCents: number;
  usagePercent: number | null;
  lastActivity: string | null;
}

export interface OrganizationMetrics {
  totalOrganizations: number;
  activeOrganizations: number;
  paidOrganizations: number;
  totalSeats: number;
  seatUtilizationPercent: number | null;
  aiCreditsUsed: number;
  estimatedAiCostCents: number;
  topOrganizations: TopOrganizationRow[];
  organizationsNearLimits: LimitWarning[];
}

export interface AIUsageByFeatureRow {
  feature: UsageFeatureKey | string;
  requests: number;
  credits: number;
  tokens: number;
  estimatedCostCents: number;
}

export interface AIUsageByModelRow {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
  averageDurationMs: number | null;
  failureRate: number;
}

export interface AIUsageMetrics {
  totalRequests: number;
  totalCredits: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  successfulRequests: number;
  failedRequests: number;
  averageDurationMs: number | null;
  byFeature: AIUsageByFeatureRow[];
  byModel: AIUsageByModelRow[];
  dailyTrend: { date: string; requests: number; credits: number }[];
}

export interface FeatureMetricRow {
  feature: string;
  label: string;
  tracked: boolean;
  users: number;
  requests: number;
  credits: number;
  lastUsed: string | null;
}

export interface FeatureMetrics {
  features: FeatureMetricRow[];
}

export interface ConversionMetrics {
  freeToPaid: { freeOrganizations: number; paidOrganizations: number; conversionRate: Metric<number> };
  trialToPaid: Metric<number>;
  planUpgrades: Metric<number>;
  featureConversion: { feature: string; usedByOrgs: number; usedAndPaidOrgs: number; associatedConversionRate: Metric<number> }[];
  funnel: { step: string; count: number; source: string }[];
  disclaimer: string;
}

export interface AnomalyEvent {
  severity: AnomalySeverity;
  type: AnomalyType;
  description: string;
  timestamp: string;
  relatedEntity: { type: "organization" | "user" | "platform"; id: string; name: string } | null;
}

export interface AnalyticsOverviewResponse {
  range: { preset: DateRangePreset; from: string; to: string };
  overview: OverviewMetrics;
}
