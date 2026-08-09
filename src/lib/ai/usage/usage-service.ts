import { supabaseAdmin } from "../../supabase/admin";

import * as creditService from "./credit-service";
import { estimateReservation } from "./usage-calculator";
import { isEnforcementEnabled } from "./usage-policy";
import { UsageContext, UsageBalance, UsageRecord, UsageSummary } from "./usage-types";
import { UsageFeatureKey, UsageRecordStatus, UsageTransactionStatus } from "./usage-schema";

const LOG_PREFIX = "[ai-usage]";

// The public orchestrator — usage-meter.ts is the only caller of
// check()/reserve()/commit()/release() in normal operation; UI/API
// routes call getBalance()/getHistory()/getSummary() directly.

/** Read-only pre-flight — would a reservation succeed right now, without actually reserving. Never mutates state. */
export async function check(organizationId: string, feature: UsageFeatureKey): Promise<{ allowed: boolean; balance: UsageBalance }> {
  const balance = await creditService.getBalance(organizationId);
  const required = estimateReservation(feature);

  return { allowed: balance.remaining === null || balance.remaining >= required, balance };
}

export interface ReservationHandle {
  requestId: string;
  estimatedCredits: number;
}

/** No-op (returns a zero-cost handle) whenever enforcement is disabled or there's no organization — the credit_transactions/usage_tracking rows still get written by commit()/release() when possible, purely for observability, never blocking. */
export async function reserve(context: UsageContext): Promise<ReservationHandle> {
  const estimatedCredits = estimateReservation(context.feature);

  if (!context.organizationId || !isEnforcementEnabled()) {
    return { requestId: context.requestId, estimatedCredits: 0 };
  }

  await creditService.reserve(context.organizationId, context.feature, estimatedCredits);

  await record(context, {
    status: "success",
    transactionStatus: "reserved",
    estimatedCredits,
    actualCredits: null,
  });

  return { requestId: context.requestId, estimatedCredits };
}

export async function commit(
  context: UsageContext,
  handle: ReservationHandle,
  actual: { credits: number; inputTokens?: number; outputTokens?: number; durationMs?: number }
): Promise<void> {
  if (context.organizationId && handle.estimatedCredits > 0) {
    await creditService.commit(context.organizationId, context.feature, handle.estimatedCredits, actual.credits);
  }

  await record(context, {
    status: "success",
    transactionStatus: "committed",
    estimatedCredits: handle.estimatedCredits,
    actualCredits: actual.credits,
    inputTokens: actual.inputTokens,
    outputTokens: actual.outputTokens,
    durationMs: actual.durationMs,
  });
}

export async function release(context: UsageContext, handle: ReservationHandle, errorCode?: string): Promise<void> {
  if (context.organizationId && handle.estimatedCredits > 0) {
    await creditService.release(context.organizationId, context.feature, handle.estimatedCredits);
  }

  await record(context, {
    status: errorCode ? "failed" : "blocked",
    transactionStatus: "released",
    estimatedCredits: handle.estimatedCredits,
    actualCredits: 0,
    errorCode,
  });
}

export interface RecordInput {
  status: UsageRecordStatus;
  transactionStatus: UsageTransactionStatus;
  estimatedCredits: number;
  actualCredits: number | null;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  errorCode?: string;
}

/** The audit-trail writer — upserts by request_id (idempotent: reserve() inserts the row, commit()/release() update that same row rather than inserting a second one). Never throws; a logging failure never breaks the AI feature it's metering. */
export async function record(context: UsageContext, input: RecordInput): Promise<void> {
  if (!context.organizationId) return;

  try {
    await supabaseAdmin.from("usage_tracking").upsert(
      {
        organization_id: context.organizationId,
        user_id: context.userId,
        subscription_id: context.subscriptionId,
        feature_key: context.feature,
        operation: context.operation,
        model: context.model ?? null,
        request_id: context.requestId,
        estimated_credits: input.estimatedCredits,
        actual_credits: input.actualCredits,
        credits_consumed: input.actualCredits ?? 0,
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        duration_ms: input.durationMs ?? null,
        status: input.status,
        error_code: input.errorCode ?? null,
        metadata: context.metadata ?? {},
      },
      { onConflict: "request_id" }
    );

    const totalTokens = (input.inputTokens ?? 0) + (input.outputTokens ?? 0);

    await supabaseAdmin.from("credit_transactions").upsert(
      {
        organization_id: context.organizationId,
        user_id: context.userId,
        subscription_id: context.subscriptionId,
        feature_key: context.feature,
        operation: context.operation,
        model: context.model ?? null,
        request_id: context.requestId,
        amount: -(input.actualCredits ?? input.estimatedCredits),
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        total_tokens: totalTokens > 0 ? totalTokens : null,
        status: input.transactionStatus,
        metadata: context.metadata ?? {},
      },
      { onConflict: "request_id" }
    );

    console.log(`${LOG_PREFIX} Usage recorded`, { organizationId: context.organizationId, feature: context.feature, status: input.status });
  } catch (error) {
    console.error(`${LOG_PREFIX} Usage recording failed`, error);
  }
}

/** The single shared credit pool for the whole organization — spans every feature, matching "Each plan owns monthly AI credits" (a singular pool) in the spec. */
export async function getBalance(organizationId: string): Promise<UsageBalance> {
  return creditService.getBalance(organizationId);
}

export async function getHistory(organizationId: string, limit = 50): Promise<UsageRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`${LOG_PREFIX} History lookup failed`, error);
    return [];
  }

  return data ?? [];
}

export async function getSummary(organizationId: string, sinceDays = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error(`${LOG_PREFIX} Summary lookup failed`, error);
    return { totalCreditsUsed: 0, byFeature: [], byModel: [], byOperation: [], dailyUsage: [], estimatedCostCents: 0 };
  }

  const byFeature = new Map<string, { credits: number; operations: number }>();
  const byModel = new Map<string, { credits: number; tokens: number }>();
  const byOperation = new Map<string, number>();
  const byDay = new Map<string, number>();
  let totalCreditsUsed = 0;

  for (const row of data) {
    const credits = row.actual_credits ?? 0;
    totalCreditsUsed += credits;

    const feature = byFeature.get(row.feature_key) ?? { credits: 0, operations: 0 };
    feature.credits += credits;
    feature.operations += 1;
    byFeature.set(row.feature_key, feature);

    if (row.model) {
      const model = byModel.get(row.model) ?? { credits: 0, tokens: 0 };
      model.credits += credits;
      model.tokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
      byModel.set(row.model, model);
    }

    if (row.operation) {
      byOperation.set(row.operation, (byOperation.get(row.operation) ?? 0) + credits);
    }

    const day = row.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + credits);
  }

  return {
    totalCreditsUsed,
    byFeature: [...byFeature.entries()].map(([feature, v]) => ({ feature, ...v })),
    byModel: [...byModel.entries()].map(([model, v]) => ({ model, ...v })),
    byOperation: [...byOperation.entries()].map(([operation, credits]) => ({ operation, credits })),
    dailyUsage: [...byDay.entries()].map(([date, credits]) => ({ date, credits })).sort((a, b) => a.date.localeCompare(b.date)),
    estimatedCostCents: Math.round((totalCreditsUsed / 100) * 100), // 1 credit ≈ 1 cent at CREDITS_PER_DOLLAR=100
  };
}
