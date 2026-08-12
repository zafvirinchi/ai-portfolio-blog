import { randomUUID } from "node:crypto";
import { z } from "zod";

import { JobDescription, OptimizerOutput } from "../../job-description/jd-schema";
import { matchExperience } from "../../job-description/experience-engine";
import { scoreAts } from "../../job-description/ats-engine";
import { classifyCertificationRequirements, classifyEducationRequirements } from "../../job-description/keyword-engine";
import { Resume } from "../../resume/resume-schema";

import { DynamicResumeDocument, SECTION_TYPES } from "./dynamic-resume-schema";

// Phase 13 Milestone 15, §17/§20/§23/§24. The one real gap this
// milestone closes in the AI optimization flow: both existing optimizer
// UIs (job-description/optimizer.ts + resume-optimizer.ts) only ever
// display a read-only diff for download — neither offers per-change
// Accept/Reject/Edit, and resume-version-service.ts's applyJdOptimization()
// applies the optimizer's output to sections_data IMMEDIATELY with no
// review step at all. This file turns an already-computed OptimizerOutput
// into a list of individually reviewable ResumeChangeProposal objects
// (never a second AI call — same optimizer output, restructured) and a
// pure function that applies only the ones the user actually accepted,
// field by field, to an already-existing DynamicResumeDocument. Nothing
// here mutates document content that wasn't proposed; template settings,
// custom sections, custom fields, section order, and visibility are
// untouched by construction (only `entries[].fields` on the specific
// entry each accepted proposal names is ever changed).
//
// Deliberately scoped to exactly the 4 kinds of content
// job-description/optimizer.ts's OptimizerOutput actually produces
// (matching dynamic/resume-migration.ts's mergeOptimizedSectionsIntoDocument
// scope precisely) — never invents a proposal type the optimizer itself
// doesn't generate.

export const PROPOSAL_FIELD_KINDS = [
  "summary",
  "achievement",
  "projectDescription",
  "skillsReorganization",
  /**
   * Phase 13 Milestone 16 — a JD-required degree/certification not
   * reflected on the resume. Deliberately NEVER auto-applicable (see
   * `autoApplicable` below): there is no safe, non-fabricating field
   * edit for "the candidate doesn't have this" — the only honest action
   * is surfacing it for the candidate to confirm/add themselves in the
   * Resume Builder. `entryId` is always null (there is no entry to
   * point at); `sectionId` is the existing EDUCATION/CERTIFICATIONS
   * section's id when one exists, or null when the resume has neither
   * section at all — see buildEducationAndCertificationProposals().
   */
  "educationGap",
  "certificationGap",
] as const;
export type ProposalFieldKind = (typeof PROPOSAL_FIELD_KINDS)[number];

/**
 * A client sends proposals back at /apply time (the ones the user
 * accepted, possibly hand-edited) — this schema is the API boundary
 * validation for that request. It only constrains SHAPE (never trusts
 * sectionId/entryId to reference anything real); applyOneProposal()
 * itself is a safe no-op for any id that doesn't match the document,
 * and the final dynamicResumeDocumentSchema.parse() in
 * saveDynamicDocument() is what actually guarantees a malformed
 * document can never be persisted.
 */
export const resumeChangeProposalSchema = z.object({
  id: z.string(),
  /** Nullable since Milestone 16 — an educationGap/certificationGap proposal may have no existing EDUCATION/CERTIFICATIONS section to attach to at all. */
  sectionId: z.string().nullable(),
  sectionType: z.enum(SECTION_TYPES),
  entryId: z.string().nullable(),
  fieldKey: z.enum(PROPOSAL_FIELD_KINDS),
  originalValue: z.union([z.string(), z.array(z.string())]),
  proposedValue: z.union([z.string(), z.array(z.string())]),
  reason: z.string(),
  matchedRequirement: z.string().nullable(),
  confidence: z.enum(["high", "medium"]),
  /**
   * Phase 13 Milestone 16, §5 — whether the apply engine may ever write
   * this proposal's proposedValue into the document. false for
   * educationGap/certificationGap (informational, "confirm this
   * yourself" proposals — see PROPOSAL_FIELD_KINDS above); true for
   * every existing kind. applyOneProposal() enforces this itself
   * (never trusts a client to have already filtered these out), so a
   * malformed or malicious /apply request can never cause fabricated
   * data to be written.
   */
  autoApplicable: z.boolean(),
});

