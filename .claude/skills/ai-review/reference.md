# AI/LLM Review Skill — Reference

## The one metered client

`src/lib/ai/openai.ts` — every real OpenAI call in this repo should ultimately route through this (directly, or via LangChain's `@langchain/openai` wrapper configured against the same credentials/base URL). Env vars: `OPENAI_API_KEY` (required), `OPENAI_BASE_URL`/`OPENAI_MODEL` (optional overrides — this repo supports pointing at an OpenAI-compatible endpoint/model, don't assume a hardcoded model name is equivalent).

## Known, previously-fixed bypass: the exact shape to watch for

`src/lib/ai/tools/resume.tool.ts`'s `handleRecruiterMessage()` used to call `candidateService.compare()`/`candidateService.recommendTopCandidates()` (both real LLM calls, both gated by `recruiter.analytics` at their dedicated REST routes `/api/ai/recruiter/compare` and `/recommend`) with **zero** entitlement check — reachable via chat with `recruiterMode: true`. Fixed by adding the identical `requireFeature(recruiterId, "recruiter.analytics")` call inside the tool handler itself, immediately before each service call (see the file's own Phase 19 M5 comments). **This is the reference example for what "trace the call graph, don't trust the route" means in practice** — the chat route's own gate (`resume.ai_assistant`/`AI_CHAT_MESSAGES`) is a *different* feature entirely and provided no protection for this recruiter-specific action.

## Ephemeral-session features: why gating the start route is sufficient (and how to verify it actually is)

For resume-rewriter, mock-interview, interview-prep, LinkedIn Optimizer, Cover Letter Generator: the session id (`rewriteId`/`sessionId`/`prepId`/`linkedinId`/`coverLetterId`) is a `randomUUID()` minted only inside that feature's own `start()` function, stored in an in-memory `Map`. Every sub-action route and every chat-tool handler for that feature calls `.get(id)` first and returns a "not found" error for any id that wasn't legitimately minted. **To verify a new sub-action doesn't need its own gate**, confirm: (a) it requires a valid session id as a precondition, (b) that id can only come from the already-gated `start()` route, (c) there is no alternate way to mint or guess a valid id. If any of these three don't hold for a new feature, it needs its own gate — don't assume the pattern applies without checking.

## Output validation pattern (copy this shape for a new generator)

```ts
let output = await generateX(ctx);
let validation = validateXContent(resume, output.text, ...);

if (!validation.valid) {
  output = await generateX(ctx, validation.violations.join("; ")); // one retry, feeding back the violation
  validation = validateXContent(resume, output.text, ...);

  if (!validation.valid) {
    throw new Error(`X generation repeatedly produced ungrounded content: ${validation.violations.join("; ")}`);
  }
}
```

Bounded to exactly one retry in every existing instance of this pattern (`linkedin/linkedin-service.ts`, `cover-letter/cover-service.ts`, `resume-rewriter/rewrite-service.ts`) — an unbounded retry loop would be a new, different (and worse) shape; flag it if seen.

## Where prompt-injection handling actually lives

`src/lib/ai/prompt-security.ts` plus per-feature prompt-builder files. The established pattern across this repo's own security-audit trail (`PHASE13_MILESTONE2{0,1,2,3,4}_*SECURITY*.md`) is: untrusted content (resume/JD/candidate text) goes into a clearly-delimited block within the prompt, with an explicit system-level instruction that content inside the block is data, not instructions. A new prompt-construction site should match the delimiting style already used by the nearest sibling generator in the same feature directory — don't invent a new delimiter convention.
