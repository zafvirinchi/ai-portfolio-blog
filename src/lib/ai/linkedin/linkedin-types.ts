import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { RewriteRecord } from "../resume-rewriter/rewrite-types";
import {
  AboutStyle,
  AboutVariant,
  BrandingBio,
  CareerInterests,
  ExperienceItem,
  FeaturedSuggestion,
  HeadlineStyle,
  HeadlineVariant,
  LinkedinSkillCategoryGroup,
  ProfileScore,
  ProjectDescription,
  RecommendationMessage,
  SeoReport,
} from "./linkedin-schema";

/** Shared resolved context every generator module receives — resume is required, everything else is layered in only when actually present. */
export interface LinkedinGenerationContext {
  resume: Resume;
  rewriteRecord?: RewriteRecord;
  jd?: JobDescription;
  targetRole: string;
  careerGoal: string | null;
  industry: string | null;
  yearsOfExperience: number | null;
}

export interface LinkedinGenerateInput {
  resumeId: string;
  /** Optional — Resume Rewrite Engine output (Milestone 5), read-only, layered in when present. */
  rewriteId?: string;
  /** Optional — JD-match ATS/keyword analysis (Milestone 1), read-only, layered in when present. */
  jdMatchId?: string;
  careerGoal?: string;
  /** Defaults from the JD match's jobTitle when a jdMatchId is supplied and this is omitted. */
  targetRole?: string;
  /** Defaults from the resume's own yearsOfExperience when omitted. */
  yearsOfExperience?: number;
  /** Defaults from the JD match's domain when a jdMatchId is supplied and this is omitted. */
  industry?: string;
  /** The ONLY legitimate input path for these sections — resume-schema.ts has no corresponding fields, so nothing here is ever AI-invented. */
  volunteerWork?: string[];
  publications?: string[];
  patents?: string[];
  licenses?: string[];
}

export interface LinkedinRecord {
  linkedinId: string;
  resumeId: string;
  rewriteId: string | null;
  jdMatchId: string | null;
  careerGoal: string | null;
  targetRole: string | null;
  yearsOfExperience: number | null;
  industry: string | null;

  headlines: Partial<Record<HeadlineStyle, HeadlineVariant>>;
  acceptedHeadlineStyle: HeadlineStyle | null;

  about: Partial<Record<AboutStyle, AboutVariant>>;
  acceptedAboutStyle: AboutStyle | null;

  experience: ExperienceItem[] | null;
  projects: ProjectDescription[] | null;
  skills: LinkedinSkillCategoryGroup[] | null;
  featured: FeaturedSuggestion | null;
  recommendations: RecommendationMessage[] | null;
  bannerTagline: string | null;
  brandingBios: BrandingBio[] | null;
  careerInterests: CareerInterests | null;
  seo: SeoReport | null;
  profileScore: ProfileScore | null;

  volunteerWork: string[];
  publications: string[];
  patents: string[];
  licenses: string[];

  createdAt: string;
  updatedAt: string;
}
