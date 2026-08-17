# Claude Code Governance Layer — `ai-portfolio-blog`

This directory contains the engineering-governance setup for this repository: skills for structured review, hooks for automatic lightweight checks, and this file explaining how they fit together. See root `CLAUDE.md` for the actual architecture/conventions these tools enforce — this file is about the *tooling*, not the codebase.

## Skills

Invoke a skill explicitly (`Skill(name, args)`) when its situation applies — they are not automatic.

| Skill | Use when | What it produces |
|---|---|---|
| **`verification`** | Before declaring any change/task/milestone complete. Always run this last. | A PASS/FAIL/WARN report from this repo's *real* commands (`tsc --noEmit`, `eslint`, `vitest run`, `next build`) plus a pattern-based sweep for weakened tests and security/entitlement regressions in the diff. |
| **`pr-review`** | Any non-trivial change, especially one spanning more than one concern (API + billing, UI + entitlement, etc.). | A full-scope review: correctness, architecture, security, tests, accessibility — grouped BLOCKING / SHOULD FIX / CONSIDER. |
| **`api-review`** | A new or changed `route.ts`. | Per-route breakdown: auth, authorization, ownership, identity source, validation, error codes, entitlement gating, logging safety, idempotency, concurrency. |
| **`architecture-review`** | Before adding a new service, table, cache, or anything that might duplicate something that already exists. | Answers to the 9 "does this already exist / is this actually needed" questions, plus a PROCEED / PROCEED WITH CHANGES / DO NOT PROCEED verdict. |
| **`ai-review`** | Any change touching `src/lib/ai/**`, `src/app/api/ai/**`, or the chat tool dispatcher. | A traced call graph for every LLM call site touched — GATED / INTENTIONALLY ANONYMOUS / UNGATED-SUSPICIOUS per caller, not just the one route that was changed. |

### Recommended order for a real feature change

1. Write the change.
2. `architecture-review` if it added anything new (service/table/cache/engine).
3. `api-review` for each changed route.
4. `ai-review` if any LLM call site was touched or newly reachable.
5. `pr-review` as the final full-scope pass.
6. `verification` — the actual PASS/FAIL gate.

For a small, single-concern fix, `verification` alone plus a quick read of the relevant narrower skill's checklist is usually enough — these skills are checklists to apply judgment against, not a mandatory five-step ritual for every one-line change.

## Hooks

Configured in `.claude/settings.json`, active automatically (not invoked manually). All three are deliberately conservative about blocking — see each script's own header comment for the exact reasoning. **These hooks are genuinely live**: while writing this file, `security-check.mjs` correctly blocked an earlier draft of this very document for containing example-secret-shaped text — see "Verifying the hooks are wired correctly" below for the (now safely worded) reproduction.

| Hook | Event | Behavior |
|---|---|---|
| `security-check.mjs` | `PreToolUse` on `Write`/`Edit` | Scans the content about to be written. **Blocks** (exit 2) only for narrow, high-confidence findings: a hardcoded secret literal (Stripe/OpenAI/AWS key shapes, a private-key block, a JWT-shaped literal), a `NEXT_PUBLIC_` variable name that matches a server-secret pattern, or a dynamic-code-execution call. **Warns only** (prints to stderr, does not block) for lower-confidence patterns: identity fields read from request input, a missing admin guard, unsanitized-HTML-render risk, path-traversal-adjacent filesystem calls, unvalidated redirect targets. |
| `code-quality-check.mjs` | `PreToolUse` on `Write`/`Edit` | Advisory only, never blocks. Flags `: any`, stray `console.log`/`debugger`/TODO markers, a hook call textually inside a conditional/loop, a `"use client"` file importing a server-only module, and an import from a package not recognized in this repo's actual dependency list. |
| `verification-check.mjs` | `Stop` | Advisory only, never blocks Claude from stopping (deliberately — a Stop hook that can force a retry risks an infinite loop). If no `.ts`/`.tsx` file has an uncommitted change, it's a silent no-op. Otherwise it lists which governance-relevant areas changed (API/billing/AI/admin) and reminds you to run the matching review skill(s) and the `verification` skill — it does **not** itself run the full `tsc`/`eslint`/`vitest`/`build` sequence on every turn, since that takes several minutes and would make every response slow. |

