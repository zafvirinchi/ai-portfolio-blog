// Phase 18 Milestone 1 — Billing, Plans & Entitlement Architecture.
//
// Deliberately NOT merged into billing-schema.ts even though it lives
// in the same folder: that file's PLAN_KEYS/SubscriptionStatus/etc. are
// the ORGANIZATION-scoped catalog (Phase 14) — this file is the
// PARALLEL, per-USER catalog (see the migration's own header comment
// for why these are two separate systems, not a rename/refactor of one
// into the other). SubscriptionStatus IS reused as-is below (imported,
// not redefined) since "trialing/active/past_due/canceled/grace_period"
// is exactly the right vocabulary for a user's plan status too, and
// duplicating an identical enum under a new name would be pure noise.

export { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "./billing-schema";

// ---------------------------------------------------------------------------
// Step 2 — Personas. A user can hold more than one (e.g. a recruiter who
// is also job-hunting) — always an array, never a single enum field.
// ADMIN is a privileged role, never dependent on any plan/payment state.
// ---------------------------------------------------------------------------

export const PLATFORM_ROLES = ["JOB_SEEKER", "RECRUITER", "ADMIN"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// ---------------------------------------------------------------------------
// Step 3 — Plans. Provisional product tiers, no pricing decided yet
// (see platform-plan-registry.ts's own header comment) — ADMIN has no
// plan key at all, since admin access is a role grant, never a
// subscription tier.
// ---------------------------------------------------------------------------

export const PLATFORM_PLAN_KEYS = [
  "JOB_SEEKER_FREE",
  "JOB_SEEKER_PRO",
  "JOB_SEEKER_PREMIUM",
  "RECRUITER_FREE",
  "RECRUITER_PRO",
  "RECRUITER_BUSINESS",
] as const;
export type PlatformPlanKey = (typeof PLATFORM_PLAN_KEYS)[number];

// ---------------------------------------------------------------------------
// Step 4 — Feature registry. Typed ids only — no arbitrary strings are
// ever passed to requireFeature()/canAccess() elsewhere in the
// codebase; a typo is a compile error, not a silent always-false check.
// ---------------------------------------------------------------------------

export const FEATURE_IDS = [
  // Resume
  "resume.ats.score",
  "resume.jd.match",
  "resume.optimize",
  "resume.rewrite",
  "resume.ai_assistant",
  "resume.builder",
  "resume.templates",
  "resume.versions",
  "resume.export",
  // Job
  "job.match",
  "job.analyzer",
  // Interview
  "interview.prepare",
  "interview.mock",
  "interview.debrief",
  "interview.progress",
  "interview.study_plan",
  // Recruiter
  "recruiter.workspace",
  "recruiter.jobs",
  "recruiter.candidates",
  "recruiter.ranking",
  "recruiter.analytics",
  "recruiter.shortlist",
  "recruiter.interview",
  "recruiter.export",
  "recruiter.hiring_report",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

// ---------------------------------------------------------------------------
// Step 5/8 — Usage metrics. The AI-credit-style abstraction Step 8 asks
// for — extensible for future token/credit accounting without a shape
// change (a future "AI_CREDITS" metric slots in the same way).
// ---------------------------------------------------------------------------

export const USAGE_METRICS = [
  "ATS_CHECKS",
  "JD_MATCHES",
  "AI_REWRITES",
  "INTERVIEW_PREPARATIONS",
  "MOCK_INTERVIEWS",
  "RECRUITER_CANDIDATES",
  "RECRUITER_EXPORTS",
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export const USAGE_PERIODS = ["DAY", "MONTH", "LIFETIME"] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export interface UsageDefinition {
  metric: UsageMetric;
  period: UsagePeriod;
}

// ---------------------------------------------------------------------------
// Step 5 — Entitlement types. One shape covers boolean/limited/unlimited
// access uniformly: NONE/UNLIMITED never carry limit/period/metric;
// LIMITED always does.
// ---------------------------------------------------------------------------

export type FeatureAccessLevel = "NONE" | "LIMITED" | "UNLIMITED";

export interface FeatureEntitlementDefinition {
  access: FeatureAccessLevel;
  /** Required when access is LIMITED, absent otherwise — which UsageMetric this feature's usage counts against. */
  metric?: UsageMetric;
  limit?: number;
  period?: UsagePeriod;
}
