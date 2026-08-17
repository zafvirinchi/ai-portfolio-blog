#!/usr/bin/env node
// Security hook.
//
// Two entry points, sharing one detection engine (scanForSecurityIssues):
//
//   1. PreToolUse (default — no CLI args): reads the Claude Code hook JSON
//      payload from stdin, inspects the content about to be written
//      (Write's tool_input.content, or Edit's tool_input.new_string), and
//      blocks (exit 2, message on stderr) ONLY for narrow, high-confidence,
//      high-severity patterns. Everything lower-confidence is a WARNING on
//      stderr that does NOT block — this repo's own governance rules (see
//      .claude/skills/verification/reference.md's "Known limitations")
//      explicitly reject false-positive-heavy blocking rules.
//
//   2. Batch/CLI scan (invoked with one or more file paths as arguments —
//      used by verify.sh's Mode A "working-tree verification" so the same
//      real detection logic covers the whole tree, not just one live edit,
//      without spawning a Node process per file): reads each file from
//      disk, aggregates findings, prints a report, and exits 1 if any file
//      had a BLOCKING-severity finding (0 otherwise) — this is a report
//      exit code, not a "should this edit be allowed" decision, since batch
//      mode isn't gating a specific in-flight write.
//
// Fails open on any internal error (malformed input, unreadable file,
// unexpected shape) — a bug in THIS script must never block all Write/Edit
// calls repo-wide, and must never crash a batch scan over one bad file.

import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return null;
  }
}

