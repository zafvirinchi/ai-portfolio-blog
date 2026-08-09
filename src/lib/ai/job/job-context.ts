import { AsyncLocalStorage } from "node:async_hooks";

// Request-scoped context, exactly the same pattern as resumeRequestContext
// (resume/resume-service.ts) — set by an API route via `.run()` so a future
// tool/consumer can find "which parsed job description is this request
// about" without threading a jobId through GraphState, Agent.run(), or
// ConversationService.ask(). Not wired into anything yet in this
// milestone (no chat/tool integration — that's a later milestone), but the
// context itself is additive and ready for reuse.
export const jobRequestContext = new AsyncLocalStorage<{ jobId: string }>();
