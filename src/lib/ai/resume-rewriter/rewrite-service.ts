import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { openai } from "../openai";
import { delimitedDataBlock } from "../prompt-security";
import { Resume } from "../resume/resume-schema";
import { resumeService } from "../resume/resume-service";
import { generateAchievementRewrite } from "./achievement-rewriter";
import { generateBulletVariants } from "./bullet-rewriter";
import { generateExperienceRewrite } from "./experience-rewriter";
import { appendVersion } from "./rewrite-history";
import { generateProjectRewrite } from "./project-rewriter";
import { generateSummaryVariants } from "./summary-rewriter";
import {
  ACHIEVEMENT_REWRITE_JSON_SCHEMA,
  ProjectItemRewrite,
  ProjectVariant,
  RewriteSection,
  RewriteStyle,
  TextItemRewrite,
  TextVariant,
  VariantVersion,
  WHOLE_RESUME_REWRITE_JSON_SCHEMA,
  WholeResumeRewriteLlmOutput,
  achievementRewriteLlmOutputSchema,
  wholeResumeRewriteLlmOutputSchema,
} from "./rewrite-schema";
import { generateSkillsRewrite } from "./skills-rewriter";
import { SAFETY_RULES_PROMPT, UNTRUSTED_DATA_PROMPT, validateRewrite } from "./rewrite-validator";
import {
  PendingSectionRewrite,
  RewriteRecord,
  RewriteSectionRequest,
  SectionActionRequest,
  SectionState,
  WholeResumeSnapshot,
  WholeResumeVersionEntry,
} from "./rewrite-types";

const LOG_PREFIX = "[resume-rewriter]";
const REWRITE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — same pattern every in-memory store in this arc uses
const REWRITE_MODEL = "gpt-4o-mini";
const REWRITE_TEMPERATURE = 0.2;

export const rewriteRequestContext = new AsyncLocalStorage<{ rewriteId: string }>();

interface StoredRewriteRecord {
  record: RewriteRecord;
  expiresAt: number;
}

function flattenOriginalSection(resume: Resume, section: RewriteSection): string[] {
  switch (section) {
    case "summary":
    case "careerObjective":
      return [resume.summary ?? ""];
    case "experience":
      return resume.workExperience.flatMap((job) => job.description);
    case "projects":
      return resume.projects.map((project) => project.description ?? project.name);
    case "skills":
      return [Array.from(new Set([...resume.skills, ...resume.technicalSkills])).join(", ")];
    case "achievements":
      return resume.achievements;
    case "certifications":
      return resume.certifications.map((cert) => (cert.issuer ? `${cert.name} (${cert.issuer})` : cert.name));
    case "bullet":
      return [];
  }
}

/**
 * Phase 13 Milestone 23 — extracted from RewriteService.rewriteCertifications()
 * so its message construction is testable in isolation (same reasoning
 * as every other *-rewriter.ts file's exported buildMessages()), and
 * hardened per the established prompt-injection convention: certification
 * lines (and optional targetContext) are untrusted, now wrapped in
 * delimitedDataBlock(). No model/temperature/schema/rule change — pure
 * extraction plus hardening.
 */
