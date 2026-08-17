import { FEATURE_IDS, FeatureId, PlatformRole } from "./platform-schema";

// Phase 18 Milestone 1 — Step 4. Metadata about each feature id, kept
// separate from platform-plan-registry.ts's PLAN → feature ENTITLEMENT
// matrix: this file answers "what is this feature and who does it
// primarily belong to", the plan registry answers "does plan X grant
// it, and how much". Category groupings mirror this codebase's own
// existing product areas (Phase 13 resume/interview arcs, Phase 16
// recruiter arc) — not invented groupings.

export type FeatureCategory = "resume" | "job" | "interview" | "recruiter";

export interface FeatureDefinition {
  id: FeatureId;
  category: FeatureCategory;
  label: string;
  /** Which persona this feature is primarily built for — informational only (used for UI grouping and sanity checks), never itself an access check. A JOB_SEEKER-primary feature isn't blocked from a RECRUITER account by this field; the plan matrix is the actual authority. */
  primaryPersona: PlatformRole;
}

export const FEATURE_REGISTRY: Record<FeatureId, FeatureDefinition> = {
  "resume.ats.score": { id: "resume.ats.score", category: "resume", label: "ATS Score", primaryPersona: "JOB_SEEKER" },
  "resume.jd.match": { id: "resume.jd.match", category: "resume", label: "JD Matching", primaryPersona: "JOB_SEEKER" },
  "resume.optimize": { id: "resume.optimize", category: "resume", label: "Resume Optimization", primaryPersona: "JOB_SEEKER" },
  "resume.rewrite": { id: "resume.rewrite", category: "resume", label: "Resume Rewriting", primaryPersona: "JOB_SEEKER" },
  "resume.ai_assistant": { id: "resume.ai_assistant", category: "resume", label: "AI Resume Assistant", primaryPersona: "JOB_SEEKER" },
  "resume.builder": { id: "resume.builder", category: "resume", label: "Dynamic Resume Builder", primaryPersona: "JOB_SEEKER" },
  "resume.templates": { id: "resume.templates", category: "resume", label: "Resume Templates", primaryPersona: "JOB_SEEKER" },
  "resume.versions": { id: "resume.versions", category: "resume", label: "Resume Versions", primaryPersona: "JOB_SEEKER" },
  "resume.export": { id: "resume.export", category: "resume", label: "Resume Export", primaryPersona: "JOB_SEEKER" },
  "resume.linkedin_optimizer": { id: "resume.linkedin_optimizer", category: "resume", label: "LinkedIn Optimizer", primaryPersona: "JOB_SEEKER" },

  "job.match": { id: "job.match", category: "job", label: "Job Match", primaryPersona: "JOB_SEEKER" },
  "job.analyzer": { id: "job.analyzer", category: "job", label: "Job Description Analyzer", primaryPersona: "JOB_SEEKER" },
  "job.cover_letter": { id: "job.cover_letter", category: "job", label: "Cover Letter Generator", primaryPersona: "JOB_SEEKER" },

  "interview.prepare": { id: "interview.prepare", category: "interview", label: "Interview Preparation", primaryPersona: "JOB_SEEKER" },
  "interview.mock": { id: "interview.mock", category: "interview", label: "Mock Interview", primaryPersona: "JOB_SEEKER" },
  "interview.debrief": { id: "interview.debrief", category: "interview", label: "Interview Debrief", primaryPersona: "JOB_SEEKER" },
  "interview.progress": { id: "interview.progress", category: "interview", label: "Interview Progress", primaryPersona: "JOB_SEEKER" },
  "interview.study_plan": { id: "interview.study_plan", category: "interview", label: "Study Plan", primaryPersona: "JOB_SEEKER" },

  "recruiter.workspace": { id: "recruiter.workspace", category: "recruiter", label: "Recruiter Workspace", primaryPersona: "RECRUITER" },
  "recruiter.jobs": { id: "recruiter.jobs", category: "recruiter", label: "Job Management", primaryPersona: "RECRUITER" },
  "recruiter.candidates": { id: "recruiter.candidates", category: "recruiter", label: "Candidate Import", primaryPersona: "RECRUITER" },
  "recruiter.ranking": { id: "recruiter.ranking", category: "recruiter", label: "Candidate Ranking", primaryPersona: "RECRUITER" },
  "recruiter.analytics": { id: "recruiter.analytics", category: "recruiter", label: "Candidate Analytics", primaryPersona: "RECRUITER" },
  "recruiter.shortlist": { id: "recruiter.shortlist", category: "recruiter", label: "Candidate Shortlisting", primaryPersona: "RECRUITER" },
  "recruiter.interview": { id: "recruiter.interview", category: "recruiter", label: "Interview Pipeline", primaryPersona: "RECRUITER" },
  "recruiter.export": { id: "recruiter.export", category: "recruiter", label: "Candidate Export", primaryPersona: "RECRUITER" },
  "recruiter.hiring_report": { id: "recruiter.hiring_report", category: "recruiter", label: "Hiring Decision Reports", primaryPersona: "RECRUITER" },
};

export function listFeaturesByCategory(category: FeatureCategory): FeatureDefinition[] {
  return FEATURE_IDS.map((id) => FEATURE_REGISTRY[id]).filter((feature) => feature.category === category);
}
