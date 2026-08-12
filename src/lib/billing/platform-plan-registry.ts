import { FeatureEntitlementDefinition, FeatureId, PlatformPlanKey, PlatformRole } from "./platform-schema";

// Phase 18 Milestone 1 — Step 9. A pure, static, in-code catalog —
// deliberately NOT persisted to a database table this milestone (unlike
// billing/plan-service.ts's PLAN_DEFINITIONS, which IS seeded into a
// real `plans` table because organization subscriptions.plan_id needs a
// real foreign key to point at). Nothing here needs that yet: no
// user-level subscription row exists to reference a plan by id (see the
// migration's own "Database decision" note) — every lookup goes through
// this constant directly, exactly like plan-service.ts's own fallback
// path already does when its table is unseeded.
//
// EVERY limit below is a PROVISIONAL ARCHITECTURE DEFAULT, not a
// commercial pricing decision — explicitly called out per the
// milestone's own instructions. A future billing milestone (Phase 18
// M2+, once real pricing is decided) should treat these as a starting
// point to tune, not a spec to preserve.

const NONE: FeatureEntitlementDefinition = { access: "NONE" };
const UNLIMITED: FeatureEntitlementDefinition = { access: "UNLIMITED" };

export interface PlatformPlanDefinition {
  key: PlatformPlanKey;
  name: string;
  role: PlatformRole;
  features: Partial<Record<FeatureId, FeatureEntitlementDefinition>>;
}

