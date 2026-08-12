import { Resume } from "../resume/resume-schema";
import { OptimizedBullet, ImprovementSuggestion } from "../job-description/jd-schema";
import { RewriteSection } from "../resume-rewriter/rewrite-schema";
import { DynamicResumeDocument } from "./dynamic/dynamic-resume-schema";
import { TemplateSettings } from "./templates/template-schema";

// Non-schema row/wrapper types — mirrors every prior milestone's
// *-types.ts role relative to its own *-schema.ts (see
// src/lib/saas/organization-types.ts, src/lib/billing/billing-types.ts).

/** The JD-driven optimization snapshot captured into a version — same shape jd-service.ts's JdMatchResult already produces for these fields, reused directly rather than redefined. */
export interface OptimizedSectionsSnapshot {
  optimizedSummary: string;
  optimizedExperience: OptimizedBullet[];
  optimizedProjects: OptimizedBullet[];
  optimizedSkills: string[];
  improvementSuggestions: ImprovementSuggestion[];
}

/** A snapshot of resume-rewriter.ts's accepted section content (SectionState.current, flattened) — saved into a version explicitly by the user, one entry per section they chose to save. */
export type RewrittenSectionsSnapshot = Partial<Record<RewriteSection, string[]>>;

/** Raw `resume_versions` row shape, snake_case — exactly as stored/read via supabaseAdmin. */
export interface ResumeVersionRow {
  id: string;
  user_id: string;
  version_name: string;
  version_number: number;
  is_master: boolean;
  is_archived: boolean;
  source_version_id: string | null;
  target_job_title: string | null;
  target_company: string | null;
  target_location: string | null;
  job_description_text: string | null;
  resume_data: Resume;
  ats_score: number | null;
  jd_match_score: number | null;
  matched_skills: string[];
  missing_skills: string[];
  optimized_sections: OptimizedSectionsSnapshot | null;
  rewritten_sections: RewrittenSectionsSnapshot | null;
  /** Null until the dynamic Resume Builder (or an AI-driven merge) first saves this version — see dynamic/resume-migration.ts's toDynamicResumeDocument() for the lazy, read-time fallback. */
  sections_data: DynamicResumeDocument | null;
  /** Null until the user opens the Template tab or changes a design control — see templates/template-schema.ts's DEFAULT_TEMPLATE_SETTINGS for the lazy, read-time fallback. Presentation only, never resume content. */
  template_settings: TemplateSettings | null;
  created_at: string;
  updated_at: string;
}

/** camelCase shape every service method / API route returns — the one place snake_case<->camelCase mapping happens. */
export interface ResumeVersionRecord {
  id: string;
  userId: string;
  versionName: string;
  versionNumber: number;
  isMaster: boolean;
  isArchived: boolean;
  sourceVersionId: string | null;
  targetJobTitle: string | null;
  targetCompany: string | null;
  targetLocation: string | null;
  jobDescriptionText: string | null;
  resumeData: Resume;
  atsScore: number | null;
  jdMatchScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  optimizedSections: OptimizedSectionsSnapshot | null;
  rewrittenSections: RewrittenSectionsSnapshot | null;
  sectionsData: DynamicResumeDocument | null;
  templateSettings: TemplateSettings | null;
  createdAt: string;
  updatedAt: string;
}

/** The lighter shape the versions dashboard list needs — omits resume_data/optimized_sections/rewritten_sections/sections_data/template_settings (large JSON payloads a list view never renders). */
export type ResumeVersionSummary = Omit<ResumeVersionRecord, "resumeData" | "optimizedSections" | "rewrittenSections" | "sectionsData" | "templateSettings">;

export interface CreateVersionInput {
  /** An ephemeral, freshly-uploaded resume's id (resumeService.get()) — used only when the user has no master yet, or explicitly wants to source a new version from a brand-new upload rather than an existing version. */
  resumeId?: string;
  /** An existing persisted version to clone from — defaults to the user's current master when neither this nor resumeId is given. */
  sourceVersionId?: string;
  versionName?: string;
  targetJobTitle?: string;
  targetCompany?: string;
  targetLocation?: string;
  /** Pasted job description text — when present, runs the existing (unmodified) JD-matching/optimization pipeline and stores the result on the new version. */
  jobDescriptionText?: string;
}

export interface VersionComparisonSide {
  id: string;
  versionName: string;
  atsScore: number | null;
  jdMatchScore: number | null;
  summary: string | null;
  matchedSkills: string[];
  missingSkills: string[];
}

export interface VersionComparison {
  versionA: VersionComparisonSide;
  versionB: VersionComparisonSide;
  atsScoreDelta: number | null;
  jdMatchScoreDelta: number | null;
  skillsAdded: string[];
  skillsRemoved: string[];
  experienceChanged: boolean;
  projectsChanged: boolean;
  summaryChanged: boolean;
}