// --- The one detection engine, shared by both entry points ----------------
//
// `oldContent` is optional: when present (Edit's tool_input.old_string, or a
// batch-mode "before" comparison), this can additionally detect a guard call
// being REMOVED by this exact change — a much higher-confidence signal than
// "the final content merely lacks a guard" (which has legitimate false
// positives: a helper function two lines away, a guard in a parent
// component, etc.). Comparing old vs. new content for the SAME edit is not
// a heuristic in the same sense — it's a direct diff.
function scanForSecurityIssues(filePath, content, oldContent = null) {
  const blocking = [];
  const warnings = [];

  if (!content) return { blocking, warnings };

  // Never scan the hook scripts' own pattern definitions (this file, or the
  // reference docs describing these patterns) — they legitimately contain
  // the pattern text itself, not a real secret.
  if (/\.claude[\\/](hooks|skills)[\\/]/.test(filePath)) return { blocking, warnings };

  // --- High-confidence secret patterns (BLOCK) ----------------------------
  const secretPatterns = [
    { name: "Stripe live secret key", re: /\bsk_live_[A-Za-z0-9]{10,}/ },
    { name: "Stripe test secret key", re: /\bsk_test_[A-Za-z0-9]{10,}/ },
    { name: "Stripe restricted key", re: /\brk_(live|test)_[A-Za-z0-9]{10,}/ },
    { name: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{10,}/ },
    { name: "OpenAI API key", re: /\bsk-[A-Za-z0-9]{20,}/ },
    { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: "Generic private key block", re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
    { name: "Supabase-shaped service-role JWT literal", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  ];
  for (const { name, re } of secretPatterns) {
    if (re.test(content)) blocking.push(`hardcoded secret literal (${name})`);
  }

  // --- NEXT_PUBLIC exposure of a server secret (BLOCK) --------------------
  if (/NEXT_PUBLIC_[A-Z_]*(SECRET|WEBHOOK|SERVICE_ROLE|BOOTSTRAP|PRIVATE_KEY)[A-Z_]*/.test(content)) {
    blocking.push("NEXT_PUBLIC_-prefixed variable name matching a server-secret pattern — this would ship the value to the client bundle");
  }

  // --- Dynamic execution of non-literal content (BLOCK) -------------------
  if (/\beval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content)) {
    blocking.push("dynamic code execution (eval-family call)");
  }

  // --- Guard REMOVAL detection (BLOCK) — only possible with old/new -------
  // This is the highest-confidence check in this file: it compares what
  // THIS edit actually removed, not merely what the final file lacks.
  if (oldContent) {
    const guardCalls = ["requireFeature(", "requireQuota(", "requireUserId(", "requireRecruiterId(", "requirePlatformAdmin(", "requireAdminRoute(", "requireRecord("];
    for (const call of guardCalls) {
      const before = countActiveOccurrences(oldContent, call);
      const after = countActiveOccurrences(content, call);
      if (before > after) {
        blocking.push(`this edit removes (or comments out) a call to ${call.slice(0, -1)}() (${before}x active before, ${after}x active after) — an entitlement/authorization guard appears to have been weakened or deleted`);
      }
    }
    const ownershipFilters = ['.eq("recruiter_id"', '.eq("user_id"'];
    for (const filter of ownershipFilters) {
      const before = countActiveOccurrences(oldContent, filter);
      const after = countActiveOccurrences(content, filter);
      if (before > after) {
        blocking.push(`this edit removes (or comments out) an ownership filter ${filter}...) (${before}x active before, ${after}x active after) — an IDOR/ownership boundary appears to have been weakened or deleted`);
      }
    }
  }

  // --- Lower-confidence patterns (WARN only) -------------------------------
  if (/dangerouslySetInnerHTML/.test(content)) {
    warnings.push("dangerouslySetInnerHTML present — confirm the content is sanitized, not raw user/LLM output");
  }
  if (/\bexec(Sync)?\s*\(\s*[`"'].*\$\{/.test(content) || /child_process/.test(content)) {
    warnings.push("child_process / exec with interpolated content — confirm no command-injection risk");
  }
  const identityFromBodyPatterns = [
    // Direct assignment: userId = req.body.userId / body.userId / searchParams.get(...)
    /(userId|recruiterId|organizationId|role|plan)\s*[:=]\s*(req\.body|body\.|searchParams\.get|await\s+req\.json\(\))/,
    // Destructuring: const { userId } = await req.json() / = body
    /const\s*\{[^}]*\b(userId|recruiterId|organizationId|role|plan)\b[^}]*\}\s*=\s*(await\s+req\.json\(\)|body\b)/,
  ];
  if (identityFromBodyPatterns.some((re) => re.test(content))) {
    warnings.push("a value that looks like an identity/authorization field appears to be read directly from request input (body/query) — confirm it is not trusted for an authorization decision (see CLAUDE.md Security Requirements #1-2)");
  }
  if (
    /requirePlatformAdmin|requireAdminRoute|requireFeature|requireQuota|requireUserId|requireRecruiterId/.test(content) === false &&
    /src[\\/]app[\\/]api[\\/]admin[\\/]/.test(filePath)
  ) {
    warnings.push("file is under src/app/api/admin/** and this content has no visible admin/auth guard call — confirm one exists elsewhere in the file");
  }
  if (/\.\.[\\/]/.test(content) && /readFile|writeFile|createReadStream|createWriteStream|readdir/.test(content)) {
    warnings.push("relative path traversal segment (..) near a filesystem operation — confirm the path is not built from untrusted input");
  }
  if (/redirect\s*\(\s*(req\.|body\.|searchParams\.get)/.test(content)) {
    warnings.push("redirect target appears to come from request input — confirm it's validated against an allowlist (open-redirect risk)");
  }

  return { blocking, warnings };
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

// Same as countOccurrences, but ignores line-commented-out code — so
// commenting out a guard call counts the same as deleting it (both are
// "this guard no longer runs"), not as "still present".
function countActiveOccurrences(haystack, needle) {
  const activeLines = haystack
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return countOccurrences(activeLines, needle);
}

// --- Entry point 1: PreToolUse (stdin JSON) --------------------------------

function runPreToolUse() {
  const raw = readStdin();
  if (!raw) return allow();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return allow();
  }

  const toolName = payload.tool_name ?? "";
  if (toolName !== "Write" && toolName !== "Edit") return allow();

  const input = payload.tool_input ?? {};
  const filePath = String(input.file_path ?? "");
  const content = String(input.content ?? input.new_string ?? "");
  const oldContent = toolName === "Edit" && typeof input.old_string === "string" ? input.old_string : null;
  if (!content) return allow();

  const { blocking, warnings } = scanForSecurityIssues(filePath, content, oldContent);

  if (warnings.length > 0) {
    process.stderr.write(`[security-check] WARN — review before proceeding:\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`);
  }

  if (blocking.length > 0) {
    process.stderr.write(
      `[security-check] BLOCKED — high-severity finding(s) in ${filePath || "(unknown file)"}:\n${blocking
        .map((b) => `  - ${b}`)
        .join("\n")}\nIf this is a false positive (e.g. a test fixture or documentation string), rephrase it so it doesn't match a real-looking secret pattern, or ask the user before proceeding.\n`
    );
    process.exit(2);
  }

  return allow();
}

function allow() {
  process.exit(0);
}

// --- Entry point 2: batch/CLI scan (verify.sh Mode A) ----------------------

function runBatchScan(filePaths) {
  let anyBlocking = false;
  let filesWithFindings = 0;

  for (const filePath of filePaths) {
    let content;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue; // unreadable/deleted file — skip, don't fail the whole scan
    }

    const { blocking, warnings } = scanForSecurityIssues(filePath, content, null);
    if (blocking.length === 0 && warnings.length === 0) continue;

    filesWithFindings++;
    if (blocking.length > 0) anyBlocking = true;

    for (const b of blocking) console.log(`[FAIL] ${filePath}: ${b}`);
    for (const w of warnings) console.log(`[WARN] ${filePath}: ${w}`);
  }

  console.log(`[security-check] scanned ${filePaths.length} file(s), ${filesWithFindings} with findings.`);
  process.exit(anyBlocking ? 1 : 0);
}

// --- Dispatch ----------------------------------------------------------------

const cliArgs = process.argv.slice(2);

try {
  if (cliArgs.length > 0) {
    runBatchScan(cliArgs);
  } else {
    runPreToolUse();
  }
} catch {
  // Never let a bug in this script block a legitimate edit or crash a scan.
  process.exit(0);
}
