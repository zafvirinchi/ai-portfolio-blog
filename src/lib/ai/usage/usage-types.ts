import { CostMode, UsageFeatureKey, UsageOperationKey, UsageRecordStatus, UsageTransactionStatus } from "./usage-schema";

// Non-schema row/wrapper types — mirrors src/lib/saas/organization-types.ts's
// role relative to organization-schema.ts.

/**
 * Request-scoped context, set by usageRequestContext (AsyncLocalStorage)
 * — same pattern as saas/tenant-context.ts's organizationRequestContext
 * and auth/permission-service.ts's authRequestContext. Read by
 * usage-meter.ts on every intercepted OpenAI/LangChain call.
 */
export interface UsageContext {
  userId: string | null;
  organizationId: string | null;
  subscriptionId: string | null;
  feature: UsageFeatureKey;
  operation: UsageOperationKey;
  requestId: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface CreditRule {
  feature: UsageFeatureKey;
  operation: UsageOperationKey;
  costMode: CostMode;
  fixedCredits?: number;
}

export interface FeatureCost {
  feature: UsageFeatureKey;
  fixedCredits: number;
}

export interface ModelPricing {
  model: string;
  inputPricePerMillionCents: number;
  outputPricePerMillionCents: number;
}

export interface UsageCost {
  credits: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  estimatedCostCents?: number;
}

export interface CreditBalanceRow {
  organization_id: string;
  feature_key: string;
  period_start: string;
  monthly_limit: number | null;
  reserved: number;
  consumed: number;
  updated_at: string;
}

export interface CreditTransactionRecord {
  id: string;
  organization_id: string;
  user_id: string | null;
  subscription_id: string | null;
  feature_key: string;
  operation: string | null;
  model: string | null;
  request_id: string | null;
  amount: number;
  balance_after: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  status: UsageTransactionStatus;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  organization_id: string;
  user_id: string | null;
  subscription_id: string | null;
  feature_key: string;
  operation: string | null;
  model: string | null;
  request_id: string | null;
  estimated_credits: number | null;
  actual_credits: number | null;
  credits_consumed: number;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  status: UsageRecordStatus;
  error_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsageBalance {
  feature: UsageFeatureKey | "TOTAL";
  monthlyLimit: number | null;
  reserved: number;
  consumed: number;
  remaining: number | null;
  usagePercent: number | null;
  periodStart: string;
  resetDate: string;
}

export interface UsageSummary {
  totalCreditsUsed: number;
  byFeature: { feature: string; credits: number; operations: number }[];
  byModel: { model: string; credits: number; tokens: number }[];
  byOperation: { operation: string; credits: number }[];
  dailyUsage: { date: string; credits: number }[];
  estimatedCostCents: number;
}
