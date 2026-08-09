import { UsageFeatureKey } from "./usage-schema";

/** Thrown by usage-service.ts/credit-service.ts BEFORE the real OpenAI/LangChain call — never exposes internal $ pricing, only the credit-denominated numbers a user/UI can act on. */
export class InsufficientAiCreditsError extends Error {
  code = "INSUFFICIENT_AI_CREDITS" as const;

  constructor(
    public feature: UsageFeatureKey,
    public currentBalance: number,
    public requiredCredits: number,
    public upgradeAvailable: boolean
  ) {
    super(`Insufficient AI credits for ${feature} (have ${currentBalance}, need ${requiredCredits}).`);
    this.name = "InsufficientAiCreditsError";
  }
}

/** Any other failure in the reserve/commit/release layer itself (e.g. the RPC call errored) — distinct from a legitimate "not enough credits" rejection. */
export class UsageReservationError extends Error {
  constructor(
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = "UsageReservationError";
  }
}
