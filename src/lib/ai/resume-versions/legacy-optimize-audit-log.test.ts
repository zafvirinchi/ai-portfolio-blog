import { describe, expect, it } from "vitest";

import { buildLegacyOptimizeAccessedLog, buildLegacyOptimizeAuthenticatedLog, buildLegacyOptimizeCompletedLog, LEGACY_OPTIMIZE_ROUTE_NAME } from "./legacy-optimize-audit-log";

// Phase 13 Milestone 20, Part 4/10 (Test H) — proves the legacy
// /optimize route's traffic-audit instrumentation can never carry
// resume content, job-description text, prompts, generated output,
// tokens, secrets, or a resolved user/version identifier. exact
// structural equality (toEqual, not objectContaining) is used
// deliberately: it fails the moment anyone adds an extra field to
// either payload, not just when an existing field's value looks wrong.
//
// Phase 13 Milestone 21, Part 3 — extended for the new `event` field and
// the new "completed" log (route/success/durationMs only).

describe("legacy optimize route audit log payloads", () => {
  it("the 'accessed' log contains only a fixed route name, event, and a timestamp", () => {
    const entry = buildLegacyOptimizeAccessedLog();

    expect(entry.message).toBe("[resume-optimizer-audit] Legacy optimize route accessed");
    expect(entry.payload).toEqual({ route: LEGACY_OPTIMIZE_ROUTE_NAME, event: "accessed", timestamp: expect.any(String) });
    expect(entry.payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("the 'authenticated' log contains only the fixed route name, event, and a boolean — never the resolved userId", () => {
    const entry = buildLegacyOptimizeAuthenticatedLog();

    expect(entry.message).toBe("[resume-optimizer-audit] Legacy optimize route request authenticated");
    expect(entry.payload).toEqual({ route: LEGACY_OPTIMIZE_ROUTE_NAME, event: "authenticated", authenticated: true });
  });

  it("the 'completed' log contains only the fixed route name, event, success, and durationMs — never the resulting version/resume/JD content", () => {
    const entry = buildLegacyOptimizeCompletedLog(123);

    expect(entry.message).toBe("[resume-optimizer-audit] Legacy optimize route request completed");
    expect(entry.payload).toEqual({ route: LEGACY_OPTIMIZE_ROUTE_NAME, event: "completed", success: true, durationMs: 123 });
  });

  it("no payload's keys ever include resume/JD/user-content-shaped fields", () => {
    const forbiddenKeys = ["resume", "resumeData", "jobDescription", "jobDescriptionText", "prompt", "messages", "userId", "apiKey", "token", "output", "generatedText", "version"];

    for (const entry of [buildLegacyOptimizeAccessedLog(), buildLegacyOptimizeAuthenticatedLog(), buildLegacyOptimizeCompletedLog(0)]) {
      const keys = Object.keys(entry.payload);
      for (const forbidden of forbiddenKeys) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });
});
