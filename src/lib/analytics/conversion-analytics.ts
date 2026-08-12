import { organizationService } from "../saas/organization-service";

import { ConversionMetrics, DateRange, Metric } from "./analytics-types";
import { fetchAllSubscriptions, getOrganizationPlanMap } from "./subscription-analytics";
import { getFeatureUsageIndex } from "./ai-usage-analytics";

const DISCLAIMER =
  "These numbers describe organizations that used a feature AND are currently on a paid plan — a correlation, not a causal claim that the feature caused the upgrade. Labeled 'Associated conversion' throughout.";

function rate(numerator: number, denominator: number, reason: string): Metric<number> {
  if (denominator === 0) return { available: false, reason };
  return { available: true, value: numerator / denominator };
}

export async function getConversionMetrics(range: DateRange): Promise<ConversionMetrics> {
  const [organizations, planByOrg, subscriptions, featureIndex] = await Promise.all([
    organizationService.listAll(),
    getOrganizationPlanMap(),
    fetchAllSubscriptions(),
    getFeatureUsageIndex(range),
  ]);

  const paidOrgIds = new Set(planByOrg.keys());
  const freeOrganizations = Math.max(0, organizations.length - paidOrgIds.size);
  const paidOrganizations = paidOrgIds.size;

  // "Current mix," not a cohort/time-based rate — no signup-timestamp-
  // to-first-payment delta is tracked, so this answers "what fraction
  // of organizations today are paid," not "what fraction of new
  // signups convert."
  const freeToPaid = {
    freeOrganizations,
    paidOrganizations,
    conversionRate: rate(paidOrganizations, organizations.length, "No organizations exist yet."),
  };

  const trialed = subscriptions.filter((sub) => sub.trial_end !== null);
  const trialConverted = trialed.filter((sub) => sub.status === "active");
  const trialToPaid = rate(trialConverted.length, trialed.length, "No organization has started a trial yet.");

  const planUpgrades: Metric<number> = {
    available: false,
    reason: "Subscriptions only store current state, not a change history — an upgrade can't be distinguished from 'always on this plan' after the fact. See PHASE14_MILESTONE5 docs, Known Limitations.",
  };

  const FEATURE_LABELS: { key: string; label: string; usageKeys: string[] }[] = [
    { key: "resume_analyzer", label: "Resume Analyzer", usageKeys: ["RESUME_ANALYSIS", "RESUME_PARSER"] },
    { key: "jd_match", label: "JD Match", usageKeys: ["JD_MATCHING"] },
    { key: "resume_rewrite", label: "Resume Rewrite", usageKeys: ["RESUME_REWRITE"] },
    { key: "mock_interview", label: "Mock Interview", usageKeys: ["MOCK_INTERVIEW"] },
    { key: "ai_chat", label: "AI Chat", usageKeys: ["AI_CHAT"] },
  ];

  const featureConversion = FEATURE_LABELS.map((def) => {
    const usedByOrgs = new Set<string>();
    for (const usageKey of def.usageKeys) {
      featureIndex.byFeature.get(usageKey)?.organizations.forEach((orgId) => usedByOrgs.add(orgId));
    }

    let usedAndPaid = 0;
    for (const orgId of usedByOrgs) {
      if (paidOrgIds.has(orgId)) usedAndPaid += 1;
    }

    return {
      feature: def.label,
      usedByOrgs: usedByOrgs.size,
      usedAndPaidOrgs: usedAndPaid,
      associatedConversionRate: rate(usedAndPaid, usedByOrgs.size, `No organization has used ${def.label} yet.`),
    };
  });

  const resumeUploadedOrgs = new Set<string>();
  ["RESUME_ANALYSIS", "RESUME_PARSER"].forEach((key) => featureIndex.byFeature.get(key)?.organizations.forEach((id) => resumeUploadedOrgs.add(id)));
  const jdMatchOrgs = featureIndex.byFeature.get("JD_MATCHING")?.organizations ?? new Set<string>();
  const resumeRewriteOrgs = featureIndex.byFeature.get("RESUME_REWRITE")?.organizations ?? new Set<string>();

  const funnel = [
    { step: "Registered Organization", count: organizations.length, source: "organizations table" },
    { step: "Resume Uploaded", count: resumeUploadedOrgs.size, source: "usage_tracking (RESUME_ANALYSIS/RESUME_PARSER) in range" },
    { step: "JD Match", count: jdMatchOrgs.size, source: "usage_tracking (JD_MATCHING) in range" },
    { step: "Resume Rewrite", count: resumeRewriteOrgs.size, source: "usage_tracking (RESUME_REWRITE) in range" },
    { step: "Subscribed (paid plan)", count: paidOrganizations, source: "subscriptions table (current state)" },
  ];

  return {
    freeToPaid,
    trialToPaid,
    planUpgrades,
    featureConversion,
    funnel,
    disclaimer: DISCLAIMER,
  };
}
