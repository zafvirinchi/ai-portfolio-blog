import Link from "next/link";

import { describeResetDate } from "@/lib/billing/entitlement-client-error";
import { findCheapestPlanGranting } from "@/lib/billing/platform-plan-registry";
import { FEATURE_IDS, FeatureId } from "@/lib/billing/platform-schema";

function isFeatureId(value: string): value is FeatureId {
  return (FEATURE_IDS as readonly string[]).includes(value);
}

// Phase 18 Milestone 5, Step 6 — the ONE shared upgrade/paywall
// experience for the individual-user entitlement system (platform-
// schema.ts's FEATURE_IDS/PLATFORM_PLAN_DEFINITIONS), reused by every
// feature page a requireFeature()/requireQuota() rejection can surface
// in, rather than each page inventing its own. Deliberately a SEPARATE
// component from src/components/dashboard/usage/UpgradePrompt.tsx —
// that one belongs to Phase 14's organization-scoped credit system and
// links to /billing/plans (the team checkout flow); this one always
// routes to /settings/billing, the Phase 18 individual billing
// dashboard this same milestone extends. Two different billing systems
// with two different destinations — reusing the org one here would
// send a JOB_SEEKER/RECRUITER user to the wrong upgrade flow entirely.
export interface UpgradePromptProps {
  /** Human label for the blocked feature (FEATURE_REGISTRY[featureId].label) — omit for a generic message. */
  featureLabel?: string;
  /** Distinguishes "sign in first" / "not on your plan" / "you've used up this period's allowance" — drives both the heading/copy and which CTA is shown; anything else falls back to a generic "upgrade required" framing with the upgrade CTA. */
  code?: "AUTH_REQUIRED" | "FEATURE_NOT_INCLUDED" | "QUOTA_EXCEEDED" | string;
  /** The server's own error message — shown verbatim when present (already safe, never leaks billing internals — see entitlement-response.ts). */
  message?: string | null;
  limit?: number | null;
  used?: number | null;
  period?: string | null;
  /** Present only for FEATURE_NOT_INCLUDED (entitlement-response.ts's own FeatureNotEntitledError.featureId, threaded through entitlement-client-error.ts) — lets this component answer "what plan unlocks it?" (Phase 19 M1, Step 7) via a pure, static registry lookup. Omit when unavailable; the CTA still works, just without the plan-name hint. */
  featureId?: string | null;
  /** Optional safe retry (e.g. re-run the same request after the user upgrades in another tab) — omitted entirely when not meaningful for the caller's flow. */
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  className?: string;
}

// Phase 18 Milestone 7, Step 4 — AUTH_REQUIRED gets its OWN CTA ("Sign
// In" -> /login), never the upgrade one: a signed-out visitor can't
// act on "View plans & upgrade" (checkout itself requires a session —
// platform-billing-service.ts's initiateCheckout()), so offering it
// here would be a real dead end, not just imprecise copy.
export default function UpgradePrompt({ featureLabel, code, message, limit, used, period, featureId, onRetry, retryLabel = "Try again", retrying = false, className = "" }: UpgradePromptProps) {
  const heading =
    code === "AUTH_REQUIRED"
      ? "Sign in required"
      : code === "QUOTA_EXCEEDED"
        ? "You've reached your plan's limit"
        : code === "FEATURE_NOT_INCLUDED"
          ? "This feature isn't included in your plan"
          : "Upgrade required";

  // Phase 19 Milestone 1, Step 7 — a pure, static registry lookup (the
  // caller's ACTUAL entitlement is never computed here — only "which
  // named tier includes this feature at all", the same fact the plan
  // comparison grid already reads client-side from the same registry).
  const unlockPlanName = code === "FEATURE_NOT_INCLUDED" && featureId && isFeatureId(featureId) ? findCheapestPlanGranting(featureId)?.name ?? null : null;
  const resetDescription = code === "QUOTA_EXCEEDED" ? describeResetDate(period) : null;

  return (
    <div role="status" aria-live="polite" className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 ${className}`}>
      <p className="text-sm font-semibold text-amber-900">{featureLabel ? `${featureLabel}: ${heading}` : heading}</p>

      {message && <p className="mt-1 text-sm text-amber-800">{message}</p>}

      {unlockPlanName && <p className="mt-1 text-xs font-medium text-amber-700">Available on {unlockPlanName}.</p>}

      {code === "QUOTA_EXCEEDED" && limit != null && used != null && (
        <p className="mt-1 text-xs font-medium text-amber-700">
          {used}/{limit} used{period ? ` this ${period.toLowerCase()}` : ""}
        </p>
      )}

      {resetDescription && <p className="mt-1 text-xs font-medium text-amber-700">{resetDescription}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {code === "AUTH_REQUIRED" ? (
          <Link
            href="/login"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Sign In
          </Link>
        ) : (
          <Link
            href="/settings/billing"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            View plans &amp; upgrade
          </Link>
        )}

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            aria-label={retrying ? "Retrying…" : retryLabel}
            className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {retrying ? "Retrying…" : retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