export type ResumeChangeProposal = z.infer<typeof resumeChangeProposalSchema>;

function findIntroducedRequirement(original: string, proposed: string, gapSkills: string[]): string | null {
  const originalLower = original.toLowerCase();
  const proposedLower = proposed.toLowerCase();

  return (
    gapSkills.find((skill) => {
      const normalized = skill.trim().toLowerCase();
      return normalized.length > 1 && proposedLower.includes(normalized) && !originalLower.includes(normalized);
    }) ?? null
  );
}

/**
 * Every JD skill worth checking rewritten text against for a verifiable
 * "this change addresses that gap" claim — missing skills (the clearest
 * win) plus partially-matched ones (Milestone 15's new PARTIAL tier —
 * strengthening a family-related skill into an exact keyword match is
 * still a genuine, checkable improvement).
 */
export function gapSkillsFor(missingSkills: string[], partialSkills: { jdSkill: string }[]): string[] {
  return [...missingSkills, ...partialSkills.map((p) => p.jdSkill)];
}

/**
 * Builds one reviewable proposal per genuinely-changed piece of content
 * the optimizer produced — skips anything where the "optimized" text is
 * identical to what's already in the document (nothing to review).
 */
export function buildChangeProposals(document: DynamicResumeDocument, optimized: OptimizerOutput, gapSkills: string[]): ResumeChangeProposal[] {
  const proposals: ResumeChangeProposal[] = [];

  for (const section of document.sections) {
    if (section.type === "SUMMARY" && optimized.optimizedSummary.trim()) {
      const entry = section.entries[0];
      const original = entry && typeof entry.fields.content === "string" ? entry.fields.content : "";
      const proposedValue = optimized.optimizedSummary.trim();

      if (entry && proposedValue !== original.trim()) {
        const matchedRequirement = findIntroducedRequirement(original, proposedValue, gapSkills);
        proposals.push({
          id: randomUUID(),
          sectionId: section.id,
          sectionType: section.type,
          entryId: entry.id,
          fieldKey: "summary",
          originalValue: original,
          proposedValue,
          reason: matchedRequirement
            ? `Introduces "${matchedRequirement}" from the job description into your summary.`
            : "Strengthens your professional summary's wording and alignment with this job description.",
          matchedRequirement,
          confidence: matchedRequirement ? "high" : "medium",
          autoApplicable: true,
        });
      }
    }

    if (section.type === "EXPERIENCE" && optimized.optimizedExperience.length > 0) {
      const rewritesByOriginal = new Map(optimized.optimizedExperience.map((pair) => [pair.original.trim(), pair.optimized]));

      for (const entry of section.entries) {
        const achievements = entry.fields.achievements;
        if (!Array.isArray(achievements)) continue;

        for (const line of achievements) {
          const rewritten = rewritesByOriginal.get(line.trim());
          if (!rewritten || rewritten.trim() === line.trim()) continue;

          const matchedRequirement = findIntroducedRequirement(line, rewritten, gapSkills);
          proposals.push({
            id: randomUUID(),
            sectionId: section.id,
            sectionType: section.type,
            entryId: entry.id,
            fieldKey: "achievement",
            originalValue: line,
            proposedValue: rewritten,
            reason: matchedRequirement
              ? `Introduces "${matchedRequirement}" from the job description and strengthens this achievement's framing.`
              : "Strengthens this achievement's wording and framing for this job description.",
            matchedRequirement,
            confidence: matchedRequirement ? "high" : "medium",
            autoApplicable: true,
          });
        }
      }
    }

    if (section.type === "PROJECTS" && optimized.optimizedProjects.length > 0) {
      const rewritesByOriginal = new Map(optimized.optimizedProjects.map((pair) => [pair.original.trim(), pair.optimized]));

      for (const entry of section.entries) {
        const description = entry.fields.description;
        if (typeof description !== "string" || !description.trim()) continue;

        const rewritten = rewritesByOriginal.get(description.trim());
        if (!rewritten || rewritten.trim() === description.trim()) continue;

        const matchedRequirement = findIntroducedRequirement(description, rewritten, gapSkills);
        proposals.push({
          id: randomUUID(),
          sectionId: section.id,
          sectionType: section.type,
          entryId: entry.id,
          fieldKey: "projectDescription",
          originalValue: description,
          proposedValue: rewritten,
          reason: matchedRequirement
            ? `Introduces "${matchedRequirement}" from the job description into this project's description.`
            : "Strengthens this project description's wording for this job description.",
          matchedRequirement,
          confidence: matchedRequirement ? "high" : "medium",
          autoApplicable: true,
        });
      }
    }

    if (section.type === "SKILLS" && optimized.optimizedSkills.length > 0) {
      const currentSkills = section.entries.flatMap((entry) => (Array.isArray(entry.fields.skills) ? entry.fields.skills : []));
      const proposedSkills = optimized.optimizedSkills;
      const identical = currentSkills.length === proposedSkills.length && currentSkills.every((skill, index) => skill === proposedSkills[index]);

      if (!identical) {
        proposals.push({
          id: randomUUID(),
          sectionId: section.id,
          sectionType: section.type,
          entryId: null,
          fieldKey: "skillsReorganization",
          originalValue: currentSkills,
          proposedValue: proposedSkills,
          reason: "Reorders and consolidates your existing skills to prioritize what this job description asks for. No skill absent from your resume is ever added.",
          matchedRequirement: null,
          confidence: "medium",
          autoApplicable: true,
        });
      }
    }
  }

  return proposals;
}

