import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadExport } from "./export-download";

// Phase 25 Milestone 3 — genuine test-coverage gap found during the
// audit: downloadExport() is the shared utility this repo now reuses
// in 6+ places specifically to fix "a plain <a href> to an API route
// navigates the whole tab to raw JSON on a rejection" — the exact bug
// class found and fixed repeatedly across 3 milestones — yet it had
// zero dedicated tests of its own anywhere. Scoped to the
// rejection/error paths (the actual security/UX-relevant behavior this
// bug class is about) rather than the success path, which calls
// `document.createElement` — a real DOM API this repo's Vitest config
// deliberately runs under `environment: "node"` (not jsdom) for every
// other test, and adding jsdom here would be a new test dependency for
// a path any working download already proves out live.

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("downloadExport", () => {
  it("returns a parsed EntitlementErrorInfo, not a generic error, for a structured 402 rejection", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Monthly limit reached", code: "QUOTA_EXCEEDED", metric: "AI_REWRITES", limit: 30, used: 30, period: "MONTH" }), { status: 402 })
    );

    const result = await downloadExport("/api/ai/resume/versions/v1/export?format=pdf", "resume.pdf");

    expect(result).toEqual({ code: "QUOTA_EXCEEDED", message: "Monthly limit reached", limit: 30, used: 30, period: "MONTH", featureId: null });
  });

  it("returns a networkError with the server's own message for a plain (non-entitlement-shaped) JSON error", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Resume version not found" }), { status: 404 }));

    const result = await downloadExport("/api/ai/resume/versions/v1/export?format=pdf", "resume.pdf");

    expect(result).toEqual({ networkError: "Resume version not found" });
  });

  it("falls back to a generic message when the error body has no error string at all", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("not json", { status: 500 }));

    const result = await downloadExport("/api/ai/resume/versions/v1/export?format=pdf", "resume.pdf");

    expect(result).toEqual({ networkError: "Export failed." });
  });

  it("returns a networkError when fetch itself rejects (e.g. offline)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await downloadExport("/api/ai/resume/versions/v1/export?format=pdf", "resume.pdf");

    expect(result).toEqual({ networkError: "Export failed — network error." });
  });
});
