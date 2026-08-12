import { UsageFeatureKey } from "../ai/usage/usage-schema";

import { DateRange, FeatureMetricRow, FeatureMetrics } from "./analytics-types";
import { getFeatureUsageIndex } from "./ai-usage-analytics";

// Product-facing feature -> the usage_tracking feature_key(s) that back
// it. A product feature can span more than one metered feature_key
// (Interview Preparation covers both generation and evaluation calls).
// Recruiter Workspace and generic "Organization Features" have no
// distinct AI-metered call site today (per the spec's "do not fabricate
// a required event that doesn't exist" rule) — shown with tracked:false
// rather than invented zeros presented as real measurements.
const FEATURE_DEFINITIONS: { key: string; label: string; usageKeys: UsageFeatureKey[] }[] = [
  { key: "resume_analyzer", label: "Resume Analyzer", usageKeys: ["RESUME_ANALYSIS", "RESUME_PARSER"] },
  { key: "ats", label: "ATS", usageKeys: ["ATS_ANALYSIS"] },
  { key: "jd_match", label: "JD Match", usageKeys: ["JD_MATCHING"] },
  { key: "resume_rewrite", label: "Resume Rewrite", usageKeys: ["RESUME_REWRITE"] },
  { key: "mock_interview", label: "Mock Interview", usageKeys: ["MOCK_INTERVIEW"] },
  { key: "interview_preparation", label: "Interview Preparation", usageKeys: ["INTERVIEW_GENERATION", "INTERVIEW_EVALUATION"] },
  { key: "knowledge_base", label: "Knowledge Base", usageKeys: ["KNOWLEDGE_SEARCH", "KNOWLEDGE_INGESTION"] },
  { key: "ai_chat", label: "AI Chat", usageKeys: ["AI_CHAT"] },
  { key: "multi_agent", label: "Multi-Agent Workflow", usageKeys: ["MULTI_AGENT_RESEARCH", "MULTI_AGENT_REVIEW", "MULTI_AGENT_SUMMARY"] },
];

const UNTRACKED_FEATURES = [
  { key: "recruiter_workspace", label: "Recruiter Workspace" },
  { key: "organization_features", label: "Organization Features (workspaces, invitations, roles)" },
];

export async function getFeatureMetrics(range: DateRange): Promise<FeatureMetrics> {
  const { byFeature } = await getFeatureUsageIndex(range);

  const features: FeatureMetricRow[] = FEATURE_DEFINITIONS.map((def) => {
    const users = new Set<string>();
    let requests = 0;
    let credits = 0;
    let lastUsed: string | null = null;

    for (const usageKey of def.usageKeys) {
      const entry = byFeature.get(usageKey);
      if (!entry) continue;
      entry.users.forEach((u) => users.add(u));
      requests += entry.requests;
      credits += entry.credits;
      if (!lastUsed || (entry.lastUsed && entry.lastUsed > lastUsed)) lastUsed = entry.lastUsed;
    }

    return { feature: def.key, label: def.label, tracked: true, users: users.size, requests, credits, lastUsed };
  });

  for (const def of UNTRACKED_FEATURES) {
    features.push({ feature: def.key, label: def.label, tracked: false, users: 0, requests: 0, credits: 0, lastUsed: null });
  }

  return { features: features.sort((a, b) => b.requests - a.requests) };
}
