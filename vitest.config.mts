import path from "node:path";

import { defineConfig } from "vitest/config";

// Scoped to src/lib/ai/usage (Phase 14 Milestone 4), src/lib/analytics
// (Phase 14 Milestones 5-6), src/lib/ai/resume-versions (Phase 13
// Resume Versioning), src/lib/ai/job-description (Phase 13 Milestone 15
// — JD Matching & Resume Optimization), src/lib/ai/resume (Phase 13
// Milestone 21 — ResumeAnalyzer prompt-injection hardening),
// src/lib/ai/job-match (Phase 13 Milestone 21 — JobMatchAnalyzer
// prompt-injection hardening), src/lib/ai/resume-enterprise and
// src/lib/ai/job (Phase 13 Milestone 22 — extraction prompt hardening)
// — the only packages with tests in this repo so far, all previously
// importing their subjects with relative paths only.
//
// Phase 18 Milestone 5 — added the "@" alias (mirroring tsconfig.json's
// own `@/* -> src/*` path mapping, read-only here, nothing duplicated)
// so route.ts files can be imported directly in tests for the first
// time: every /api/ai/** route imports its dependencies via "@/lib/...",
// which vitest couldn't previously resolve at all. Needed specifically
// to prove — by actually calling the route handler, not just asserting
// on entitlement-service.ts in isolation — that a rejected quota/
// feature check genuinely prevents the LLM/service call beneath it
// from ever running. Purely additive: every existing relative-import
// test file resolves exactly as it did before.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: [
      "src/lib/ai/usage/**/*.test.ts",
      "src/lib/analytics/**/*.test.ts",
      "src/lib/ai/resume-versions/**/*.test.ts",
      "src/lib/ai/job-description/**/*.test.ts",
      "src/lib/ai/resume/**/*.test.ts",
      "src/lib/ai/job-match/**/*.test.ts",
      "src/lib/ai/resume-enterprise/**/*.test.ts",
      "src/lib/ai/job/**/*.test.ts",
      "src/lib/ai/tools/**/*.test.ts",
      "src/lib/ai/resume-rewriter/**/*.test.ts",
      "src/lib/ai/recruiter/**/*.test.ts",
      // Phase 17 Milestone 1 — first tests ever added for these two
      // packages (prompt-security hardening regression coverage).
      "src/lib/ai/interview-prep/**/*.test.ts",
      "src/lib/ai/mock-interview/**/*.test.ts",
      "src/lib/ai/*.test.ts",
      // Phase 18 Milestone 1 — first tests ever added for src/lib/billing
      // (the pre-existing organization-scoped module has none; scoped
      // narrowly to the new platform-entitlement files this milestone
      // adds, not a blanket src/lib/billing/**).
      "src/lib/billing/persona-service.test.ts",
      "src/lib/billing/platform-plan-registry.test.ts",
      "src/lib/billing/entitlement-service.test.ts",
      // Phase 18 Milestone 2 — Stripe platform billing.
      "src/lib/billing/platform-stripe-provider.test.ts",
      "src/lib/billing/platform-billing-service.test.ts",
      "src/lib/billing/platform-subscription-service.test.ts",
      // Phase 18 Milestone 3 — admin entitlement/role/billing management.
      "src/lib/billing/entitlement-overrides-service.test.ts",
      "src/lib/billing/platform-admin-service.test.ts",
      // Phase 18 Milestone 4 — platform admin bootstrap & authorization
      // hardening.
      "src/lib/billing/admin-api-guard.test.ts",
      "src/lib/billing/platform-admin-bootstrap-service.test.ts",
      // Phase 18 Milestone 5 — monetization enforcement, quota
      // consumption, and upgrade UX.
      "src/lib/billing/entitlement-response.test.ts",
      "src/app/api/ai/job/route.test.ts",
      "src/app/api/ai/resume-rewriter/route.test.ts",
      "src/app/api/ai/recruiter/candidates/import/route.test.ts",
      // Phase 18 Milestone 7 — monetization completion & role-based
      // plan UX.
      "src/lib/billing/entitlement-client-error.test.ts",
      // Phase 19 Milestone 2 — AI Assistant usage governance.
      "src/app/api/ai/chat/route.test.ts",
      // Phase 19 Milestone 3 — monetization integrity audit.
      "src/app/api/ai/resume/versions/[id]/jd-optimize/propose/route.test.ts",
      "src/app/api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/interview-readiness/route.test.ts",
      "src/app/api/ai/recruiter/candidates/bulk-status/route.test.ts",
      // Phase 19 Milestone 6 — LinkedIn Optimizer & Cover Letter
      // monetization governance.
      "src/app/api/ai/linkedin/route.test.ts",
      "src/app/api/ai/cover-letter/route.test.ts",
      // Phase 21 Milestone 1 — SaaS product-readiness audit fixes.
      "src/app/api/ai/resume/versions/route.test.ts",
      "src/app/api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/export/route.test.ts",
      "src/app/api/ai/recruiter/jobs/route.test.ts",
      "src/app/api/ai/recruiter/jobs/[jobId]/route.test.ts",
      // Phase 21 Milestone 2 — AI abuse protection & org billing reliability.
      "src/lib/ai/rate-limiting/anonymous-ai-rate-limiter.test.ts",
      "src/app/api/ai/resume/route.test.ts",
      "src/lib/billing/subscription-service.test.ts",
      "src/lib/billing/payment-service.test.ts",
      "src/lib/billing/billing-service.test.ts",
    ],
    environment: "node",
  },
});
