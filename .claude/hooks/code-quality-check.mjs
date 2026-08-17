#!/usr/bin/env node
// Code-quality hook — PreToolUse, matcher: Write|Edit.
//
// Fast, pattern-based, ADVISORY ONLY (never blocks — exit 0 always,
// findings go to stderr). Real TypeScript/lint validation is the
// verification hook's job (runs the actual tsc/eslint commands); this
// hook exists for cheap, immediate signal on every edit without paying
// the cost of a full project-wide type-check/lint per keystroke.
//
// Does not impose any formatting/style rule this repo doesn't already
// enforce via its own ESLint config — no Prettier, no invented style.

import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

function readStdin() {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return null;
  }
}

// Derived from package.json itself (both dependencies and devDependencies),
// not hand-maintained — this is the ACTUAL repository dependency list, so it
// never drifts out of sync the way a hardcoded array would. Re-read fresh on
// every invocation (this hook is already a fresh process per edit, so there
// is no staleness window).
function loadKnownPackageNames() {
  try {
    const hookDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(hookDir, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  } catch {
    // Fail open: if package.json can't be read for any reason, don't warn
    // on every single import — better to under-report than to spam.
    return null;
  }
}

// Node's own builtin-module list (fs, path, crypto, node:async_hooks, ...) —
// read from Node itself rather than hand-listed, so it's always accurate for
// whatever Node version this hook actually runs under.
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** The package NAME a bare import specifier resolves to (never a subpath) —
 * "@langchain/openai/foo" -> "@langchain/openai"; "zod/v4" -> "zod". */
function packageNameOf(spec) {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.slice(0, 2).join("/");
  }
  return spec.split("/")[0];
}

