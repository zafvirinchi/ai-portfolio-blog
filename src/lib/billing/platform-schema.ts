// Phase 18 Milestone 1 — Billing, Plans & Entitlement Architecture.
// Phase 18 Milestone 2 — Stripe Platform Billing.
//
// Deliberately NOT merged into billing-schema.ts even though it lives
// in the same folder: that file's PLAN_KEYS/SubscriptionStatus/etc. are
// the ORGANIZATION-scoped catalog (Phase 14) — this file is the
// PARALLEL, per-USER catalog (see the M2 migration's own header comment
// for why these are two separate systems, not a rename/refactor of one
// into the other).
//
// M1 originally re-exported billing-schema.ts's own SubscriptionStatus
// as-is (5 values: trialing/active/past_due/canceled/grace_period) —
// reasonable when every resolved plan was hardcoded "active" (no real
// subscription existed yet). Now that M2 syncs real Stripe subscription
// state, that set is both too narrow (missing unpaid/incomplete/
// incomplete_expired, real Stripe statuses) and includes one status
// ("grace_period") that isn't a real Stripe status at all — it's an
// organization-billing-specific DERIVED state computed in
// subscription-service.ts's isExpiredPastGrace(), never something
// Stripe itself reports. Replaced with PlatformSubscriptionStatus, a
// separate, richer type mirroring real Stripe subscription statuses
// directly (see platform-stripe-webhook-service.ts's own mapping) —
// never touching billing-schema.ts's own SubscriptionStatus, which
// stays exactly as Phase 14 defined it for organization billing.

export const PLATFORM_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"] as const;
export type PlatformSubscriptionStatus = (typeof PLATFORM_SUBSCRIPTION_STATUSES)[number];

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

// Phase 18 Milestone 2 — only these 4 tiers ever have a real Stripe
// subscription behind them; JOB_SEEKER_FREE/RECRUITER_FREE are the
// implicit default with no Stripe object at all (Step 6/7), and ADMIN
// has no plan key to begin with. Mirrored 1:1 by
// platform_subscriptions.plan_id's own CHECK constraint (the migration)
// and by platform-stripe-service.ts's env-var price mapping — a plan
// key that isn't in this list can never reach checkout.
export const STRIPE_BACKED_PLAN_KEYS = ["JOB_SEEKER_PRO", "JOB_SEEKER_PREMIUM", "RECRUITER_PRO", "RECRUITER_BUSINESS"] as const;
export type StripeBackedPlanKey = (typeof STRIPE_BACKED_PLAN_KEYS)[number];

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
  // Phase 19 Milestone 6 — brings the LinkedIn Optimizer (previously
  // entirely outside monetization governance, Phase 19 M5's own top
  // finding) under the same architecture as its closest structural
  // analog, resume.rewrite: an ephemeral, resume-derived, multi-section
  // AI generation session (LinkedinService.start() itself performs no
  // LLM call — see entitlement wiring in api/ai/linkedin/route.ts — the
  // 7 real generator sub-actions all happen on an already-started
  // session, mirroring resume-rewriter's own already-audited "charge
  // once per session, never per sub-action" design exactly).
  "resume.linkedin_optimizer",
  // Job
  "job.match",
  "job.analyzer",
  // Phase 19 Milestone 6 — Cover Letter Generator (Phase 19 M5's other
  // top finding). Categorized under "job" rather than "resume": every
  // cover letter is generated against one specific job application
  // (requires a jdMatchId as input, like job.match/job.analyzer),
  // unlike the LinkedIn Optimizer's standing-profile, job-agnostic
  // scope.
  "job.cover_letter",
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
  // Phase 19 Milestone 2 — resume.ai_assistant was the one HIGH-cost
  // LLM feature with no usage ceiling at all (a single user message can
  // fan out into a planner call, a tool call, up to two specialist
  // agents run in parallel, a summarizer call, and the final generation
  // call — see /api/ai/chat/route.ts's own withUsageContext() comment
  // and the multi-agent coordinator's decidePlan()). One unit = one
  // user-visible chat request, recorded exactly once regardless of how
  // many internal LLM calls that request happened to fan out into.
  "AI_CHAT_MESSAGES",
  // Phase 19 Milestone 6 — LinkedIn Optimizer and Cover Letter each get
  // their own dedicated metric rather than reusing AI_REWRITES: both
  // are genuinely distinct product surfaces from resume.rewrite (a
  // user optimizing their LinkedIn profile would find it misleading to
  // see that usage counted as "AI Rewrites" on their billing
  // dashboard), so pooling them would conflate distinct billing lines
  // for no genuine semantic overlap — unlike JD_MATCHES' deliberate
  // pooling across resume.jd.match/job.match/job.analyzer, which really
  // are the same underlying operation reached from 3 entry points.
  "LINKEDIN_OPTIMIZATIONS",
  "COVER_LETTERS",
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
