export * from "./analytics-schema";
export * from "./analytics-types";
export * from "./analytics-cache";

// Namespaced — every leaf module exports a function named after its
// domain (getRevenueMetrics, getSubscriptionMetrics, ...) which
// collides with analytics-service.ts's own flat re-exports of the same
// concept under shorter names (getRevenue, getSubscriptions, ...).
// Same fix shape as src/lib/ai/usage/index.ts's aiCreditService export.
export * as revenueAnalytics from "./revenue-analytics";
export * as subscriptionAnalytics from "./subscription-analytics";
export * as userAnalytics from "./user-analytics";
export * as organizationAnalytics from "./organization-analytics";
export * as aiUsageAnalytics from "./ai-usage-analytics";
export * as featureAnalytics from "./feature-analytics";
export * as conversionAnalytics from "./conversion-analytics";

// The primary entry point — every /api/admin/analytics/* route imports
// from here.
export * as analyticsService from "./analytics-service";

// The customer-safe entry point — every /api/usage/* and
// /api/organization/usage/* route imports from here instead of the
// admin-only analyticsService above.
export * as customerAnalyticsService from "./customer-analytics-service";
