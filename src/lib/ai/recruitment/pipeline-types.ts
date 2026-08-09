import {
  ActingRole,
  CandidateStage,
  EmploymentType,
  EvaluationCriterion,
  HiringRecommendation,
  InterviewQuestion,
  InterviewStatus,
  InterviewType,
  JobStatus,
  NotificationType,
  OfferStatus,
  PipelineStage,
} from "./pipeline-schema";

// Non-schema wrapper types — mirrors every prior milestone's *-types.ts
// role relative to its own *-schema.ts.

export interface Job {
  jobId: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: EmploymentType;
  experienceRequired: string | null;
  salary: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  education: string[];
  noticePeriod: string | null;
  hiringManager: string | null;
  recruiter: string | null;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface JobCreateInput {
  title: string;
  department?: string | null;
  location?: string | null;
  employmentType?: EmploymentType;
  experienceRequired?: string | null;
  salary?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  education?: string[];
  noticePeriod?: string | null;
  hiringManager?: string | null;
  recruiter?: string | null;
}

export type JobUpdateInput = Partial<JobCreateInput>;

export interface StageHistoryEntry {
  stage: CandidateStage;
  enteredAt: string;
  actingRole: ActingRole | null;
}

// The thin, job-scoped overlay around an existing Milestone 8
// candidate (candidateId references candidateService, read-only —
// never copied). See plan design decision 1.
export interface PipelineCandidate {
  pipelineCandidateId: string;
  jobId: string;
  candidateId: string;
  stage: CandidateStage;
  stageHistory: StageHistoryEntry[];
  assignedRecruiter: string | null;
  hiringManager: string | null;
  jdMatchId: string | null;
  hiringRecommendation: HiringRecommendation | null;
  offerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewFeedback {
  rating: number;
  notes: string;
  summary: string | null;
  recommendation: string | null;
  actingRole: ActingRole | null;
  recordedAt: string;
}

export interface InterviewSchedule {
  interviewId: string;
  jobId: string;
  pipelineCandidateId: string;
  type: InterviewType;
  scheduledAt: string;
  interviewer: string | null;
  status: InterviewStatus;
  checklist: string[] | null;
  questions: InterviewQuestion[] | null;
  evaluationForm: EvaluationCriterion[] | null;
  feedback: InterviewFeedback | null;
  createdAt: string;
  updatedAt: string;
}

export interface Offer {
  offerId: string;
  jobId: string;
  pipelineCandidateId: string;
  salary: string | null;
  startDate: string | null;
  expiryDate: string | null;
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  notificationId: string;
  type: NotificationType;
  message: string;
  jobId: string | null;
  pipelineCandidateId: string | null;
  read: boolean;
  createdAt: string;
}

export interface PipelineAnalytics {
  jobId: string | null;
  applications: number;
  shortlisted: number;
  rejected: number;
  offers: number;
  hired: number;
  averageAts: number | null;
  averageJdMatch: number | null;
  averageTimeToHireDays: number | null;
  conversionRate: number | null;
  stageDistribution: { stage: CandidateStage; count: number }[];
  hiringFunnel: { stage: PipelineStage; count: number }[];
}

// AI Dashboard + AI Pipeline Insights detections — combined into one
// deterministic result shape (plan design decision 9).

export interface BottleneckInsight {
  stage: CandidateStage;
  candidateCount: number;
  note: string;
}

export interface StuckCandidateInsight {
  pipelineCandidateId: string;
  candidateName: string;
  stage: CandidateStage;
  daysInStage: number;
}

export interface MissingInterviewInsight {
  pipelineCandidateId: string;
  candidateName: string;
  stage: CandidateStage;
}

export interface DropOffInsight {
  stage: CandidateStage;
  count: number;
}

export interface SkillGapInsight {
  skill: string;
  missingCount: number;
}

export interface OfferAcceptanceTrend {
  sent: number;
  accepted: number;
  declined: number;
  acceptanceRate: number | null;
}

export interface TopCandidateInsight {
  pipelineCandidateId: string;
  candidateName: string;
  rankingScore: number;
}

export interface HighPotentialInsight {
  pipelineCandidateId: string;
  candidateName: string;
  reason: string;
}

export interface FastHiringInsight {
  pipelineCandidateId: string;
  candidateName: string;
  reason: string;
}

export interface DuplicateProfileInsight {
  candidateIds: string[];
  candidateNames: string[];
  reason: string;
}

export interface IncompleteProfileInsight {
  candidateId: string;
  candidateName: string;
  missingFields: string[];
}

export interface PipelineInsights {
  jobId: string | null;
  bottlenecks: BottleneckInsight[];
  stuckCandidates: StuckCandidateInsight[];
  missingInterviews: MissingInterviewInsight[];
  candidateDropOff: DropOffInsight[];
  skillGaps: SkillGapInsight[];
  offerAcceptanceTrend: OfferAcceptanceTrend;
  topCandidates: TopCandidateInsight[];
  highPotentialCandidates: HighPotentialInsight[];
  fastHiringOpportunities: FastHiringInsight[];
  duplicateProfiles: DuplicateProfileInsight[];
  incompleteProfiles: IncompleteProfileInsight[];
}