/**
 * Phase 13 Milestone 16, §2/§3 — extended in Milestone 17 to share its
 * matching decisions with the review UI's per-requirement breakdown
 * (see classifyEducationRequirements()/classifyCertificationRequirements()
 * in keyword-engine.ts, the single authoritative source both this
 * function and the /propose route's `educationMatches`/
 * `certificationMatches` response fields now read from — no separate
 * matching computation happens here anymore).
 *
 * Unlike buildChangeProposals() above, this generates proposals from
 * PURE DETERMINISTIC MATCHING — no new AI call. There is no LLM output
 * to draw a rewrite from here (the optimizer never rewrites Education/
 * Certifications), which is exactly why every proposal this function
 * produces has `autoApplicable: false` — there is no safe, truthful
 * field edit for "you don't have this degree/certification." The only
 * honest action is surfacing the gap for the candidate to confirm or
 * add themselves in the Resume Builder (never fabricated here).
 *
 * A requirement already satisfied (exactly, or via an equivalent-or-
 * higher degree, or an already-held identical certification) produces
 * NO proposal at all — nothing to review when nothing needs to change.
 */
export function buildEducationAndCertificationProposals(document: DynamicResumeDocument, resumeData: Resume, jobDescription: JobDescription): ResumeChangeProposal[] {
  const proposals: ResumeChangeProposal[] = [];

  const educationSection = document.sections.find((section) => section.type === "EDUCATION") ?? null;
  const resumeDegrees = resumeData.education.map((entry) => entry.degree);
  const degreeResults = classifyEducationRequirements(resumeDegrees, jobDescription.educationRequired);

  for (const result of degreeResults) {
    if (result.status !== "missing") continue;

    proposals.push({
      id: randomUUID(),
      sectionId: educationSection?.id ?? null,
      sectionType: "EDUCATION",
      entryId: null,
      fieldKey: "educationGap",
      originalValue: "",
      proposedValue: result.requirement,
      reason: `This job description asks for "${result.requirement}", which isn't reflected in your resume. If you hold this or an equivalent/higher qualification, add or confirm it in your Education section yourself — this is never added automatically.`,
      matchedRequirement: result.requirement,
      confidence: "medium",
      autoApplicable: false,
    });
  }

  const certificationsSection = document.sections.find((section) => section.type === "CERTIFICATIONS") ?? null;
  const resumeCertNames = resumeData.certifications.map((cert) => cert.name);
  const certResults = classifyCertificationRequirements(resumeCertNames, jobDescription.certifications);

  for (const result of certResults) {
    if (result.status !== "missing" && result.status !== "related") continue;

    // "related" still gets a gap proposal (§3 — an existing-but-different
    // certification never satisfies the requirement on its own), just
    // with a reason that names the genuinely-held related certification
    // instead of a generic "not found" message.
    const relatedCert = result.status === "related" ? result.resumeEvidence : null;

    proposals.push({
      id: randomUUID(),
      sectionId: certificationsSection?.id ?? null,
      sectionType: "CERTIFICATIONS",
      entryId: null,
      fieldKey: "certificationGap",
      originalValue: "",
      proposedValue: result.requirement,
      reason: relatedCert
        ? `This job description asks for "${result.requirement}". Your resume lists a related certification ("${relatedCert}") — you may want to highlight it, but "${relatedCert}" is never renamed and "${result.requirement}" is never added automatically.`
        : `This job description asks for "${result.requirement}", which isn't reflected in your resume. If you hold this certification, add or confirm it yourself — this is never added automatically.`,
      matchedRequirement: result.requirement,
      confidence: "medium",
      autoApplicable: false,
    });
  }

  return proposals;
}

