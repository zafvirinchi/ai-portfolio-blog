import { defineConfig } from "vitest/config";

// Scoped to src/lib/ai/usage (Phase 14 Milestone 4), src/lib/analytics
// (Phase 14 Milestones 5-6), src/lib/ai/resume-versions (Phase 13
// Resume Versioning), src/lib/ai/job-description (Phase 13 Milestone 15
// — JD Matching & Resume Optimization), src/lib/ai/resume (Phase 13
// Milestone 21 — ResumeAnalyzer prompt-injection hardening),
// src/lib/ai/job-match (Phase 13 Milestone 21 — JobMatchAnalyzer
// prompt-injection hardening), src/lib/ai/resume-enterprise and
// src/lib/ai/job (Phase 13 Milestone 22 — extraction prompt hardening)
// — the only packages with tests in this repo so far. Not wired into
// next.config.ts/tsconfig path aliases on purpose: test files import
// their subjects with relative paths, so no bundler config is needed
// beyond what vitest ships with by default.
export default defineConfig({
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
    ],
    environment: "node",
  },
});