export function buildCertificationsMessages(lines: string[], style: RewriteStyle, targetContext: string | null, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You rewrite how resume certifications are framed, in the "${style}" style.

${UNTRUSTED_DATA_PROMPT}

${SAFETY_RULES_PROMPT}

CRITICAL: never change a certification's actual name or issuer — you may
only adjust surrounding phrasing/context (e.g. noting relevance to a
target role). If there's nothing meaningful to add, keep the line close
to as-is rather than inventing relevance.

There are EXACTLY ${lines.length} certifications listed below. Your
"items" array MUST contain EXACTLY ${lines.length} entries — one per
certification, in the same order, with "original" set to the exact
original line. Completeness matters more than variety here: give each
entry exactly 1 variant (version "A" only) — the user can request
additional A/B/C variants later for one specific certification they
care about.${
        targetContext ? `\n\nA TARGET CONTEXT block is included below — use it only as descriptive context for the audience/domain to target.` : ""
      }${correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""}`,
    },
    {
      role: "user" as const,
      content: [delimitedDataBlock("CERTIFICATIONS DATA", lines.map((line) => `- ${line}`).join("\n")), targetContext ? delimitedDataBlock("TARGET CONTEXT", targetContext) : null]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

/**
 * Phase 13 Milestone 23 — extracted from RewriteService.generateWholeResume()
 * for testability and hardened per the established prompt-injection
 * convention: the full résumé text (and optional targetContext) are
 * untrusted, now wrapped in delimitedDataBlock(). No model/temperature/
 * schema/rule change — pure extraction plus hardening.
 */
export function buildWholeResumeMessages(resume: Resume, style: RewriteStyle, targetContext: string | null, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You rewrite an entire resume — summary, work experience, projects, skills,
and achievements — in the "${style}" style, as one consistent pass.

${UNTRUSTED_DATA_PROMPT}

${SAFETY_RULES_PROMPT}

For "experience"/"achievements", return one entry per original bullet
with "original" and "rewritten". For "projects", return one entry per
project with problem/solution/technologies/businessValue/impact
(technologies must be a subset of that project's own real list). For
"skills", categorize the candidate's real skills only. Summarize what
you changed in "improvementNotes".${
        targetContext ? `\n\nA TARGET CONTEXT block is included below — use it only as descriptive context for the audience/domain to target.` : ""
      }${correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""}`,
    },
    {
      role: "user" as const,
      content: [
        delimitedDataBlock(
          "RESUME DATA",
          `Summary: ${resume.summary ?? "none"}\n\nExperience:\n${resume.workExperience
            .map((job) => `${job.title} at ${job.company}:\n${job.description.map((line) => `- ${line}`).join("\n")}`)
            .join("\n\n")}\n\nProjects:\n${resume.projects
            .map((project) => `${project.name}: ${project.description ?? "(no description)"} | Tech: ${project.technologies.join(", ")}`)
            .join("\n")}\n\nSkills: ${[...resume.skills, ...resume.technicalSkills].join(", ")}\n\nAchievements:\n${resume.achievements.map((item) => `- ${item}`).join("\n")}`
        ),
        targetContext ? delimitedDataBlock("TARGET CONTEXT", targetContext) : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function projectVariantText(variant: ProjectVariant): string {
  return `Problem: ${variant.problem} Solution: ${variant.solution} Technologies: ${variant.technologies.join(", ")} Business Value: ${variant.businessValue} Impact: ${variant.impact}`;
}

function pickVariant(variants: TextVariant[], version?: VariantVersion): TextVariant | undefined {
  return variants.find((variant) => variant.version === (version ?? "A")) ?? variants[0];
}

export class RewriteService {
  private readonly records = new Map<string, StoredRewriteRecord>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }

  private save(record: RewriteRecord): void {
    this.records.set(record.rewriteId, { record, expiresAt: Date.now() + REWRITE_TTL_MS });
  }

  private mustGet(rewriteId: string): RewriteRecord {
    this.purgeExpired();
    const stored = this.records.get(rewriteId);

    if (!stored) {
      throw new Error("Resume rewrite session not found or expired.");
    }

    return stored.record;
  }

  private getResume(record: RewriteRecord): Resume {
    const resumeRecord = resumeService.get(record.resumeId);

    if (!resumeRecord) {
      throw new Error("Resume not found or expired — please re-upload your resume.");
    }

    return resumeRecord.resume;
  }

  private getOrInitSection(record: RewriteRecord, section: RewriteSection, resume: Resume): SectionState {
    const existing = record.sections[section];
    if (existing) return existing;

    const original = flattenOriginalSection(resume, section);
    const state: SectionState = {
      section,
      current: original,
      versions: [{ value: original, label: "Original", createdAt: new Date().toISOString() }],
      pending: null,
    };

    record.sections[section] = state;
    return state;
  }

  start(resumeId: string): RewriteRecord {
    console.log(`${LOG_PREFIX} Rewrite Started`, { resumeId });

    const createdAt = new Date().toISOString();
    const record: RewriteRecord = {
      rewriteId: randomUUID(),
      resumeId,
      sections: {},
      wholeResumeVersions: [],
      createdAt,
      updatedAt: createdAt,
    };

    this.purgeExpired();
    this.save(record);

    return record;
  }

  get(rewriteId: string): RewriteRecord | undefined {
    this.purgeExpired();
    return this.records.get(rewriteId)?.record;
  }

  // ---------------------------------------------------------------------
  // Certifications — kept inline here (not a dedicated rewriter file)
  // since it reuses the exact same "items -> variants" shape as
  // achievement-rewriter.ts, just with an extra hard constraint: a
  // certification's own name/issuer must never be altered, only the
  // surrounding framing.
  // ---------------------------------------------------------------------

  private async rewriteCertifications(
    resume: Resume,
    style: RewriteStyle,
    targetContext: string | null,
    correction?: string
  ): Promise<TextItemRewrite[]> {
    const lines = flattenOriginalSection(resume, "certifications");

    const completion = await openai.chat.completions.create({
      model: REWRITE_MODEL,
      temperature: REWRITE_TEMPERATURE,
      messages: buildCertificationsMessages(lines, style, targetContext, correction),
      response_format: { type: "json_schema", json_schema: ACHIEVEMENT_REWRITE_JSON_SCHEMA },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Resume rewrite (certifications) LLM returned no content");

    const parsed = achievementRewriteLlmOutputSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`Resume rewrite (certifications) output failed schema validation: ${parsed.error.message}`);

    return parsed.data.items;
  }

  // ---------------------------------------------------------------------
  // Section rewrite — the main entry point the API routes call.
  // ---------------------------------------------------------------------

  async rewriteSection(rewriteId: string, request: RewriteSectionRequest & { itemIndex?: number }): Promise<PendingSectionRewrite> {
    const record = this.mustGet(rewriteId);
    const resume = this.getResume(record);
    const { section, style, itemIndex } = request;
    const targetContext = request.targetContext?.trim() || null;

    const sectionState = this.getOrInitSection(record, section, resume);

    const pending: PendingSectionRewrite = {
      section,
      style,
      targetContext,
      rejectedItems: [],
      createdAt: new Date().toISOString(),
    };

    if (section === "summary" || section === "careerObjective") {
      pending.variants = await this.generateAndValidateVariants(
        resume,
        sectionState.current[0] ?? "",
        (correction) => generateSummaryVariants(resume, style, targetContext, section === "careerObjective", correction),
        section,
        pending.rejectedItems
      );
    } else if (section === "skills") {
      pending.skillCategories = await generateSkillsRewrite(resume);
    } else if (typeof itemIndex === "number") {
      // Single-item mode ("Individual Bullet Points" / "Generate Again"
      // on one item) — backed by bullet-rewriter.ts regardless of which
      // section the item belongs to.
      const originalText = sectionState.current[itemIndex];
      if (originalText === undefined) throw new Error(`No item at index ${itemIndex} in section "${section}".`);

      const newVariants = await this.generateAndValidateVariants(
        resume,
        originalText,
        (correction) => generateBulletVariants(resume, originalText, style, targetContext, correction),
        section,
        pending.rejectedItems
      );

      // If a bulk rewrite (experience/achievements/certifications) is
      // already pending for this section, splice the regenerated item
      // back into it rather than replacing the whole section's pending
      // state — otherwise a single-item "Generate Again" would silently
      // discard every other item's not-yet-accepted variants.
      const existingItems = sectionState.pending?.items;

      if (existingItems && existingItems[itemIndex]) {
        const mergedItems = existingItems.map((item, index) =>
          index === itemIndex ? { original: item.original, variants: newVariants } : item
        );
        const mergedPending: PendingSectionRewrite = {
          ...sectionState.pending!,
          items: mergedItems,
          rejectedItems: [...sectionState.pending!.rejectedItems.filter((r) => r.originalText !== originalText), ...pending.rejectedItems],
        };

        console.log(`${LOG_PREFIX} Section Rewritten`, { rewriteId, section, itemIndex });

        sectionState.pending = mergedPending;
        record.updatedAt = new Date().toISOString();
        this.save(record);

        return mergedPending;
      }

      pending.itemIndex = itemIndex;
      pending.variants = newVariants;
    } else if (section === "certifications") {
      pending.items = await this.generateAndValidateItems(
        resume,
        (correction) => this.rewriteCertifications(resume, style, targetContext, correction),
        section,
        pending.rejectedItems
      );
    } else if (section === "experience") {
      pending.items = await this.generateAndValidateItems(
        resume,
        (correction) => generateExperienceRewrite(resume, style, targetContext, correction),
        section,
        pending.rejectedItems
      );
    } else if (section === "achievements") {
      pending.items = await this.generateAndValidateItems(
        resume,
        (correction) => generateAchievementRewrite(resume, style, targetContext, correction),
        section,
        pending.rejectedItems
      );
    } else if (section === "projects") {
      pending.projectItems = await this.generateAndValidateProjectItems(
        resume,
        (correction) => generateProjectRewrite(resume, style, targetContext, correction),
        pending.rejectedItems
      );
    }

    console.log(`${LOG_PREFIX} Section Rewritten`, { rewriteId, section, itemIndex });

    sectionState.pending = pending;
    record.updatedAt = new Date().toISOString();
    this.save(record);

    return pending;
  }

  /** Shared retry-once-then-fallback flow for variant lists (summary/careerObjective/single-bullet). */
  private async generateAndValidateVariants(
    resume: Resume,
    originalText: string,
    generate: (correction?: string) => Promise<TextVariant[]>,
    section: RewriteSection,
    rejectedItems: PendingSectionRewrite["rejectedItems"]
  ): Promise<TextVariant[]> {
    let variants = await generate();
    let invalid = variants.filter((variant) => !validateRewrite(originalText, variant.text, resume).valid);

    if (invalid.length > 0) {
      const violations = invalid.flatMap((variant) => validateRewrite(originalText, variant.text, resume).violations);
      variants = await generate(violations.join("; "));
      invalid = variants.filter((variant) => !validateRewrite(originalText, variant.text, resume).valid);
    }

    const valid = variants.filter((variant) => !invalid.includes(variant));

    for (const variant of invalid) {
      rejectedItems.push({
        section,
        originalText,
        reason: validateRewrite(originalText, variant.text, resume).violations.join("; "),
      });
    }

    console.log(`${LOG_PREFIX} Validation Passed`, { section, kept: valid.length, rejected: invalid.length });

    if (valid.length > 0) return valid;

    // Every variant failed validation even after a retry — never surface
    // a hallucinated rewrite; fall back to the original text unchanged.
    return [
      {
        version: "A",
        text: originalText,
        explanation: {
          whyBetter: "Kept the original text — the rewrite couldn't be verified as fabrication-free.",
          atsImprovements: [],
          keywordsAdded: [],
          readabilityImprovement: "none",
          toneImprovement: "none",
        },
      },
    ];
  }

  private async generateAndValidateItems(
    resume: Resume,
    generate: (correction?: string) => Promise<TextItemRewrite[]>,
    section: RewriteSection,
    rejectedItems: PendingSectionRewrite["rejectedItems"]
  ): Promise<TextItemRewrite[]> {
    let items = await generate();
    const violationsByItem = new Map<number, string[]>();

    items.forEach((item, index) => {
      const badVariants = item.variants.filter((variant) => !validateRewrite(item.original, variant.text, resume).valid);
      if (badVariants.length > 0) {
        violationsByItem.set(
          index,
          badVariants.flatMap((variant) => validateRewrite(item.original, variant.text, resume).violations)
        );
      }
    });

    if (violationsByItem.size > 0) {
      const correction = Array.from(violationsByItem.values()).flat().join("; ");
      items = await generate(correction);
    }

    console.log(`${LOG_PREFIX} Validation Passed`, { section, items: items.length });

    return items.map((item) => {
      const validVariants = item.variants.filter((variant) => validateRewrite(item.original, variant.text, resume).valid);

      if (validVariants.length === 0 && item.variants.length > 0) {
        rejectedItems.push({
          section,
          originalText: item.original,
          reason: validateRewrite(item.original, item.variants[0].text, resume).violations.join("; "),
        });

        return { original: item.original, variants: [] };
      }

      return { original: item.original, variants: validVariants };
    });
  }

  private async generateAndValidateProjectItems(
    resume: Resume,
    generate: (correction?: string) => Promise<ProjectItemRewrite[]>,
    rejectedItems: PendingSectionRewrite["rejectedItems"]
  ): Promise<ProjectItemRewrite[]> {
    let items = await generate();

    const hasViolations = () =>
      items.some((item) => item.variants.some((variant) => !validateRewrite(item.original, projectVariantText(variant), resume).valid));

    if (hasViolations()) {
      const violations = items
        .flatMap((item) => item.variants.map((variant) => ({ item, variant })))
        .flatMap(({ item, variant }) => validateRewrite(item.original, projectVariantText(variant), resume).violations);
      items = await generate(violations.join("; "));
    }

    console.log(`${LOG_PREFIX} Validation Passed`, { section: "projects", items: items.length });

    return items.map((item) => {
      const validVariants = item.variants.filter((variant) => validateRewrite(item.original, projectVariantText(variant), resume).valid);

      if (validVariants.length === 0 && item.variants.length > 0) {
        rejectedItems.push({
          section: "projects",
          originalText: item.original,
          reason: validateRewrite(item.original, projectVariantText(item.variants[0]), resume).violations.join("; "),
        });

        return { ...item, variants: [] };
      }

      return { ...item, variants: validVariants };
    });
  }

  // ---------------------------------------------------------------------
  // Accept / Reject / Restore
  // ---------------------------------------------------------------------

  sectionAction(rewriteId: string, section: RewriteSection, request: SectionActionRequest): SectionState {
    const record = this.mustGet(rewriteId);
    const resume = this.getResume(record);
    const sectionState = this.getOrInitSection(record, section, resume);

    if (request.action === "reject") {
      sectionState.pending = null;
    } else if (request.action === "restore") {
      const versionIndex = request.versionIndex ?? 0;
      const target = sectionState.versions[versionIndex];
      if (!target) throw new Error(`No version at index ${versionIndex} for section "${section}".`);
      sectionState.current = target.value;
      sectionState.versions = appendVersion(sectionState.versions, target.value, `Restored to version ${versionIndex + 1}`);
      sectionState.pending = null;
    } else {
      this.acceptPending(sectionState, request);
    }

    record.updatedAt = new Date().toISOString();
    this.save(record);

    console.log(`${LOG_PREFIX} Rewrite Completed`, { rewriteId, section, action: request.action });

    return sectionState;
  }

  private acceptPending(sectionState: SectionState, request: SectionActionRequest): void {
    const pending = sectionState.pending;
    if (!pending) throw new Error(`No pending rewrite to accept for section "${sectionState.section}".`);

    if (pending.variants) {
      const chosen = pickVariant(pending.variants, request.variantVersion);
      if (!chosen) throw new Error("No variant available to accept.");

      if (typeof pending.itemIndex === "number") {
        // Single-item rewrite (bullet-rewriter.ts) — replace only that one line, not the whole section.
        const next = [...sectionState.current];
        next[pending.itemIndex] = chosen.text;
        sectionState.current = next;
      } else {
        // Whole-section single-text rewrite (summary/careerObjective).
        sectionState.current = [chosen.text];
      }
    } else if (pending.items) {
      const selections = new Map((request.itemSelections ?? []).map((sel) => [sel.itemIndex, sel.version]));
      const next = [...sectionState.current];

      pending.items.forEach((item, index) => {
        if (item.variants.length === 0) return;
        const chosen = pickVariant(item.variants, selections.get(index));
        const targetIndex = next.indexOf(item.original);
        next[targetIndex >= 0 ? targetIndex : index] = chosen?.text ?? item.original;
      });

      sectionState.current = next;
    } else if (pending.projectItems) {
      const selections = new Map((request.itemSelections ?? []).map((sel) => [sel.itemIndex, sel.version]));
      const next = [...sectionState.current];

      pending.projectItems.forEach((item, index) => {
        if (item.variants.length === 0) return;
        const chosen = item.variants.find((variant) => variant.version === selections.get(index)) ?? item.variants[0];
        const targetIndex = next.indexOf(item.original);
        next[targetIndex >= 0 ? targetIndex : index] = projectVariantText(chosen);
      });

      sectionState.current = next;
    } else if (pending.skillCategories) {
      sectionState.current = pending.skillCategories.map((group) => `${group.category}: ${group.skills.join(", ")}`);
    }

    sectionState.versions = appendVersion(sectionState.versions, sectionState.current, `${pending.style} rewrite`);
    sectionState.pending = null;
  }

  // ---------------------------------------------------------------------
  // Whole resume
  // ---------------------------------------------------------------------

  async rewriteWholeResume(rewriteId: string, style: RewriteStyle, targetContext?: string): Promise<WholeResumeVersionEntry> {
    const record = this.mustGet(rewriteId);
    const resume = this.getResume(record);
    const trimmedContext = targetContext?.trim() || null;

    const output = await this.generateWholeResume(resume, style, trimmedContext);

    const snapshot: WholeResumeSnapshot = {
      summary: [output.summary],
      experience: output.experience.map((item) => item.rewritten),
      projects: output.projects.map(
        (item) =>
          `Problem: ${item.problem} Solution: ${item.solution} Technologies: ${item.technologies.join(", ")} Business Value: ${item.businessValue} Impact: ${item.impact}`
      ),
      skills: output.skills.map((group) => `${group.category}: ${group.skills.join(", ")}`),
      achievements: output.achievements.map((item) => item.rewritten),
    };

    const entry: WholeResumeVersionEntry = {
      value: snapshot,
      style,
      targetContext: trimmedContext,
      improvementNotes: output.improvementNotes,
      createdAt: new Date().toISOString(),
    };

    record.wholeResumeVersions = [...record.wholeResumeVersions, entry];

    // Keep every section's own state in sync so a later per-section
    // Rewrite/Accept/Reject/Restore starts from the whole-resume result.
    (["summary", "experience", "projects", "skills", "achievements"] as const).forEach((section) => {
      const sectionState = this.getOrInitSection(record, section, resume);
      sectionState.current = snapshot[section];
      sectionState.versions = appendVersion(sectionState.versions, snapshot[section], `Whole-resume ${style} rewrite`);
      sectionState.pending = null;
    });

    record.updatedAt = new Date().toISOString();
    this.save(record);

    console.log(`${LOG_PREFIX} Rewrite Completed`, { rewriteId, wholeResume: true });

    return entry;
  }

  private async generateWholeResume(
    resume: Resume,
    style: RewriteStyle,
    targetContext: string | null,
    correction?: string
  ): Promise<WholeResumeRewriteLlmOutput> {
    const completion = await openai.chat.completions.create({
      model: REWRITE_MODEL,
      temperature: REWRITE_TEMPERATURE,
      messages: buildWholeResumeMessages(resume, style, targetContext, correction),
      response_format: { type: "json_schema", json_schema: WHOLE_RESUME_REWRITE_JSON_SCHEMA },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Resume rewrite (whole resume) LLM returned no content");

    const parsed = wholeResumeRewriteLlmOutputSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`Resume rewrite (whole resume) output failed schema validation: ${parsed.error.message}`);

    const violations = [
      ...validateRewrite(resume.summary ?? "", parsed.data.summary, resume).violations,
      ...parsed.data.experience.flatMap((item) => validateRewrite(item.original, item.rewritten, resume).violations),
      ...parsed.data.achievements.flatMap((item) => validateRewrite(item.original, item.rewritten, resume).violations),
      ...parsed.data.projects.flatMap(
        (item) =>
          validateRewrite(
            item.original,
            `Solution: ${item.solution} Technologies: ${item.technologies.join(", ")} Business Value: ${item.businessValue} Impact: ${item.impact}`,
            resume
          ).violations
      ),
    ];

    if (violations.length > 0 && !correction) {
      return this.generateWholeResume(resume, style, targetContext, violations.join("; "));
    }

    return parsed.data;
  }

  resetWholeResume(rewriteId: string): RewriteRecord {
    const record = this.mustGet(rewriteId);

    for (const section of Object.keys(record.sections) as RewriteSection[]) {
      const state = record.sections[section];
      if (!state) continue;
      state.current = state.versions[0].value;
      state.pending = null;
    }

    record.updatedAt = new Date().toISOString();
    this.save(record);

    return record;
  }
}

export const rewriteService = new RewriteService();
