import { jdMatchService } from "../job-description/jd-service";
import { computeRankingScore } from "../recruiter/candidate-ranking";
import { candidateService } from "../recruiter/candidate-service";
import { CandidateSummary } from "../recruiter/candidate-types";

import { daysInStage, isStuck } from "./candidate-stage";
import { CandidateStage, PIPELINE_STAGES } from "./pipeline-schema";
import {
  BottleneckInsight,
  DropOffInsight,
  DuplicateProfileInsight,
  FastHiringInsight,
  HighPotentialInsight,
  IncompleteProfileInsight,
  InterviewSchedule,
  Job,
  MissingInterviewInsight,
  Offer,
  OfferAcceptanceTrend,
  PipelineCandidate,
  PipelineInsights,
  SkillGapInsight,
  StuckCandidateInsight,
  TopCandidateInsight,
} from "./pipeline-types";

// Deterministic, no LLM call anywhere in this file (plan design
// decision 9) — "AI Dashboard" and "AI Pipeline Insights" are both
// fundamentally "detect real patterns in real data," combined into
// one module.

const INTERVIEW_STAGES: CandidateStage[] = ["Technical Interview", "Manager Interview", "HR Interview"];
const LATE_STAGES: CandidateStage[] = ["Manager Interview", "HR Interview", "Offer"];

// Same job-specific-match discipline as pipeline-analytics.ts and the
// pipeline list route — ATS/JD Match must reflect THIS job's own
// match (pc.jdMatchId), not Milestone 8's workspace-level match on the
// candidate summary, wherever a score feeds into job-fit ranking.
function jobScopedSummary(pc: PipelineCandidate, allCandidates: CandidateSummary[]): CandidateSummary | undefined {
  const summary = allCandidates.find((candidate) => candidate.candidateId === pc.candidateId);
  if (!summary) return undefined;

  const jdMatchRecord = pc.jdMatchId ? jdMatchService.get(pc.jdMatchId) : undefined;

  return {
    ...summary,
    scores: {
      ...summary.scores,
      atsScore: jdMatchRecord?.matchResult.atsScore ?? null,
      jdMatch: jdMatchRecord?.matchResult.overallMatch ?? null,
    },
  };
}

function nameOf(allCandidates: CandidateSummary[], candidateId: string): string {
  return allCandidates.find((candidate) => candidate.candidateId === candidateId)?.name ?? "Unknown candidate";
}

function computeBottlenecks(pipelineCandidates: PipelineCandidate[]): BottleneckInsight[] {
  const results: BottleneckInsight[] = [];

  for (const stage of PIPELINE_STAGES) {
    if (stage === "Hired") continue;

    const inStage = pipelineCandidates.filter((pc) => pc.stage === stage);
    const stuckCount = inStage.filter((pc) => isStuck(pc)).length;

    if (stuckCount >= 2) {
      results.push({ stage, candidateCount: inStage.length, note: `${stuckCount} candidate(s) have been in ${stage} for a week or more.` });
    }
  }

  return results;
}

function computeStuckCandidates(pipelineCandidates: PipelineCandidate[], allCandidates: CandidateSummary[]): StuckCandidateInsight[] {
  return pipelineCandidates
    .filter((pc) => isStuck(pc))
    .map((pc) => ({
      pipelineCandidateId: pc.pipelineCandidateId,
      candidateName: nameOf(allCandidates, pc.candidateId),
      stage: pc.stage,
      daysInStage: daysInStage(pc),
    }))
    .sort((a, b) => b.daysInStage - a.daysInStage);
}

function computeMissingInterviews(
  pipelineCandidates: PipelineCandidate[],
  interviews: InterviewSchedule[],
  allCandidates: CandidateSummary[]
): MissingInterviewInsight[] {
  return pipelineCandidates
    .filter((pc) => INTERVIEW_STAGES.includes(pc.stage))
    .filter((pc) => !interviews.some((interview) => interview.pipelineCandidateId === pc.pipelineCandidateId))
    .map((pc) => ({
      pipelineCandidateId: pc.pipelineCandidateId,
      candidateName: nameOf(allCandidates, pc.candidateId),
      stage: pc.stage,
    }));
}

function computeDropOff(pipelineCandidates: PipelineCandidate[]): DropOffInsight[] {
  const counts = new Map<CandidateStage, number>();

  for (const pc of pipelineCandidates) {
    if (pc.stage !== "Rejected") continue;

    const priorEntry = pc.stageHistory[pc.stageHistory.length - 2];
    const fromStage = priorEntry?.stage ?? "Applied";
    counts.set(fromStage, (counts.get(fromStage) ?? 0) + 1);
  }

  return [...counts.entries()].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count);
}

