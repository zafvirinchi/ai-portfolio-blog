import { jdParser } from "../job-description/jd-parser";
import { computeJdMatch } from "../job-description/jd-matcher";
import { jdMatchResultSchema, JdMatchResult, JobDescription } from "../job-description/jd-schema";
import { jdMatchService } from "../job-description/jd-service";
import { resumeService } from "../resume/resume-service";
import { resumeScorer } from "../resume/resume-score";
import { resumeSuggestionsEngine } from "../resume/resume-suggestions";
import { resumeVersionService } from "../resume-versions/resume-version-service";

// Phase 17 Milestone 2 — the ONLY new module this milestone adds. Not a
// second interview engine, question generator, JD parser, or Resume
// type — purely a SOURCE-OF-CONTEXT adapter: given an already-owned
// Dynamic Resume Version, it produces a real {resumeId, jdMatchId} pair
// that the existing, completely unmodified prepService.generate() (and,
// downstream, sessionService.start() for Mock Interview) already knows
// how to consume. See Step 5 of the milestone spec: "the new adapter
// should only change the SOURCE OF RESUME CONTEXT."

export class ResumeVersionMissingJdError extends Error {
  constructor() {
    super(
      "This resume version has no job description attached yet — attach one (via \"Optimize for JD\" in the Resume Builder) before starting Interview Preparation, or provide a job description here."
    );
    this.name = "ResumeVersionMissingJdError";
  }
}

export interface ResolvedInterviewPrepInput {
  resumeId: string;
  jdMatchId: string;
}

/**
 * Ownership-checked (via resumeVersionService.getVersion(), the SAME
 * mechanism every other resume-version route already uses — throws
 * ResumeVersionNotFoundError, mapped to a safe 404, for both "doesn't
 * exist" and "belongs to another user") resolution from a
 * resumeVersionId down to a working {resumeId, jdMatchId} pair.
 *
 * `version.resumeData` is always the CURRENT, already-synced legacy
 * Resume shape (the Dynamic Resume Builder keeps resume_data in sync
 * with every dynamic-section edit — see resume-version-service.ts's
 * saveDynamicDocument()) — never a stale snapshot from when the version
 * was first created.
 *
 * LLM calls: exactly one, unavoidable — jdParser.parse() — because
 * resume_versions persists the JD's raw text but never the parsed
 * JobDescription object. Everything else is either deterministic
 * (resumeScorer.score(), resumeSuggestionsEngine.analyzeSkillGap(),
 * computeJdMatch()) or reused verbatim from the version's own already-
 * persisted `optimizedSections` (the Dynamic Resume system's own prior
 * "Optimize for JD" output) rather than recomputed via
 * resumeOptimizer.optimize() again.
 */
export async function resolveInterviewPrepInputFromResumeVersion(
  userId: string,
  resumeVersionId: string,
  jobDescriptionTextOverride?: string
): Promise<ResolvedInterviewPrepInput> {
  const version = await resumeVersionService.getVersion(userId, resumeVersionId);

  const jobDescriptionText = jobDescriptionTextOverride?.trim() || version.jobDescriptionText;

  if (!jobDescriptionText) {
    throw new ResumeVersionMissingJdError();
  }

  const atsScore = resumeScorer.score(version.resumeData);
  const skillGap = resumeSuggestionsEngine.analyzeSkillGap(version.resumeData);
  const resumeRecord = resumeService.seedFromResumeVersion(version.resumeData, atsScore, skillGap);

  const jobDescription: JobDescription = await jdParser.parse({ text: jobDescriptionText });
  const computation = computeJdMatch(version.resumeData, jobDescription);

  // Reused verbatim when this version already has JD-optimized content
  // (true whenever job_description_text is set — see resume-version-
  // service.ts's createVersion()/applyJdOptimization(), which always set
  // both together). Only a brand-new jobDescriptionTextOverride that
  // differs from the version's own attached JD would leave this empty —
  // an honest "not available" rather than a stale/mismatched rewrite.
  const optimized = jobDescriptionTextOverride && jobDescriptionTextOverride.trim() !== version.jobDescriptionText
    ? { optimizedSummary: "", optimizedExperience: [], optimizedProjects: [], optimizedSkills: [], improvementSuggestions: [] }
    : version.optimizedSections ?? { optimizedSummary: "", optimizedExperience: [], optimizedProjects: [], optimizedSkills: [], improvementSuggestions: [] };

  const matchResult: JdMatchResult = jdMatchResultSchema.parse({
    overallMatch: computation.overallMatch,
    atsScore: computation.ats.overall,
    keywordScore: computation.ats.keyword,
    experienceScore: computation.ats.experience,
    educationScore: computation.ats.education,
    formattingScore: computation.ats.formatting,
    achievementScore: computation.ats.achievement,
    projectScore: computation.ats.project,
    leadershipScore: computation.ats.leadership,
    certificationScore: computation.ats.certification,
    aiScore: computation.ats.aiSkills,
    cloudScore: computation.ats.cloud,
    securityScore: computation.ats.security,
    softSkillsScore: computation.ats.softSkills,
    matchedSkills: computation.keywordMatch.matched,
    partialSkills: computation.keywordMatch.partial,
    missingSkills: computation.keywordMatch.missing,
    additionalSkills: computation.keywordMatch.additional,
    resumeStrengths: computation.strengths,
    resumeWeaknesses: computation.weaknesses,
    experienceMatch: computation.experienceMatch,
    educationMatch: computation.educationMatch,
    optimizedSummary: optimized.optimizedSummary,
    optimizedExperience: optimized.optimizedExperience,
    optimizedProjects: optimized.optimizedProjects,
    optimizedSkills: optimized.optimizedSkills,
    missingKeywordsSection: [],
    missingKeywords: computation.keywordMatch.missing,
    improvementSuggestions: optimized.improvementSuggestions,
  });

  const jdMatchRecord = jdMatchService.seedFromKnownMatch(resumeRecord.resumeId, jobDescription, matchResult);

  return { resumeId: resumeRecord.resumeId, jdMatchId: jdMatchRecord.jdMatchId };
}
