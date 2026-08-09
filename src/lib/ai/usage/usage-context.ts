import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { getActiveSubscription } from "../../billing/subscription-service";
import { getTenantContext } from "../../saas/tenant-context";

import { UsageFeatureKey, UsageOperationKey } from "./usage-schema";
import { UsageContext } from "./usage-types";

// Same pattern as saas/tenant-context.ts's organizationRequestContext
// and auth/permission-service.ts's authRequestContext. Set by route
// handlers (and by the 3 multi-agent agent files for their own
// operation label) around their existing, unchanged logic — never
// threaded through GraphState or any protected file's function
// signature. usage-meter.ts reads this on every intercepted OpenAI/
// LangChain call; when no context is set, metering is a pure no-op
// (existing untracked call sites — e.g. LinkedIn/cover-letter routes
// this milestone deliberately didn't instrument — keep working exactly
// as before).
export const usageRequestContext = new AsyncLocalStorage<UsageContext>();

/**
 * Multi-agent agent files nest this inside the outer chat-level
 * usageRequestContext just to relabel `feature` per agent (MULTI_AGENT_
 * RESEARCH/REVIEW/SUMMARY — distinguishing the 3 agents is a feature-level
 * concern in this schema, operation stays LLM_CALL for all three) —
 * one line per agent file, without needing the full context again.
 */
export const usageFeatureOverrideContext = new AsyncLocalStorage<{ feature: UsageFeatureKey }>();

/**
 * The one route-level convenience wrapper every instrumented route
 * calls: resolves identity via getTenantContext() (Milestone 1,
 * read-only) and the org's real subscription id (Milestone 3,
 * read-only; null when the org is on the implicit Free plan with no
 * backing row). Runs `fn` inside `usageRequestContext` ONLY when a real
 * organization is resolved — for every anonymous/no-org request, `fn`
 * runs completely untouched (no AsyncLocalStorage, no extra lookups),
 * identical to this milestone never having been added.
 */
export async function withUsageContext<T>(feature: UsageFeatureKey, operation: UsageOperationKey, fn: () => Promise<T>): Promise<T> {
  const tenantContext = await getTenantContext();

  if (!tenantContext) {
    return fn();
  }

  const subscription = await getActiveSubscription(tenantContext.organizationId);

  const context: UsageContext = {
    userId: tenantContext.userId,
    organizationId: tenantContext.organizationId,
    subscriptionId: subscription.isImplicitFree ? null : subscription.id,
    feature,
    operation,
    requestId: randomUUID(),
  };

  return usageRequestContext.run(context, fn);
}