### Verifying the hooks are wired correctly

Each hook script is a standalone Node script and can be tested directly without going through Claude Code's tool-call machinery. The examples below are deliberately written so they don't themselves match the very patterns they're demonstrating (a real secret literal is a contiguous alphanumeric run — breaking that up with a separator is enough to test the "allowed" path safely; use a real key shape, unbroken, to test the "blocked" path):

```bash
# Should BLOCK (exit 2) — a real, unbroken Stripe-secret-key-shaped string:
printf '%s' '{"tool_name":"Write","tool_input":{"file_path":"x.ts","content":"const k = \"sk_live_' > /tmp/probe.json
printf '%s' 'abcdefghij1234567890\";"}}' >> /tmp/probe.json
node .claude/hooks/security-check.mjs < /tmp/probe.json; echo "exit=$?"

# Should WARN only (exit 0):
echo '{"tool_name":"Write","tool_input":{"file_path":"x.ts","content":"const x: any = 1;"}}' | node .claude/hooks/code-quality-check.mjs; echo "exit=$?"

# Should print a summary if any .ts/.tsx file is currently changed, exit 0 either way:
echo '{"hook_event_name":"Stop"}' | node .claude/hooks/verification-check.mjs; echo "exit=$?"
```

If a hook doesn't appear to fire during an actual session, confirm `.claude/settings.json` is being loaded (not shadowed by a `.claude/settings.local.json` override) and that the Claude Code version in use supports the `PreToolUse`/`Stop` hook events with this payload shape.

## Security workflow

1. `security-check.mjs` fires automatically on every `Write`/`Edit` — high-confidence secret/exposure patterns are blocked before the file is even written.
2. For anything the hook only warns about (or can't see, since it only inspects one edit's content, not the whole file/PR), use `api-review` (identity/ownership/auth) and `ai-review` (LLM call-graph tracing) explicitly.
3. `pr-review`'s "Special rule — alternate-route bypass tracing" section is the check most likely to catch what a single-file hook physically cannot: a *different* file reaching the same unprotected operation.

## Architecture workflow

Run `architecture-review`'s 9 questions before writing a new service/table/cache/engine, not after — this repo has a real, documented history (see root `CLAUDE.md`'s "Application Boundaries" and this skill's own `reference.md`) of two parallel systems existing for the same-sounding concern, and the 9 questions exist specifically to catch that pattern before it happens a third time.

## API workflow

Every changed `route.ts` gets the `api-review` checklist. This is intentionally more mechanical than `pr-review` — it's meant to be fast to apply repeatedly, one route at a time, and to catch the specific, recurring shape of defect this repo's own audit history shows (identity from the wrong source, a gate that exists but runs after the expensive call, a 403 where 404 was supposed to hide existence).

## AI/LLM workflow

`ai-review`'s core discipline: **a protected route proves nothing about an unprotected caller of the same underlying function.** Always grep for every caller of the LLM-invoking function across the whole repository, not just the file that changed — this is exactly how the two real, previously-shipped bypasses in this repo's history (a chat-tool bypass and a legacy-route duplicate) were found and fixed, and exactly the shape a future one would take if reintroduced.

## What this governance layer deliberately does not do

- It does not auto-fix anything. Every skill/hook reports; a human or a separate, deliberate agent action decides what to change.
- It does not run the full build/test/lint suite on every keystroke or every turn — that cost is reserved for the `verification` skill, invoked when you actually want the real answer.
- It does not invent a formatter, a second migration tool, a new cache layer, or any other infrastructure this repository doesn't already have — see root `CLAUDE.md`'s "Forbidden Changes" section, which this governance layer exists to help enforce, not override.
