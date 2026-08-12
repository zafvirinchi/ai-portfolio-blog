import { supabaseAdmin } from "../../supabase/admin";
import { Resume } from "../resume/resume-schema";
import { resumeService } from "../resume/resume-service";
import { resumeScorer } from "../resume/resume-score";
import { computeJdMatchForResume } from "../job-description/jd-service";

import {
  CreateVersionInput,
  ResumeVersionRecord,
  ResumeVersionRow,
  ResumeVersionSummary,
  VersionComparison,
} from "./resume-version-types";
import {
  DynamicResumeDocument,
  FieldValue,
  ProposalApplyResult,
  ResumeChangeProposal,
  SectionType,
  addCustomField as addCustomFieldToDocument,
  addEntry as addEntryToDocument,
  addSection as addSectionToDocument,
  applyChangeProposals,
  dynamicResumeDocumentSchema,
  duplicateEntry as duplicateEntryInDocument,
  fromDynamicResumeDocument,
  mergeOptimizedSectionsIntoDocument,
  mergeRewrittenSectionsIntoDocument,
  moveSectionDown as moveSectionDownInDocument,
  moveSectionUp as moveSectionUpInDocument,
  removeCustomField as removeCustomFieldFromDocument,
  removeEntry as removeEntryFromDocument,
  removeSection as removeSectionFromDocument,
  reorderEntries as reorderEntriesInDocument,
  reorderSections as reorderSectionsInDocument,
  toDynamicResumeDocument,
  updateCustomField as updateCustomFieldInDocument,
  updateEntry as updateEntryInDocument,
  updatePersonalInformation as updatePersonalInformationInDocument,
  updateSection as updateSectionInDocument,
} from "./dynamic";
import { DEFAULT_TEMPLATE_SETTINGS, TemplateSettings, UpdateTemplateSettingsInput, templateSettingsSchema } from "./templates/template-schema";

const LOG_PREFIX = "[resume-version]";
const TABLE = "resume_versions";

export class ResumeVersionNotFoundError extends Error {
  constructor() {
    super("Resume version not found.");
    this.name = "ResumeVersionNotFoundError";
  }
}

/** Thrown whenever an AI-driven or destructive operation targets the active Master Resume — the immutability rule the whole milestone is built around. */
export class MasterResumeProtectedError extends Error {
  constructor(action: string) {
    super(`${action} cannot be applied directly to your Master Resume — create a version first.`);
    this.name = "MasterResumeProtectedError";
  }
}

