---
name: ai-review
description: Review of an AI/LLM-touching change for prompt injection safety, untrusted-data boundaries, tool-call authorization, LLM call duplication/cost exposure, entitlement/quota checks before generation, structured output validation, and call-graph tracing. Use for any change to src/lib/ai/**, src/app/api/ai/**, or the chat tool dispatcher.
---

# AI/LLM Review Skill

## Special rule (read first)

**Never assume that because one API route is protected, the underlying LLM operation is protected.** A gated route and an ungated chat-tool handler can call the identical generator function — the route being safe tells you nothing about the other caller. Every review under this skill must end with an actual call-graph trace (see below), not an inspection of the one file that was changed.

## How to trace a call graph in this repository

1. Identify the LLM-invoking function (something that calls `openai.chat.completions.create`/`openai.responses.create`/`openai.embeddings.create`, or a LangChain `ChatOpenAI` invocation, directly or via one of the per-feature `generate*` files in `src/lib/ai/<feature>/`).
2. `grep -rn "<functionName>" src --include="*.ts"` for every caller, across the whole repository, not just `src/app/api/**`.
3. For each caller found, classify it: **GATED** (a `requireFeature`/`requireQuota` call precedes it in the same function or an immediately-enclosing one, or it's structurally unreachable without first passing a gated session-start route — see the ephemeral-session pattern in CLAUDE.md), **INTENTIONALLY ANONYMOUS/FREE** (an explicit comment or established product policy says so — cite it), or **UNGATED/SUSPICIOUS** (neither — report this as a finding regardless of how the change you were asked to review got here).
4. Specifically check `src/lib/ai/tools/resume.tool.ts` for every feature touched by the change — this file's intent-detection dispatcher is the single most common source of a route-level gate being bypassed in this repo's own history.

## Review checklist

### Prompt injection protection
- Is user-controlled content (resume text, JD text, candidate notes, chat messages) clearly delimited from system-level instructions in the prompt-construction code, following the existing pattern for that feature area (see `src/lib/ai/prompt-security.ts` and the feature's own prompt-builder file)?
- Does a new prompt-construction site interpolate untrusted content directly into an instruction string without delimiting it, where a sibling feature already has an established delimiting pattern to copy?

### Untrusted-data boundaries
- Resume/JD/candidate content is untrusted input, even though it originates from the platform's own upload flow — it can contain adversarial text. Confirm new code treats it the same way existing code in the same feature area does.

### Tool-call authorization
- For a new or changed intent handler in `resume.tool.ts` (or any future chat-tool dispatcher): does it independently call `requireFeature`/`requireQuota` for any LLM-backed action it triggers, using the *same* feature id/metric its dedicated REST route (if one exists) uses? Do not accept "the chat route already checked `resume.ai_assistant`" as sufficient — that gates *chat access in general*, not the specific downstream feature (e.g. `recruiter.analytics`) the tool handler reaches into.

### Agent intent routing
- Does a new planner/tool-selection path have a route that reaches `generation`/an LLM call without passing through the existing routing logic? (See `architecture-review` skill for the full graph-acyclicity check.)

### LLM call duplication / token usage / cost exposure
- Does the change call an LLM more than once for what a user would perceive as one action? (Compare against the established "one usage unit per user-visible operation" rule — internal multi-variant/multi-agent fan-out within *one* logical operation is fine and already how chat/cover-letter work; two separate logical calls for one user action is not.)
- Is there a cheaper, deterministic way to get the same result (see `architecture-review` skill's "deterministic engines that exist" list)?

### Entitlement/quota checks before generation
- Trace the actual order of operations — a `requireFeature`/`requireQuota` call that exists in the function but after the LLM call, or in a code path not actually taken before reaching the call, does not count.

### Structured output validation
- Does a new generator validate the LLM's output before persisting/returning it (matching this repo's established pattern of a `validate*Content()`/`validation.valid` check with a single bounded retry on failure, e.g. `linkedin/validator.ts`, `cover-letter/validator.ts`)? A new generator with no output validation, where sibling generators for the same feature family have one, is a regression.

### Error/fallback behavior
- Does a generation failure fail safely (a clear error surfaced to the route's `catch` block), not silently return fabricated/placeholder content presented as real?

### Model selection
- Does the change hardcode a model name where the existing pattern reads one from `src/lib/ai/openai.ts`'s configuration (which itself respects `OPENAI_MODEL`/`OPENAI_BASE_URL` env vars)? A new hardcoded model name bypasses that configurability.

### Context size / sensitive data exposure
- Does a new prompt include more of a resume/candidate record than the task actually needs (e.g., passing full contact/PII fields into a prompt that only needs skills/experience text)? Compare against how the nearest sibling generator scopes its own context.

## Output format

For each LLM call site touched or newly reachable by the change:

```
<function/file>
  Callers found: <list, with GATED/INTENTIONALLY-ANONYMOUS/UNGATED-SUSPICIOUS per caller>
  Prompt injection handling: <ok / missing / not applicable>
  Output validation: <ok / missing / not applicable>
  Verdict: SAFE | NEEDS FIX (<why>)
```

Then a summary: total LLM call sites reviewed, total UNGATED/SUSPICIOUS findings (should be zero for a change to ship).