function computeSkillGaps(pipelineCandidates: PipelineCandidate[], job: Job | null): SkillGapInsight[] {
  if (!job) return [];

  const skillsToCheck = [...job.requiredSkills, ...job.preferredSkills];
  const counts = new Map<string, number>();

  for (const pc of pipelineCandidates) {
    const jdMatchRecord = pc.jdMatchId ? jdMatchService.get(pc.jdMatchId) : undefined;
    if (!jdMatchRecord) continue;

    for (const skill of skillsToCheck) {
      if (jdMatchRecord.matchResult.missingSkills.some((missing) => missing.toLowerCase() === skill.toLowerCase())) {
        counts.set(skill, (counts.get(skill) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()].map(([skill, missingCount]) => ({ skill, missingCount })).sort((a, b) => b.missingCount - a.missingCount);
}

function computeOfferTrend(offers: Offer[]): OfferAcceptanceTrend {
  const sent = offers.filter((offer) => offer.status === "Sent" || offer.status === "Accepted" || offer.status === "Declined").length;
  const accepted = offers.filter((offer) => offer.status === "Accepted").length;
  const declined = offers.filter((offer) => offer.status === "Declined").length;
  const decided = accepted + declined;

  return { sent, accepted, declined, acceptanceRate: decided > 0 ? Math.round((accepted / decided) * 100) : null };
}

function computeTopCandidates(pipelineCandidates: PipelineCandidate[], allCandidates: CandidateSummary[]): TopCandidateInsight[] {
  return pipelineCandidates
    .map((pc) => {
      const summary = jobScopedSummary(pc, allCandidates);
      if (!summary) return null;
      return { pipelineCandidateId: pc.pipelineCandidateId, candidateName: summary.name, rankingScore: computeRankingScore(summary.scores) };
    })
    .filter((item): item is TopCandidateInsight => item !== null)
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, 5);
}

function computeHighPotential(pipelineCandidates: PipelineCandidate[], allCandidates: CandidateSummary[]): HighPotentialInsight[] {
  return pipelineCandidates
    .filter((pc) => pc.hiringRecommendation && (pc.hiringRecommendation.classification === "Hire Immediately" || pc.hiringRecommendation.leadershipPotential.rating === "High"))
    .map((pc) => ({
      pipelineCandidateId: pc.pipelineCandidateId,
      candidateName: nameOf(allCandidates, pc.candidateId),
      reason: pc.hiringRecommendation!.classification === "Hire Immediately" ? "Classified as Hire Immediately" : "High leadership potential",
    }));
}

function computeFastHiring(pipelineCandidates: PipelineCandidate[], allCandidates: CandidateSummary[]): FastHiringInsight[] {
  return pipelineCandidates
    .filter((pc) => LATE_STAGES.includes(pc.stage))
    .map((pc) => {
      const summary = allCandidates.find((candidate) => candidate.candidateId === pc.candidateId);
      if (!summary || (summary.scores.overallScore ?? 0) < 60) return null;
      return {
        pipelineCandidateId: pc.pipelineCandidateId,
        candidateName: summary.name,
        reason: `Already at ${pc.stage} with a strong overall score of ${summary.scores.overallScore}.`,
      };
    })
    .filter((item): item is FastHiringInsight => item !== null);
}

// Pool-hygiene detections — deliberately workspace-wide across every
// Milestone 8 candidate, not scoped to one job's pipeline, since
// duplicate/incomplete profiles are a candidate-pool concern.

async function computeDuplicateProfiles(allCandidates: CandidateSummary[]): Promise<DuplicateProfileInsight[]> {
  const byEmail = new Map<string, { candidateId: string; name: string }[]>();

  const profiles = await Promise.all(allCandidates.map((summary) => candidateService.getProfileForSystemUse(summary.candidateId)));

  allCandidates.forEach((summary, index) => {
    const email = profiles[index]?.resume.contact.email?.toLowerCase().trim();
    if (!email) return;

    const entries = byEmail.get(email) ?? [];
    entries.push({ candidateId: summary.candidateId, name: summary.name });
    byEmail.set(email, entries);
  });

  const results: DuplicateProfileInsight[] = [];

  for (const [email, entries] of byEmail) {
    if (entries.length > 1) {
      results.push({
        candidateIds: entries.map((entry) => entry.candidateId),
        candidateNames: entries.map((entry) => entry.name),
        reason: `Same email address (${email})`,
      });
    }
  }

  return results;
}

async function computeIncompleteProfiles(allCandidates: CandidateSummary[]): Promise<IncompleteProfileInsight[]> {
  const results: IncompleteProfileInsight[] = [];

  const profiles = await Promise.all(allCandidates.map((summary) => candidateService.getProfileForSystemUse(summary.candidateId)));

  allCandidates.forEach((summary, index) => {
    const profile = profiles[index];
    if (!profile) return;

    const missing: string[] = [];
    if (!profile.resume.summary) missing.push("summary");
    if (profile.resume.skills.length === 0 && profile.resume.technicalSkills.length === 0) missing.push("skills");
    if (profile.resume.workExperience.length === 0) missing.push("work experience");
    if (!profile.resume.contact.email) missing.push("email");
    if (!profile.resume.contact.phone) missing.push("phone");

    if (missing.length > 0) {
      results.push({ candidateId: summary.candidateId, candidateName: summary.name, missingFields: missing });
    }
  });

  return results;
}

export async function computeInsights(params: {
  jobId: string | null;
  pipelineCandidates: PipelineCandidate[];
  job: Job | null;
  interviews: InterviewSchedule[];
  offers: Offer[];
}): Promise<PipelineInsights> {
  const allCandidates = await candidateService.listForSystemUse();
  const [duplicateProfiles, incompleteProfiles] = await Promise.all([computeDuplicateProfiles(allCandidates), computeIncompleteProfiles(allCandidates)]);

  return {
    jobId: params.jobId,
    bottlenecks: computeBottlenecks(params.pipelineCandidates),
    stuckCandidates: computeStuckCandidates(params.pipelineCandidates, allCandidates),
    missingInterviews: computeMissingInterviews(params.pipelineCandidates, params.interviews, allCandidates),
    candidateDropOff: computeDropOff(params.pipelineCandidates),
    skillGaps: computeSkillGaps(params.pipelineCandidates, params.job),
    offerAcceptanceTrend: computeOfferTrend(params.offers),
    topCandidates: computeTopCandidates(params.pipelineCandidates, allCandidates),
    highPotentialCandidates: computeHighPotential(params.pipelineCandidates, allCandidates),
    fastHiringOpportunities: computeFastHiring(params.pipelineCandidates, allCandidates),
    duplicateProfiles,
    incompleteProfiles,
  };
}