export const PLATFORM_PLAN_DEFINITIONS: Record<PlatformPlanKey, PlatformPlanDefinition> = {
  JOB_SEEKER_FREE: {
    key: "JOB_SEEKER_FREE",
    name: "Job Seeker — Free",
    role: "JOB_SEEKER",
    features: {
      "resume.builder": UNLIMITED,
      "resume.templates": UNLIMITED,
      "resume.versions": UNLIMITED,
      "resume.export": UNLIMITED,
      "resume.ats.score": { access: "LIMITED", metric: "ATS_CHECKS", limit: 5, period: "MONTH" },
      "resume.jd.match": { access: "LIMITED", metric: "JD_MATCHES", limit: 5, period: "MONTH" },
      "resume.optimize": NONE,
      "resume.rewrite": NONE,
      "resume.ai_assistant": NONE,
      "job.match": { access: "LIMITED", metric: "JD_MATCHES", limit: 5, period: "MONTH" },
      "job.analyzer": { access: "LIMITED", metric: "JD_MATCHES", limit: 5, period: "MONTH" },
      "interview.prepare": { access: "LIMITED", metric: "INTERVIEW_PREPARATIONS", limit: 3, period: "MONTH" },
      "interview.mock": { access: "LIMITED", metric: "MOCK_INTERVIEWS", limit: 2, period: "MONTH" },
      "interview.debrief": NONE,
      "interview.progress": NONE,
      "interview.study_plan": NONE,
    },
  },
  JOB_SEEKER_PRO: {
    key: "JOB_SEEKER_PRO",
    name: "Job Seeker — Pro",
    role: "JOB_SEEKER",
    features: {
      "resume.builder": UNLIMITED,
      "resume.templates": UNLIMITED,
      "resume.versions": UNLIMITED,
      "resume.export": UNLIMITED,
      "resume.ats.score": { access: "LIMITED", metric: "ATS_CHECKS", limit: 50, period: "MONTH" },
      "resume.jd.match": { access: "LIMITED", metric: "JD_MATCHES", limit: 50, period: "MONTH" },
      "resume.optimize": UNLIMITED,
      "resume.rewrite": { access: "LIMITED", metric: "AI_REWRITES", limit: 30, period: "MONTH" },
      "resume.ai_assistant": UNLIMITED,
      "job.match": { access: "LIMITED", metric: "JD_MATCHES", limit: 50, period: "MONTH" },
      "job.analyzer": { access: "LIMITED", metric: "JD_MATCHES", limit: 50, period: "MONTH" },
      "interview.prepare": { access: "LIMITED", metric: "INTERVIEW_PREPARATIONS", limit: 15, period: "MONTH" },
      "interview.mock": { access: "LIMITED", metric: "MOCK_INTERVIEWS", limit: 15, period: "MONTH" },
      "interview.debrief": UNLIMITED,
      "interview.progress": UNLIMITED,
      "interview.study_plan": UNLIMITED,
    },
  },
  JOB_SEEKER_PREMIUM: {
    key: "JOB_SEEKER_PREMIUM",
    name: "Job Seeker — Premium",
    role: "JOB_SEEKER",
    features: {
      "resume.builder": UNLIMITED,
      "resume.templates": UNLIMITED,
      "resume.versions": UNLIMITED,
      "resume.export": UNLIMITED,
      "resume.ats.score": UNLIMITED,
      "resume.jd.match": UNLIMITED,
      "resume.optimize": UNLIMITED,
      "resume.rewrite": UNLIMITED,
      "resume.ai_assistant": UNLIMITED,
      "job.match": UNLIMITED,
      "job.analyzer": UNLIMITED,
      "interview.prepare": UNLIMITED,
      "interview.mock": UNLIMITED,
      "interview.debrief": UNLIMITED,
      "interview.progress": UNLIMITED,
      "interview.study_plan": UNLIMITED,
    },
  },
  RECRUITER_FREE: {
    key: "RECRUITER_FREE",
    name: "Recruiter — Free",
    role: "RECRUITER",
    features: {
      "recruiter.workspace": UNLIMITED,
      "recruiter.jobs": UNLIMITED,
      "recruiter.candidates": { access: "LIMITED", metric: "RECRUITER_CANDIDATES", limit: 25, period: "MONTH" },
      "recruiter.ranking": { access: "LIMITED", metric: "RECRUITER_CANDIDATES", limit: 25, period: "MONTH" },
      "recruiter.analytics": NONE,
      "recruiter.shortlist": NONE,
      "recruiter.interview": NONE,
      "recruiter.export": NONE,
      "recruiter.hiring_report": NONE,
    },
  },
  RECRUITER_PRO: {
    key: "RECRUITER_PRO",
    name: "Recruiter — Pro",
    role: "RECRUITER",
    features: {
      "recruiter.workspace": UNLIMITED,
      "recruiter.jobs": UNLIMITED,
      "recruiter.candidates": { access: "LIMITED", metric: "RECRUITER_CANDIDATES", limit: 200, period: "MONTH" },
      "recruiter.ranking": { access: "LIMITED", metric: "RECRUITER_CANDIDATES", limit: 200, period: "MONTH" },
      "recruiter.analytics": UNLIMITED,
      "recruiter.shortlist": UNLIMITED,
      "recruiter.interview": UNLIMITED,
      "recruiter.export": { access: "LIMITED", metric: "RECRUITER_EXPORTS", limit: 50, period: "MONTH" },
      "recruiter.hiring_report": NONE,
    },
  },
  RECRUITER_BUSINESS: {
    key: "RECRUITER_BUSINESS",
    name: "Recruiter — Business",
    role: "RECRUITER",
    features: {
      "recruiter.workspace": UNLIMITED,
      "recruiter.jobs": UNLIMITED,
      "recruiter.candidates": UNLIMITED,
      "recruiter.ranking": UNLIMITED,
      "recruiter.analytics": UNLIMITED,
      "recruiter.shortlist": UNLIMITED,
      "recruiter.interview": UNLIMITED,
      "recruiter.export": UNLIMITED,
      "recruiter.hiring_report": UNLIMITED,
    },
  },
};

/** The safe default plan for a role with no assigned plan yet — always the role's own FREE tier, never a paid one (Step 7: "FREE must be the safe default when no billing record exists... do not create fake subscriptions"). */
export function getDefaultPlanForRole(role: PlatformRole): PlatformPlanKey | null {
  switch (role) {
    case "JOB_SEEKER":
      return "JOB_SEEKER_FREE";
    case "RECRUITER":
      return "RECRUITER_FREE";
    case "ADMIN":
      // ADMIN is a privileged role, never a commercial plan tier (Step
      // 3) — entitlement-service.ts short-circuits to full access for
      // ADMIN before this function is ever consulted for that role.
      return null;
  }
}

export function getFeatureEntitlement(planKey: PlatformPlanKey, featureId: FeatureId): FeatureEntitlementDefinition {
  return PLATFORM_PLAN_DEFINITIONS[planKey].features[featureId] ?? NONE;
}
