import { NextResponse } from "next/server";

import { InterviewIntelligence } from "@/lib/ai/interview-prep/interview-intelligence-service";
import { computeInterviewProgress, isSameContext, SessionProgressPoint } from "@/lib/ai/mock-interview/interview-progress";
import { buildSessionDebrief, SessionNotCompletedError } from "@/lib/ai/mock-interview/session-debrief";
import { sessionService } from "@/lib/ai/mock-interview/session-service";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { getOptionalUserId } from "@/lib/billing/persona-service";

// Phase 17 Milestone 6 — read-only, deterministic, zero-LLM. sessionService
// has no list()/getAll() method (audited — see the milestone's final
// report, §1) and none was added here: the caller (the client's own
// localStorage breadcrumb list, practice-history-store.ts) supplies WHICH
// opaque sessionIds to ask about — the same bearer-token trust boundary
// every other mock-interview route already uses for one id, just extended
// to many. Nothing about SCORE, READINESS, CATEGORY DATA, or CANDIDATE
// IDENTITY is ever accepted from the client — every one of those values
// is re-derived server-side from sessionService.get() + buildSessionDebrief()
// for each id, exactly like the debrief route (M5). resumeId/jdMatchId are
// required and used only to FILTER which resolved sessions are eligible
// for comparison (§ "compare only compatible interview contexts") — never
// trusted as authoritative content themselves (they're the same opaque
// ephemeral-store ids every other route in this family already accepts).

const MAX_SESSION_IDS = 20;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionIdsParam = url.searchParams.get("sessionIds");
  const resumeId = url.searchParams.get("resumeId");
  const jdMatchId = url.searchParams.get("jdMatchId");

  if (!resumeId || !jdMatchId) {
    return NextResponse.json({ error: "resumeId and jdMatchId are required." }, { status: 400 });
  }

  const sessionIds = Array.from(new Set((sessionIdsParam ?? "").split(",").map((id) => id.trim()).filter(Boolean))).slice(0, MAX_SESSION_IDS);

  if (sessionIds.length === 0) {
    return NextResponse.json({ error: "sessionIds must include at least one session id." }, { status: 400 });
  }

  // Phase 18 Milestone 5 — additive, no-op for anonymous callers (this
  // route stays fully unauthenticated, exactly like its sibling debrief
  // route). interview.progress has no metric (NONE on Free, UNLIMITED
  // on Pro/Premium) — a boolean feature gate.
  const platformUserId = await getOptionalUserId();
  if (platformUserId) {
    try {
      await requireFeature(platformUserId, "interview.progress");
    } catch (error) {
      const entitlementError = entitlementErrorResponse(error);
      if (entitlementError) return entitlementError;
      throw error;
    }
  }

  const points: SessionProgressPoint[] = [];
  // Phase 17 Milestone 7 — request-scoped only (never module-level): most
  // sessions in one history request share the same prepId (they were all
  // started from the same page), so this avoids recomputing that prep
  // report's coverage/plan/study-plan once per session that reuses it.
  // See interview-intelligence-service.ts's own comment for why this is
  // correctness-safe.
  const intelligenceCache = new Map<string, InterviewIntelligence>();

  for (const sessionId of sessionIds) {
    const session = sessionService.get(sessionId);
    if (!session) continue; // invalid/expired id — silently excluded, never an error for the whole request
    if (!isSameContext(session, resumeId, jdMatchId)) continue; // different interview context — never compared

    try {
      points.push({ session, debrief: buildSessionDebrief(sessionId, intelligenceCache) });
    } catch (error) {
      if (error instanceof SessionNotCompletedError) {
        points.push({ session, debrief: null });
        continue;
      }
      throw error;
    }
  }

  points.sort((a, b) => a.session.createdAt.localeCompare(b.session.createdAt));

  return NextResponse.json(computeInterviewProgress(points, intelligenceCache));
}