/**
 * Phase 15 Milestone 9 (§10/§11/§18/§19) — before this milestone,
 * a stale proposal (the resume changed since it was generated, so its
 * `originalValue` can no longer be found) or an already-applied one
 * was silently skipped with NO way for the caller to know — a batch
 * apply could report "3 proposals applied" when only 1 genuinely
 * changed anything. Every apply path now gets an honest per-proposal
 * outcome instead.
 */
export type ProposalApplyOutcome = "applied" | "skipped_not_applicable" | "skipped_stale";

export interface ProposalApplyResult {
  proposalId: string;
  outcome: ProposalApplyOutcome;
}

function applyOneProposal(document: DynamicResumeDocument, proposal: ResumeChangeProposal): { document: DynamicResumeDocument; outcome: ProposalApplyOutcome } {
  // Phase 13 Milestone 16, §5 defense-in-depth: educationGap/
  // certificationGap (and any other non-auto-applicable kind) are
  // rejected here explicitly, regardless of what a client sends — this
  // function itself is the one place that decides whether a proposal
  // may ever change the document, not merely a UI convention the
  // caller is trusted to have already enforced. (For the CURRENT
  // proposal kinds this also happens to be a safe no-op incidentally —
  // gap proposals have entryId: null and often sectionId: null, which
  // never match a real entry/section below — but this guard makes the
  // guarantee explicit and independent of that incidental structure.)
  if (!proposal.autoApplicable) return { document, outcome: "skipped_not_applicable" };

  // Defaults to "stale" — flipped to "applied" only at the exact point
  // a write actually happens below. If no section/entry/text match is
  // found anywhere, it stays "stale": the resume changed (or this
  // proposal was already applied once) since the proposal was built.
  let outcome: ProposalApplyOutcome = "skipped_stale";

  const updated: DynamicResumeDocument = {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== proposal.sectionId) return section;

      if (proposal.fieldKey === "skillsReorganization") {
        outcome = "applied";
        return {
          ...section,
          entries: [{ id: randomUUID(), order: 0, visible: true, fields: { category: "Skills", skills: proposal.proposedValue as string[] }, hiddenFieldKeys: [], customFields: [] }],
        };
      }

      return {
        ...section,
        entries: section.entries.map((entry) => {
          if (entry.id !== proposal.entryId) return entry;

          if (proposal.fieldKey === "summary") {
            outcome = "applied";
            return { ...entry, fields: { ...entry.fields, content: proposal.proposedValue as string } };
          }

          if (proposal.fieldKey === "projectDescription") {
            outcome = "applied";
            return { ...entry, fields: { ...entry.fields, description: proposal.proposedValue as string } };
          }

          if (proposal.fieldKey === "achievement") {
            const achievements = entry.fields.achievements;
            if (!Array.isArray(achievements)) return entry; // stays "skipped_stale"

            const index = achievements.findIndex((line) => line.trim() === (proposal.originalValue as string).trim());
            if (index === -1) return entry; // already applied or no longer present — stays "skipped_stale", never throws

            const updatedAchievements = [...achievements];
            updatedAchievements[index] = proposal.proposedValue as string;
            outcome = "applied";
            return { ...entry, fields: { ...entry.fields, achievements: updatedAchievements } };
          }

          return entry;
        }),
      };
    }),
  };

  return { document: updated, outcome };
}

