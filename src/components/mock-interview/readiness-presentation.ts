import type { ReadinessRecommendation } from "@/lib/ai/mock-interview/session-debrief";

// Phase 17 Milestone 7 — audit finding: MockInterviewDebrief.tsx (M5) and
// MockInterviewProgress.tsx (M6) had each grown their own, separately
// hand-written copy of this exact same label/color mapping. Not a
// terminology CONFLICT (both used identical strings) but a genuine
// "shared presentation mapping" gap per this milestone's own Step 2 —
// factored out once so the two can never silently drift apart.
//
// This is deliberately NOT merged with interview-coverage.ts's own
// computeReadinessLabel() ("Ready for Interview" / "Needs More
// Preparation") — that's a different, coarser, 2-level metric (the raw
// predicted readiness score alone, used by PrepOverview and reused as-is
// by the recruiter package's buildInterviewReadinessView) from a
// different concept: this 3-level ReadinessRecommendation additionally
// factors in which CRITICAL/HIGH topics this session's own answers
// actually demonstrated. Collapsing the two would either lose that extra
// signal or fabricate it into the simpler score-only label — neither is
// acceptable, so both vocabularies are kept, each clearly labeled for
// what it actually is ("Readiness status" vs "Readiness recommendation"
// in their respective aria-labels).
export const READINESS_RECOMMENDATION_COPY: Record<ReadinessRecommendation, { label: string; className: string }> = {
  READY_FOR_INTERVIEW: { label: "Ready for another interview attempt", className: "bg-green-100 text-green-700" },
  PRACTICE_BEFORE_INTERVIEW: { label: "Practice a bit more before your next interview", className: "bg-amber-100 text-amber-700" },
  NEEDS_FOCUSED_PREPARATION: { label: "Needs focused preparation before trying again", className: "bg-red-100 text-red-700" },
};
