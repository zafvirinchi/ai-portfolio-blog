import type OpenAI from "openai";
import type { ChatOpenAI } from "@langchain/openai";
import type { UsageMetadata } from "@langchain/core/messages";

import { usageFeatureOverrideContext, usageRequestContext } from "./usage-context";
import { calculateHybridCost } from "./usage-calculator";
import * as usageService from "./usage-service";
import { UsageOperationKey } from "./usage-schema";
import { UsageContext } from "./usage-types";

const LOG_PREFIX = "[ai-usage]";

interface OpenAiUsageShape {
  prompt_tokens?: number;
  completion_tokens?: number;
}

function resolveContext(defaultOperation: UsageOperationKey, model?: string): UsageContext | null {
  const context = usageRequestContext.getStore();
  if (!context) return null;

  const featureOverride = usageFeatureOverrideContext.getStore()?.feature;

  return {
    ...context,
    feature: featureOverride ?? context.feature,
    operation: defaultOperation,
    model: model ?? context.model,
  };
}

/**
 * Wraps { reserve → real call → commit/release } around any metered
 * SDK call. Returns the real call's result completely unmodified on
 * success. On failure, releases the reservation and RE-THROWS THE
 * ORIGINAL ERROR UNCHANGED — every existing catch block downstream
 * (in the 44 call sites this wrapper transparently covers) sees
 * identical behavior to before this milestone. When no usageRequestContext
 * is set (every call site this milestone didn't instrument), the real
 * call runs completely untouched — no reservation, no recording.
 */
async function meteredCall<T>(defaultOperation: UsageOperationKey, model: string | undefined, fn: () => Promise<T>, extractUsage: (result: T) => OpenAiUsageShape | undefined): Promise<T> {
  const context = resolveContext(defaultOperation, model);

  if (!context) {
    return fn();
  }

  const startedAt = Date.now();
  const handle = await usageService.reserve(context);

  try {
    const result = await fn();
    const usage = extractUsage(result);
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;

    const cost = calculateHybridCost(context.feature, context.model, inputTokens, outputTokens);

    await usageService.commit(context, handle, {
      credits: cost.credits,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - startedAt,
    });

    return result;
  } catch (error) {
    await usageService.release(context, handle, "PROVIDER_ERROR");
    throw error;
  }
}

/** Extends the shared OpenAI client export in place — same public methods, same return shapes, same thrown errors, zero changes needed at any of the 44 existing call sites. */
export function meterOpenAiClient(client: OpenAI): OpenAI {
  const originalChatCreate = client.chat.completions.create.bind(client.chat.completions);
  const originalEmbeddingsCreate = client.embeddings.create.bind(client.embeddings);

  client.chat.completions.create = (async (...args: Parameters<typeof originalChatCreate>) => {
    const model = (args[0] as { model?: string } | undefined)?.model;

    return meteredCall(
      "LLM_CALL",
      model,
      () => originalChatCreate(...args),
      (result) => (result as { usage?: OpenAiUsageShape })?.usage
    );
  }) as typeof client.chat.completions.create;

  client.embeddings.create = (async (...args: Parameters<typeof originalEmbeddingsCreate>) => {
    const model = (args[0] as { model?: string } | undefined)?.model;

    return meteredCall(
      "EMBEDDING",
      model,
      () => originalEmbeddingsCreate(...args),
      (result) => (result as { usage?: OpenAiUsageShape })?.usage
    );
  }) as typeof client.embeddings.create;

  console.log(`${LOG_PREFIX} OpenAI client metering enabled`);

  return client;
}

/**
 * Same treatment for PortfolioChain's LangChain ChatOpenAI instance —
 * wraps .invoke() in place. Takes the model name explicitly (from the
 * same config langchain.ts already constructs the instance with)
 * rather than introspecting an internal property whose exact name
 * isn't part of this package's public type surface.
 */
export function meterChatModel(model: ChatOpenAI, modelName: string): ChatOpenAI {
  const originalInvoke = model.invoke.bind(model);

  model.invoke = (async (...args: Parameters<typeof originalInvoke>) => {
    return meteredCall(
      "LLM_CALL",
      modelName,
      () => originalInvoke(...args),
      (result) => {
        const usage = (result as { usage_metadata?: UsageMetadata }).usage_metadata;
        return usage ? { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens } : undefined;
      }
    );
  }) as typeof model.invoke;

  console.log(`${LOG_PREFIX} LangChain ChatOpenAI metering enabled`);

  return model;
}
