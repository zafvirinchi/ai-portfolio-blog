#!/usr/bin/env node
// Verification hook — Stop event.
//
// Fires once when Claude finishes responding. NEVER blocks the stop (this
// repo's hook design deliberately avoids a hook that can force Claude into
// a retry loop) — it only prints a report to stderr. Uses this repo's real
// commands (see package.json) — no invented tooling.
//
// Cost control: full tsc/eslint/vitest/build easily takes several minutes
// in this repo. Running that after every single turn — including turns
// that touched no source file — would make the environment unusable. This
// hook first checks (cheaply, via `git status --porcelain`) whether any
// .ts/.tsx file actually has an uncommitted change; if not, it exits
// immediately without running anything.
//
// For changed API/security/AI/billing files specifically, this hook does
// not itself invoke the review skills (a Stop hook has no way to launch an
// agent skill inline) — it prints which of those areas changed and reminds
// the transcript to run pr-review/api-review/ai-review, matching this
// repo's own established "verify, then review" two-step discipline.

import { execSync } from "node:child_process";

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    return (err.stdout ?? "") + (err.stderr ?? "");
  }
}

function main() {
  const status = sh("git status --porcelain -- *.ts *.tsx 2>&1");
  const changedLines = status.split("\n").filter((l) => l.trim().length > 0);

  if (changedLines.length === 0) {
    // Nothing relevant changed this session (or since the last check) —
    // silent no-op, by design.
    return;
  }

  const changedFiles = changedLines.map((l) => l.slice(3).trim());

  const touchesArea = (patterns) => changedFiles.some((f) => patterns.some((p) => f.includes(p)));

  const areas = [];
  if (touchesArea(["src/app/api/"])) areas.push("API routes -> run api-review skill");
  if (touchesArea(["src/lib/billing/", "src/app/api/billing/"])) areas.push("billing/entitlement/Stripe -> run pr-review + api-review skills, re-verify webhook signature/ordering logic by hand");
  if (touchesArea(["src/lib/ai/", "src/app/api/ai/"])) areas.push("AI/LLM code -> run ai-review skill (trace the call graph, don't trust one route)");
  if (touchesArea(["src/app/api/admin/", "src/lib/billing/persona-service", "src/lib/billing/platform-admin"])) areas.push("admin authorization -> re-confirm requireAdminRoute()/requirePlatformAdmin() guard");

  process.stderr.write(
    [
      "[verification-check] Source changes detected this session:",
      `  ${changedFiles.length} changed .ts/.tsx file(s)`,
      areas.length > 0 ? "Recommended review skills before considering this done:" : null,
      ...areas.map((a) => `  - ${a}`),
      "",
      "Run the full verification skill for the real pass/fail result:",
      "  bash .claude/skills/verification/verify.sh",
      "",
      "(This Stop hook intentionally does not run the full tsc/lint/test/build",
      " itself — that takes several minutes; invoke the verification skill",
      " explicitly when you're ready to validate a specific change.)",
    ]
      .filter((line) => line !== null)
      .join("\n") + "\n"
  );
}

try {
  main();
} catch {
  // Advisory only.
}
process.exit(0);