/**
 * Applies ONLY the given proposals (already filtered by the caller to
 * whatever the user accepted, possibly with a user-edited proposedValue)
 * to the document, field by field — never regenerates or replaces
 * anything else. Section order, visibility, custom sections, custom
 * fields, and every section/entry not named by an accepted proposal are
 * untouched. Pure and order-independent for distinct fields; proposals
 * targeting the same entry+field apply in the given order. Returns
 * `results` alongside the updated document — one honest outcome per
 * proposal, never a blanket "success" (§10/§11/§18/§19).
 */
export function applyChangeProposals(document: DynamicResumeDocument, proposals: ResumeChangeProposal[]): { document: DynamicResumeDocument; results: ProposalApplyResult[] } {
  let working = document;
  const results: ProposalApplyResult[] = [];

  for (const proposal of proposals) {
    const { document: next, outcome } = applyOneProposal(working, proposal);
    working = next;
    results.push({ proposalId: proposal.id, outcome });
  }

  return { document: working, results };
}

/**
 * §35 — "Projected ATS Score": re-runs the existing, unmodified
 * deterministic ATS engine against a hypothetical copy of the version's
 * legacy `resume_data` with the given proposals' text changes applied,
 * WITHOUT persisting anything. Always surfaced to the user labeled
 * "Projected" (never presented as a guaranteed score) — see
 * JdOptimizationReview.tsx. Matches proposals back to resume_data by the
 * same original-text lookup the merge functions already use; a proposal
 * whose original text can no longer be found in resume_data (e.g. the
 * user has since hand-edited that bullet in the Builder, so the dynamic
 * document and resume_data have diverged) simply has no effect on the
 * projection rather than throwing — a best-effort estimate, not a
 * guarantee, which is exactly what "Projected" means.
 */
export function projectAtsScoreAfterProposals(resumeData: Resume, jobDescription: JobDescription, proposals: ResumeChangeProposal[]): number {
  const projected: Resume = {
    ...resumeData,
    workExperience: resumeData.workExperience.map((job) => ({ ...job, description: [...job.description] })),
    projects: resumeData.projects.map((project) => ({ ...project })),
  };

  for (const proposal of proposals) {
    if (proposal.fieldKey === "summary") {
      projected.summary = proposal.proposedValue as string;
    }

    if (proposal.fieldKey === "achievement") {
      const original = (proposal.originalValue as string).trim();
      for (const job of projected.workExperience) {
        const index = job.description.findIndex((line) => line.trim() === original);
        if (index !== -1) {
          job.description[index] = proposal.proposedValue as string;
          break;
        }
      }
    }

    if (proposal.fieldKey === "projectDescription") {
      const original = (proposal.originalValue as string).trim();
      const project = projected.projects.find((item) => (item.description ?? "").trim() === original);
      if (project) project.description = proposal.proposedValue as string;
    }

    if (proposal.fieldKey === "skillsReorganization") {
      projected.skills = proposal.proposedValue as string[];
    }
  }

  const experienceMatch = matchExperience(projected, jobDescription);
  return scoreAts(projected, jobDescription, experienceMatch.score).overall;
}