// Supabase-js's client is untyped (no generated schema types exist in
// this project — every existing service, e.g. organization-service.ts/
// billing/*-service.ts, casts its own row shape the same way), so this
// `as ResumeVersionRow`/`[]` cast is this codebase's established
// convention for a FULL "*" select, not a shortcut around a real type
// mismatch — every column on the type is actually selected below.
function toRecord(row: ResumeVersionRow): ResumeVersionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    versionName: row.version_name,
    versionNumber: row.version_number,
    isMaster: row.is_master,
    isArchived: row.is_archived,
    sourceVersionId: row.source_version_id,
    targetJobTitle: row.target_job_title,
    targetCompany: row.target_company,
    targetLocation: row.target_location,
    jobDescriptionText: row.job_description_text,
    resumeData: row.resume_data,
    atsScore: row.ats_score,
    jdMatchScore: row.jd_match_score,
    matchedSkills: row.matched_skills ?? [],
    missingSkills: row.missing_skills ?? [],
    optimizedSections: row.optimized_sections,
    rewrittenSections: row.rewritten_sections,
    sectionsData: row.sections_data,
    templateSettings: row.template_settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(record: ResumeVersionRecord): ResumeVersionSummary {
  return {
    id: record.id,
    userId: record.userId,
    versionName: record.versionName,
    versionNumber: record.versionNumber,
    isMaster: record.isMaster,
    isArchived: record.isArchived,
    sourceVersionId: record.sourceVersionId,
    targetJobTitle: record.targetJobTitle,
    targetCompany: record.targetCompany,
    targetLocation: record.targetLocation,
    jobDescriptionText: record.jobDescriptionText,
    atsScore: record.atsScore,
    jdMatchScore: record.jdMatchScore,
    matchedSkills: record.matchedSkills,
    missingSkills: record.missingSkills,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ResumeVersionService {
  /** Every existing row for this user, master first then newest — archived (soft-deleted) versions excluded. Zero AI calls. */
  async listVersions(userId: string): Promise<ResumeVersionSummary[]> {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("is_master", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return ((data ?? []) as ResumeVersionRow[]).map((row) => toSummary(toRecord(row)));
  }

  /** Throws ResumeVersionNotFoundError (never leaks whether a row exists for a different user) unless this exact row belongs to userId — the sole ownership check every other method in this service routes through. */
  async getVersion(userId: string, versionId: string): Promise<ResumeVersionRecord> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("id", versionId).eq("user_id", userId).maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new ResumeVersionNotFoundError();

    return toRecord(data as ResumeVersionRow);
  }

  private async getMaster(userId: string): Promise<ResumeVersionRecord | null> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("user_id", userId).eq("is_master", true).eq("is_archived", false).maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toRecord(data as ResumeVersionRow) : null;
  }

  private async nextVersionNumber(userId: string): Promise<number> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("version_number").eq("user_id", userId).order("version_number", { ascending: false }).limit(1).maybeSingle();

    if (error) throw new Error(error.message);
    return (data?.version_number ?? 0) + 1;
  }

  /**
   * Resolves what a new/duplicated version clones its resume_data from:
   * an explicit sourceVersionId (must be owned by userId), an ephemeral
   * freshly-uploaded resumeId (resumeService.get() — read-only, Phase
   * 12's parser is never re-run here), or — when neither is given —
   * the user's current master. Returns null only when none of the
   * three resolves (the caller's very first version, with no upload
   * and no master yet, is an error case the route validates).
   */
  private async resolveSourceResume(userId: string, input: Pick<CreateVersionInput, "resumeId" | "sourceVersionId">): Promise<{ resume: Resume; sourceVersionId: string | null }> {
    if (input.sourceVersionId) {
      const source = await this.getVersion(userId, input.sourceVersionId);
      return { resume: source.resumeData, sourceVersionId: source.id };
    }

    if (input.resumeId) {
      const ephemeral = resumeService.get(input.resumeId);
      if (!ephemeral) {
        throw new Error("Resume not found or expired — please re-upload your resume.");
      }
      return { resume: ephemeral.resume, sourceVersionId: null };
    }

    const master = await this.getMaster(userId);
    if (!master) {
      throw new Error("No master resume exists yet — upload a resume first.");
    }
    return { resume: master.resumeData, sourceVersionId: master.id };
  }

  /**
   * Creates a new version. Becomes the Master automatically only when
   * the user has no master yet at all (bootstraps it — e.g. the first
   * time a logged-in user saves an uploaded resume); every subsequent
   * call always creates a regular, non-master, tailored version,
   * cloned from (and never mutating) its source. When jobDescriptionText
   * is supplied, reuses jd-service.ts's existing, unmodified
   * computeJdMatchForResume() — no second JD-matching implementation.
   */
  async createVersion(userId: string, input: CreateVersionInput): Promise<ResumeVersionRecord> {
    const { resume, sourceVersionId } = await this.resolveSourceResume(userId, input);
    const existingMaster = await this.getMaster(userId);
    const isFirstVersionEver = !existingMaster && !input.sourceVersionId;

    let atsScore = resumeScorer.score(resume).overall;
    let jdMatchScore: number | null = null;
    let matchedSkills: string[] = [];
    let missingSkills: string[] = [];
    let optimizedSections: ResumeVersionRecord["optimizedSections"] = null;
    let jobDescriptionText: string | null = null;

    if (input.jobDescriptionText) {
      const { matchResult } = await computeJdMatchForResume(resume, { text: input.jobDescriptionText });

      // The JD-specific ATS engine's score (which improves once the
      // resume is genuinely a better fit for this JD) replaces the
      // general baseline for a job-targeted version — the general one
      // (computed above) is what a version with no JD keeps.
      atsScore = matchResult.atsScore;
      jdMatchScore = matchResult.overallMatch;
      matchedSkills = matchResult.matchedSkills;
      missingSkills = matchResult.missingSkills;
      optimizedSections = {
        optimizedSummary: matchResult.optimizedSummary,
        optimizedExperience: matchResult.optimizedExperience,
        optimizedProjects: matchResult.optimizedProjects,
        optimizedSkills: matchResult.optimizedSkills,
        improvementSuggestions: matchResult.improvementSuggestions,
      };
      jobDescriptionText = input.jobDescriptionText;
    }

    const versionNumber = await this.nextVersionNumber(userId);
    const versionName = input.versionName?.trim() || (isFirstVersionEver ? "Master Resume" : `Untitled Version ${versionNumber}`);

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        user_id: userId,
        version_name: versionName,
        version_number: versionNumber,
        is_master: isFirstVersionEver,
        is_archived: false,
        source_version_id: sourceVersionId,
        target_job_title: input.targetJobTitle?.trim() || null,
        target_company: input.targetCompany?.trim() || null,
        target_location: input.targetLocation?.trim() || null,
        job_description_text: jobDescriptionText,
        resume_data: resume,
        ats_score: atsScore,
        jd_match_score: jdMatchScore,
        matched_skills: matchedSkills,
        missing_skills: missingSkills,
        optimized_sections: optimizedSections,
        // A brand-new version (bootstrapped master or cloned from a
        // source) never has its own sections_data yet — the dynamic
        // Resume Builder computes it lazily from resume_data on first
        // read (see getDynamicDocument()) rather than duplicating that
        // computation here.
        sections_data: null,
        // Same lazy-default pattern as sections_data — getTemplateSettings()
        // falls back to DEFAULT_TEMPLATE_SETTINGS on read.
        template_settings: null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} Version created`, { userId, versionId: data.id, isMaster: isFirstVersionEver, hasJd: Boolean(jobDescriptionText) });

    return toRecord(data as ResumeVersionRow);
  }

  async renameVersion(userId: string, versionId: string, versionName: string): Promise<ResumeVersionRecord> {
    await this.getVersion(userId, versionId); // ownership check

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ version_name: versionName.trim(), updated_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} Version renamed`, { userId, versionId });

    return toRecord(data as ResumeVersionRow);
  }

  /** Explicit, non-AI metadata edit (target role/company/location) — never touches resume_data, so this is safe to allow on the master too. */
  async updateMetadata(
    userId: string,
    versionId: string,
    updates: { targetJobTitle?: string | null; targetCompany?: string | null; targetLocation?: string | null }
  ): Promise<ResumeVersionRecord> {
    await this.getVersion(userId, versionId);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.targetJobTitle !== undefined) patch.target_job_title = updates.targetJobTitle?.trim() || null;
    if (updates.targetCompany !== undefined) patch.target_company = updates.targetCompany?.trim() || null;
    if (updates.targetLocation !== undefined) patch.target_location = updates.targetLocation?.trim() || null;

    const { data, error } = await supabaseAdmin.from(TABLE).update(patch).eq("id", versionId).eq("user_id", userId).select("*").single();

    if (error) throw new Error(error.message);

    return toRecord(data as ResumeVersionRow);
  }

  /** A full, independent copy with its own id — edits to the duplicate never touch the original. Never the master (a duplicate of the master is, by definition, a regular tailored version). */
  async duplicateVersion(userId: string, versionId: string, newName?: string): Promise<ResumeVersionRecord> {
    const source = await this.getVersion(userId, versionId);
    const versionNumber = await this.nextVersionNumber(userId);
    const versionName = newName?.trim() || `${source.versionName} — Copy`;

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        user_id: userId,
        version_name: versionName,
        version_number: versionNumber,
        is_master: false,
        is_archived: false,
        source_version_id: source.id,
        target_job_title: source.targetJobTitle,
        target_company: source.targetCompany,
        target_location: source.targetLocation,
        job_description_text: source.jobDescriptionText,
        resume_data: source.resumeData,
        ats_score: source.atsScore,
        jd_match_score: source.jdMatchScore,
        matched_skills: source.matchedSkills,
        missing_skills: source.missingSkills,
        optimized_sections: source.optimizedSections,
        rewritten_sections: source.rewrittenSections,
        // The dynamic document is cloned too — editing the duplicate's
        // sections/entries/fields must never touch the original's.
        sections_data: source.sectionsData,
        // Template settings (§26/§27) are part of the same "everything
        // about this version" clone — a duplicate keeps the exact same
        // template/theme choice as its source, never resetting to defaults.
        template_settings: source.templateSettings,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} Version duplicated`, { userId, sourceVersionId: source.id, newVersionId: data.id });

    return toRecord(data as ResumeVersionRow);
  }

  /** Soft delete (archive) — history is never physically destroyed. The active Master can never be deleted this way; demote it via restoreAsMaster(anotherVersion) first. */
  async deleteVersion(userId: string, versionId: string): Promise<void> {
    const version = await this.getVersion(userId, versionId);

    if (version.isMaster) {
      throw new MasterResumeProtectedError("Delete");
    }

    const { error } = await supabaseAdmin.from(TABLE).update({ is_archived: true, updated_at: new Date().toISOString() }).eq("id", versionId).eq("user_id", userId);

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} Version deleted`, { userId, versionId });
  }

  /**
   * Promotes `versionId` to Master. The previously-active master (if
   * any) is demoted (is_master=false) but never archived — it remains
   * a fully visible, ordinary version in history. Two separate
   * UPDATEs (demote-then-promote), not a single transaction — this
   * project's Supabase REST access has no multi-statement transaction
   * primitive (same constraint documented in interview-import's own
   * compensating-rollback design) — the resume_versions_one_master_per_user
   * partial unique index is what actually prevents two masters from
   * ever being readable at once, even if a request failed between
   * these two steps.
   */
  async restoreAsMaster(userId: string, versionId: string): Promise<ResumeVersionRecord> {
    const target = await this.getVersion(userId, versionId);
    if (target.isMaster) return target;

    const currentMaster = await this.getMaster(userId);

    if (currentMaster) {
      const { error: demoteError } = await supabaseAdmin.from(TABLE).update({ is_master: false, updated_at: new Date().toISOString() }).eq("id", currentMaster.id).eq("user_id", userId);
      if (demoteError) throw new Error(demoteError.message);
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ is_master: true, is_archived: false, updated_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} Version restored as master`, { userId, versionId, previousMasterId: currentMaster?.id ?? null });

    return toRecord(data as ResumeVersionRow);
  }

  /**
   * Applies the existing JD-matching/optimization pipeline to an
   * ALREADY-CREATED, non-master version, updating it in place — the
   * "Optimize for JD" version-detail action. Blocked on the master
   * (MasterResumeProtectedError) — an AI operation must never touch it.
   *
   * Phase 13 Milestone 19 audit: confirmed this method's own route
   * (`POST /api/ai/resume/versions/[id]/optimize`) has ZERO current UI
   * callers — VersionDetail.tsx exclusively uses JdOptimizationReview.tsx,
   * which calls the reviewed `/jd-optimize/propose` + `/jd-optimize/apply`
   * flow (applyOptimizationProposals() below) instead. Not removed in
   * that milestone because a route with no known frontend caller isn't
   * proof no external/direct caller exists — see that milestone's doc for
   * the recommended safe-removal path (add call-site telemetry first).
   * Also note this method additionally refreshes this row's legacy
   * `ats_score`/`jd_match_score`/`matched_skills`/`missing_skills`/
   * `job_description_text` columns, which applyOptimizationProposals()
   * does not — a real, documented behavioral difference between the two
   * paths that Milestone 19 deliberately left unchanged (fixing it would
   * be a scoring/persistence behavior change, out of that milestone's
   * scope).
   */
  async applyJdOptimization(userId: string, versionId: string, jobDescriptionText: string): Promise<ResumeVersionRecord> {
    const version = await this.getVersion(userId, versionId);
    if (version.isMaster) throw new MasterResumeProtectedError("JD optimization");

    const { matchResult } = await computeJdMatchForResume(version.resumeData, { text: jobDescriptionText });

    const optimizedSections = {
      optimizedSummary: matchResult.optimizedSummary,
      optimizedExperience: matchResult.optimizedExperience,
      optimizedProjects: matchResult.optimizedProjects,
      optimizedSkills: matchResult.optimizedSkills,
      improvementSuggestions: matchResult.improvementSuggestions,
    };

    // Controlled merge, never a blind overwrite: only runs when this
    // version already has a dynamic document (i.e. the user has
    // opened the Resume Builder for it), and only touches the
    // Summary/Experience/Projects/Skills sections' content — every
    // other section, custom section, and custom field the user added
    // is left exactly as-is. See dynamic/resume-migration.ts.
    const sectionsData = version.sectionsData ? mergeOptimizedSectionsIntoDocument(version.sectionsData, optimizedSections) : null;

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({
        job_description_text: jobDescriptionText,
        ats_score: matchResult.atsScore,
        jd_match_score: matchResult.overallMatch,
        matched_skills: matchResult.matchedSkills,
        missing_skills: matchResult.missingSkills,
        optimized_sections: optimizedSections,
        ...(sectionsData ? { sections_data: sectionsData } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", versionId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} JD optimization applied`, { userId, versionId });

    return toRecord(data as ResumeVersionRow);
  }

  /**
   * Phase 13 Milestone 15 — applies only the user-accepted (possibly
   * user-edited) change proposals from the JD-optimization review flow,
   * field by field, via the pure applyChangeProposals() transform. This
   * is the reviewed counterpart to applyJdOptimization() above (which
   * still exists, unmodified, applying the FULL optimizer output
   * immediately with no review step — kept for backward compatibility,
   * no longer the primary UI path). Blocked on the master, exactly like
   * every other AI-adjacent write in this service — the actual JD
   * parse/optimize call already happened in the /propose step; this is
   * a deterministic apply, not a new AI call.
   *
   * Phase 13 Milestone 19 — confirmed this is the ONLY apply path any
   * current UI reaches (VersionDetail.tsx -> JdOptimizationReview.tsx ->
   * /jd-optimize/apply -> here). This is the canonical, single-source-
   * of-truth apply engine for JD-optimization changes going forward.
   */
  /**
   * Phase 15 Milestone 9 — returns `results` (one honest outcome per
   * proposal: applied / skipped as not-applicable / skipped as stale)
   * alongside the saved version, so a caller can report exactly what
   * happened rather than a blanket "success" (§10/§11/§18/§19). A
   * batch where every proposal turns out stale still saves cleanly
   * (a document identical to before is a valid save, not an error) —
   * the caller decides how to present an all-stale result.
   */
  async applyOptimizationProposals(userId: string, versionId: string, proposals: ResumeChangeProposal[]): Promise<{ version: ResumeVersionRecord; results: ProposalApplyResult[] }> {
    const version = await this.getVersion(userId, versionId);
    if (version.isMaster) throw new MasterResumeProtectedError("Applying JD optimization changes");

    const document = await this.getDynamicDocument(userId, versionId);
    const { document: updated, results } = applyChangeProposals(document, proposals);

    const appliedCount = results.filter((result) => result.outcome === "applied").length;
    console.log(`${LOG_PREFIX} Optimization proposals applied`, { userId, versionId, requested: proposals.length, applied: appliedCount });

    const savedVersion = await this.saveDynamicDocument(userId, versionId, updated);
    return { version: savedVersion, results };
  }

  /**
   * Saves an already-completed resume-rewriter.ts session's accepted
   * section content into a version — a deterministic snapshot write,
   * not a new AI call (the rewrite itself already happened in that
   * existing, unmodified engine). Blocked on the master.
   */
  async saveRewrittenSections(userId: string, versionId: string, sections: ResumeVersionRecord["rewrittenSections"]): Promise<ResumeVersionRecord> {
    const version = await this.getVersion(userId, versionId);
    if (version.isMaster) throw new MasterResumeProtectedError("Saving a rewrite");

    // Same controlled-merge principle as applyJdOptimization() above —
    // only when a dynamic document already exists for this version,
    // and only the sections the rewrite session actually touched.
    const sectionsData = version.sectionsData && sections ? mergeRewrittenSectionsIntoDocument(version.sectionsData, sections) : null;

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ rewritten_sections: sections, ...(sectionsData ? { sections_data: sectionsData } : {}), updated_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return toRecord(data as ResumeVersionRow);
  }

  /** Deterministic diff — no LLM call. Every field compared is already stored on both rows. */
  async compareVersions(userId: string, versionAId: string, versionBId: string): Promise<VersionComparison> {
    const [versionA, versionB] = await Promise.all([this.getVersion(userId, versionAId), this.getVersion(userId, versionBId)]);

    const skillsA = new Set(versionA.matchedSkills);
    const skillsB = new Set(versionB.matchedSkills);

    return {
      versionA: {
        id: versionA.id,
        versionName: versionA.versionName,
        atsScore: versionA.atsScore,
        jdMatchScore: versionA.jdMatchScore,
        summary: versionA.optimizedSections?.optimizedSummary ?? versionA.resumeData.summary,
        matchedSkills: versionA.matchedSkills,
        missingSkills: versionA.missingSkills,
      },
      versionB: {
        id: versionB.id,
        versionName: versionB.versionName,
        atsScore: versionB.atsScore,
        jdMatchScore: versionB.jdMatchScore,
        summary: versionB.optimizedSections?.optimizedSummary ?? versionB.resumeData.summary,
        matchedSkills: versionB.matchedSkills,
        missingSkills: versionB.missingSkills,
      },
      atsScoreDelta: versionA.atsScore !== null && versionB.atsScore !== null ? versionB.atsScore - versionA.atsScore : null,
      jdMatchScoreDelta: versionA.jdMatchScore !== null && versionB.jdMatchScore !== null ? versionB.jdMatchScore - versionA.jdMatchScore : null,
      skillsAdded: [...skillsB].filter((skill) => !skillsA.has(skill)),
      skillsRemoved: [...skillsA].filter((skill) => !skillsB.has(skill)),
      experienceChanged: JSON.stringify(versionA.resumeData.workExperience) !== JSON.stringify(versionB.resumeData.workExperience) || JSON.stringify(versionA.optimizedSections?.optimizedExperience) !== JSON.stringify(versionB.optimizedSections?.optimizedExperience),
      projectsChanged: JSON.stringify(versionA.resumeData.projects) !== JSON.stringify(versionB.resumeData.projects) || JSON.stringify(versionA.optimizedSections?.optimizedProjects) !== JSON.stringify(versionB.optimizedSections?.optimizedProjects),
      summaryChanged: (versionA.optimizedSections?.optimizedSummary ?? versionA.resumeData.summary) !== (versionB.optimizedSections?.optimizedSummary ?? versionB.resumeData.summary),
    };
  }

  // ---------------------------------------------------------------------
  // Dynamic Resume Builder — sections/entries/fields/custom fields.
  // Every mutation here follows the same load -> pure-transform ->
  // validate -> persist shape: getDynamicDocument() resolves the
  // current document (lazily migrated from resume_data if this
  // version has never been edited in the builder), the imported pure
  // function from dynamic-resume-document-service.ts computes the new
  // document, dynamicResumeDocumentSchema re-validates it before it's
  // ever written, and saveDynamicDocument() persists it. No AI call in
  // any of these — the spec's own "version management is
  // deterministic" rule applies to every one of them. All are ALLOWED
  // on the master (explicit user edits, never an AI operation).
  // ---------------------------------------------------------------------

  /** Returns this version's dynamic document — its own saved sections_data if the builder has ever been used on it, otherwise a fresh, read-only migration computed from resume_data (not persisted until the first actual edit). */
  async getDynamicDocument(userId: string, versionId: string): Promise<DynamicResumeDocument> {
    const version = await this.getVersion(userId, versionId);
    return version.sectionsData ?? toDynamicResumeDocument(version.resumeData);
  }

  /**
   * The one place sections_data is ever written — validates against
   * dynamicResumeDocumentSchema first, so a malformed document (bad
   * section type, wrong shape) can never reach the database, rendering,
   * or export.
   *
   * Phase 15 Milestone 2 — also keeps resume_data (the legacy Resume
   * snapshot ATS scoring, JD matching, and the resume chat tool all
   * actually read) and ats_score in sync with every builder edit, via
   * fromDynamicResumeDocument() (pure) and resumeScorer.score() (the
   * existing deterministic, non-AI scorer already used by createVersion()
   * — no new LLM call is introduced by saving here, however often the
   * user edits). jd_match_score/matchedSkills/missingSkills/
   * optimizedSections are deliberately left untouched — refreshing
   * those requires the JD-optimizer's real LLM pipeline
   * (computeJdMatchForResume), which a manual field edit must never
   * silently trigger; re-running "Optimize for JD" remains how those
   * update, unchanged from before this milestone.
   */
  async saveDynamicDocument(userId: string, versionId: string, document: DynamicResumeDocument): Promise<ResumeVersionRecord> {
    const version = await this.getVersion(userId, versionId); // ownership check
    const validated = dynamicResumeDocumentSchema.parse(document);
    const resumeData = fromDynamicResumeDocument(validated, version.resumeData);
    const atsScore = resumeScorer.score(resumeData).overall;

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ sections_data: validated, resume_data: resumeData, ats_score: atsScore, updated_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return toRecord(data as ResumeVersionRow);
  }

  async updatePersonalInformation(userId: string, versionId: string, updates: Partial<DynamicResumeDocument["personalInformation"]>): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = updatePersonalInformationInDocument(document, updates);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async addSection(userId: string, versionId: string, type: SectionType, title?: string): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = addSectionToDocument(document, type, title);
    console.log(`${LOG_PREFIX} Section added`, { userId, versionId, type });
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async updateSection(
    userId: string,
    versionId: string,
    sectionId: string,
    updates: { title?: string; visible?: boolean; settings?: { showTitle?: boolean; showDivider?: boolean } }
  ): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = updateSectionInDocument(document, sectionId, updates);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async removeSection(userId: string, versionId: string, sectionId: string): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = removeSectionFromDocument(document, sectionId);
    console.log(`${LOG_PREFIX} Section removed`, { userId, versionId, sectionId });
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async reorderSections(userId: string, versionId: string, orderedSectionIds: string[]): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = reorderSectionsInDocument(document, orderedSectionIds);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async moveSectionUp(userId: string, versionId: string, sectionId: string): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = moveSectionUpInDocument(document, sectionId);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async moveSectionDown(userId: string, versionId: string, sectionId: string): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = moveSectionDownInDocument(document, sectionId);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async addEntry(userId: string, versionId: string, sectionId: string, fields?: Record<string, FieldValue>): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = addEntryToDocument(document, sectionId, fields);
    console.log(`${LOG_PREFIX} Entry added`, { userId, versionId, sectionId });
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async updateEntry(
    userId: string,
    versionId: string,
    sectionId: string,
    entryId: string,
    updates: { fields?: Record<string, FieldValue>; visible?: boolean; hiddenFieldKeys?: string[] }
  ): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = updateEntryInDocument(document, sectionId, entryId, updates);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async removeEntry(userId: string, versionId: string, sectionId: string, entryId: string): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = removeEntryFromDocument(document, sectionId, entryId);
    console.log(`${LOG_PREFIX} Entry removed`, { userId, versionId, sectionId, entryId });
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async duplicateEntry(userId: string, versionId: string, sectionId: string, entryId: string): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = duplicateEntryInDocument(document, sectionId, entryId);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async reorderEntries(userId: string, versionId: string, sectionId: string, orderedEntryIds: string[]): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = reorderEntriesInDocument(document, sectionId, orderedEntryIds);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async addCustomField(userId: string, versionId: string, sectionId: string, entryId: string, label: string, value: string): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = addCustomFieldToDocument(document, sectionId, entryId, label, value);
    console.log(`${LOG_PREFIX} Custom field added`, { userId, versionId, sectionId, entryId });
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async updateCustomField(
    userId: string,
    versionId: string,
    sectionId: string,
    entryId: string,
    fieldId: string,
    updates: { label?: string; value?: string; visible?: boolean }
  ): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = updateCustomFieldInDocument(document, sectionId, entryId, fieldId, updates);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  async removeCustomField(userId: string, versionId: string, sectionId: string, entryId: string, fieldId: string): Promise<ResumeVersionRecord> {
    const document = await this.getDynamicDocument(userId, versionId);
    const updated = removeCustomFieldFromDocument(document, sectionId, entryId, fieldId);
    return this.saveDynamicDocument(userId, versionId, updated);
  }

  // ---------------------------------------------------------------------
  // Phase 13 — Milestone 14: Template Designer. Presentation-only
  // settings, completely independent of sections_data — switching
  // templates/accent/font/spacing/ATS-mode/page-length NEVER touches
  // the resume content, and re-running JD optimization or a rewrite
  // NEVER touches these settings, because each is its own column and
  // every .update() call here only ever lists the columns it actually
  // changes.
  // ---------------------------------------------------------------------

  /**
   * This version's template settings — its own saved value if ever set,
   * otherwise DEFAULT_TEMPLATE_SETTINGS (never persisted until the user
   * actually changes something, mirroring getDynamicDocument()'s
   * lazy-default pattern).
   *
   * Phase 15 Milestone 5 — re-parses the stored value through
   * templateSettingsSchema (every field has its own `.default(...)`)
   * rather than returning the raw stored JSONB as-is. Without this, a
   * row saved before this milestone added `margin`/`pageSize` would be
   * missing those two keys entirely, and every downstream lookup
   * (`resolveTemplateStyles()`'s PDF_MARGIN_PT[settings.margin], etc.)
   * would receive `undefined` and break — the exact "existing resumes
   * must continue working" regression this milestone's own schema
   * change would otherwise cause.
   */
  async getTemplateSettings(userId: string, versionId: string): Promise<TemplateSettings> {
    const version = await this.getVersion(userId, versionId);
    return version.templateSettings ? templateSettingsSchema.parse(version.templateSettings) : DEFAULT_TEMPLATE_SETTINGS;
  }

  /** Partial-merge PATCH semantics (like updateSection's settings patch) — only the fields the caller actually sent are changed; everything else keeps its current (or default) value. Validated through templateSettingsSchema before it's ever written, so a malformed value can never reach rendering/export. */
  async saveTemplateSettings(userId: string, versionId: string, updates: UpdateTemplateSettingsInput): Promise<ResumeVersionRecord> {
    const current = await this.getTemplateSettings(userId, versionId);
    const merged = templateSettingsSchema.parse({ ...current, ...updates });

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ template_settings: merged, updated_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} Template settings updated`, { userId, versionId });

    return toRecord(data as ResumeVersionRow);
  }
}

export const resumeVersionService = new ResumeVersionService();