// The one detection engine, shared by both entry points (stdin/PreToolUse
// and the CLI batch-scan mode used by verify.sh's Mode A).
function scanForQualityIssues(filePath, content) {
  const warnings = [];
  if (!content) return warnings;
  if (!/\.(ts|tsx)$/.test(filePath)) return warnings;
  if (/\.claude[\\/](hooks|skills)[\\/]/.test(filePath)) return warnings;

  // Explicit `any` (not `unknown`, not a generic constraint) — this repo's
  // tsconfig is strict:true; a new `: any` is usually avoidable.
  if (/:\s*any\b(?!\w)/.test(content)) {
    warnings.push("explicit `: any` — prefer a real type or `unknown` with a narrowing check");
  }

  // Obvious dead-code / leftover debug markers.
  if (/console\.log\(/.test(content) && /src[\\/]app[\\/]api[\\/]/.test(filePath)) {
    warnings.push("console.log( in an API route — this repo's convention is console.error(\"[feature] X failed\", error) for real failures, not console.log for routine flow");
  }
  if (/\bTODO\b|\bFIXME\b|\bXXX\b/.test(content)) {
    warnings.push("TODO/FIXME/XXX marker introduced — confirm this is intentional to leave in place");
  }
  if (/debugger;/.test(content)) {
    warnings.push("debugger; statement present");
  }

  // React hook rule-of-hooks heuristic: a `use[A-Z]` call textually inside
  // an `if (`/`for (`/`while (` block in the same edit. Cheap heuristic,
  // not a real hook-order analyzer — false positives possible (e.g. a hook
  // call inside a nested component defined inside a conditional, which is
  // itself already wrong for a different reason) but worth a flag either way.
  if (/\.tsx$/.test(filePath) && /\b(if|for|while)\s*\([^)]*\)\s*\{[^}]*\buse[A-Z]\w*\(/.test(content)) {
    warnings.push("a `use*` hook call appears textually inside a conditional/loop block — confirm this doesn't violate the Rules of Hooks");
  }

  // Server/client boundary: a client component importing a server-only
  // module.
  if (/"use client"/.test(content)) {
    const serverOnlyImports = ["@/lib/supabase/admin", "@/lib/supabase-server", "next/headers"];
    for (const mod of serverOnlyImports) {
      if (content.includes(mod)) {
        warnings.push(`"use client" file imports server-only module "${mod}" — this will fail to build or silently misbehave`);
      }
    }
  }

  // Suspicious new dependency-shaped import — cheap heuristic, WARN only,
  // human judgment required. Three legitimate shapes are recognized and
  // never flagged: the "@/*" path alias (tsconfig.json/this repo's own
  // convention, not an npm package at all), a Node.js builtin (bare or
  // "node:"-prefixed, read from Node itself via node:module so this never
  // goes stale), and a real dependency of THIS repository (read fresh from
  // package.json on every run — see loadKnownPackageNames() — so this
  // reflects the actual repository architecture, not a hand-maintained
  // guess that drifts as dependencies change). A relative import
  // ("./foo"/"../foo") never reaches this check at all (excluded by the
  // regex's own character class below).
  //
  // Anchored to an actual import/export-from statement (line starts with
  // "import"/"export", "from ...\"...\"" found before the statement's
  // closing ";") — NOT a bare search for the word "from" anywhere in the
  // file. A bare search was tried and confirmed to produce real false
  // positives against this repository's own source: prose inside string
  // literals and comments containing the word "from" followed by a quoted
  // phrase (e.g. a comment reading "...distinguished from 'always on this
  // plan'...", or a doc comment "...level" into a single...") was
  // misidentified as an import specifier. Requiring the import/export
  // keyword at line-start eliminates that class of false positive.
  //
  // The captured specifier's first character is a letter or "@" —
  // deliberately covers scoped packages ("@supabase/ssr") and the "@/"
  // alias, which a plain [a-zA-Z] class would silently miss entirely
  // (verified: that was a separate real, confirmed bug in an earlier
  // version of this hook — @-prefixed imports were never even inspected).
  // The gap between the keyword and "from" additionally excludes "(", "`",
  // ":", "=" — characters that never appear in a real import/export-from
  // clause (which is only identifiers/commas/braces/"*"/"as") but appear
  // almost immediately in an "export function"/"export const"/"export
  // class" declaration's own body. Without this, a lazy [^;]* scan could
  // run past an unterminated multi-line body (object/array literal,
  // template string — none of which use ";") and match an unrelated
  // "from" deep inside it (confirmed: this happened for real against
  // src/lib/ai/job-description/jd-parser.ts's buildExtractionMessages(),
  // whose template-literal prompt body contains the prose "...from
  // \"goodToHaveSkills\"..." with no semicolon between the `export
  // function` line and it).
  const importMatches = [...content.matchAll(/^\s*(?:import|export)\b[^;(`:=]*?\bfrom\s+["']([a-zA-Z@][^"']*)["']/gm)];
  const knownPackages = loadKnownPackageNames();
  for (const [, spec] of importMatches) {
    if (spec === "@/" || spec.startsWith("@/")) continue; // this repo's own path alias, not a package
    if (NODE_BUILTINS.has(spec)) continue;
    if (knownPackages === null) continue; // package.json unreadable — fail open, don't spam
    if (knownPackages.has(packageNameOf(spec))) continue;
    warnings.push(`import from "${spec}" — package "${packageNameOf(spec)}" is not in this repository's package.json (dependencies or devDependencies); confirm it's already installed rather than assuming it can be added`);
  }

  return warnings;
}

// --- Entry point 1: PreToolUse (stdin JSON) --------------------------------

function runPreToolUse() {
  const raw = readStdin();
  if (!raw) return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const toolName = payload.tool_name ?? "";
  if (toolName !== "Write" && toolName !== "Edit") return;

  const input = payload.tool_input ?? {};
  const filePath = String(input.file_path ?? "");
  const content = String(input.content ?? input.new_string ?? "");

  const warnings = scanForQualityIssues(filePath, content);

  if (warnings.length > 0) {
    process.stderr.write(`[code-quality-check] ${filePath}:\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`);
  }
}

// --- Entry point 2: batch/CLI scan (verify.sh Mode A) ----------------------
//
// Advisory-only in this mode too: always exits 0 (this hook never blocks,
// by design — see file header), but prints every finding so verify.sh's
// report reflects it.

function runBatchScan(filePaths) {
  let filesWithFindings = 0;
  for (const filePath of filePaths) {
    let content;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue; // unreadable/deleted file — skip, don't fail the whole scan
    }
    const warnings = scanForQualityIssues(filePath, content);
    if (warnings.length === 0) continue;
    filesWithFindings++;
    for (const w of warnings) console.log(`[WARN] ${filePath}: ${w}`);
  }
  console.log(`[code-quality-check] scanned ${filePaths.length} file(s), ${filesWithFindings} with findings.`);
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
  // Advisory only — never fail the tool call (or the batch scan) because
  // this hook broke.
}
process.exit(0);
