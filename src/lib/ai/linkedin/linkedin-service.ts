import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { JdMatchResult } from "../job-description/jd-schema";
import { jdMatchService } from "../job-description/jd-service";
import { Resume } from "../resume/resume-schema";
import { resumeService } from "../resume/resume-service";
import { rewriteService } from "../resume-rewriter/rewrite-service";
import { RewriteRecord } from "../resume-rewriter/rewrite-types";
import { generateAbout } from "./about-generator";
import { generateBanner } from "./banner-generator";
import { generateExperience, generateProjects } from "./experience-generator";
import { computeFeaturedSuggestions } from "./featured-generator";
import { generateHeadline } from "./headline-generator";
import { generateRecommendationMessages } from "./recommendation-generator";
import { computeSeoReport } from "./seo-engine";
import { generateSkills } from "./skills-generator";
import { computeProfileScore } from "./profile-score";
import { validateLinkedinContent } from "./validator";
import {
  ABOUT_MAX_CHARACTERS,
  AboutStyle,
  AboutVariant,
  CareerInterests,
  ExperienceItem,
  HeadlineStyle,
} from "./linkedin-schema";
import { LinkedinGenerateInput, LinkedinGenerationContext, LinkedinRecord } from "./linkedin-types";

const LOG_PREFIX = "[linkedin]";
const LINKEDIN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — same pattern every in-memory store in this arc uses

export const linkedinRequestContext = new AsyncLocalStorage<{ linkedinId: string }>();

interface StoredLinkedinRecord {
  record: LinkedinRecord;
  expiresAt: number;
}

interface ResolvedContext {
  ctx: LinkedinGenerationContext;
  resume: Resume;
  rewriteRecord?: RewriteRecord;
  jdMatchResult?: JdMatchResult;
}

export class LinkedinService {
  private readonly records = new Map<string, StoredLinkedinRecord>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }

  private save(record: LinkedinRecord): void {
    this.records.set(record.linkedinId, { record, expiresAt: Date.now() + LINKEDIN_TTL_MS });
  }

  private mustGet(linkedinId: string): LinkedinRecord {
    this.purgeExpired();
    const stored = this.records.get(linkedinId);

    if (!stored) {
      throw new Error("LinkedIn optimizer session not found or expired.");
    }

    return stored.record;
  }

  private resolveContext(record: LinkedinRecord): ResolvedContext {
    const resumeRecord = resumeService.get(record.resumeId);

    if (!resumeRecord) {
      throw new Error("Resume not found or expired — please re-upload your resume.");
    }

    const rewriteRecord = record.rewriteId ? rewriteService.get(record.rewriteId) : undefined;
    const jdMatchRecord = record.jdMatchId ? jdMatchService.get(record.jdMatchId) : undefined;

    const ctx: LinkedinGenerationContext = {
      resume: resumeRecord.resume,
      rewriteRecord,
      jd: jdMatchRecord?.jobDescription,
      targetRole: record.targetRole ?? jdMatchRecord?.jobDescription.jobTitle ?? "this role",
      careerGoal: record.careerGoal,
      industry: record.industry,
      yearsOfExperience: record.yearsOfExperience,
    };

    return { ctx, resume: resumeRecord.resume, rewriteRecord, jdMatchResult: jdMatchRecord?.matchResult };
  }

  start(input: LinkedinGenerateInput): LinkedinRecord {
    console.log(`${LOG_PREFIX} Optimization Started`, { resumeId: input.resumeId });

    const resumeRecord = resumeService.get(input.resumeId);
    if (!resumeRecord) {
      throw new Error("Resume not found or expired — please re-upload your resume.");
    }

    const jdMatchRecord = input.jdMatchId ? jdMatchService.get(input.jdMatchId) : undefined;
    if (input.jdMatchId && !jdMatchRecord) {
      throw new Error("JD match result not found or expired — please re-run the match analysis.");
    }

    const rewriteRecord = input.rewriteId ? rewriteService.get(input.rewriteId) : undefined;
    if (input.rewriteId && !rewriteRecord) {
      throw new Error("Resume rewrite session not found or expired.");
    }

    const targetRole = input.targetRole?.trim() || jdMatchRecord?.jobDescription.jobTitle || null;
    const industry = input.industry?.trim() || jdMatchRecord?.jobDescription.domain || null;
    const yearsOfExperience = input.yearsOfExperience ?? resumeRecord.resume.yearsOfExperience ?? null;

    const createdAt = new Date().toISOString();
    const record: LinkedinRecord = {
      linkedinId: randomUUID(),
      resumeId: input.resumeId,
      rewriteId: input.rewriteId ?? null,
      jdMatchId: input.jdMatchId ?? null,
      careerGoal: input.careerGoal?.trim() || null,
      targetRole,
      yearsOfExperience,
      industry,
      headlines: {},
      acceptedHeadlineStyle: null,
      about: {},
      acceptedAboutStyle: null,
      experience: null,
      projects: null,
      skills: null,
      featured: null,
      recommendations: null,
      bannerTagline: null,
      brandingBios: null,
      careerInterests: null,
      seo: null,
      profileScore: null,
      volunteerWork: input.volunteerWork ?? [],
      publications: input.publications ?? [],
      patents: input.patents ?? [],
      licenses: input.licenses ?? [],
      createdAt,
      updatedAt: createdAt,
    };

    this.purgeExpired();
    this.save(record);

    console.log(`${LOG_PREFIX} Completed`, { linkedinId: record.linkedinId, phase: "start" });

    return record;
  }

  get(linkedinId: string): LinkedinRecord | undefined {
    this.purgeExpired();
    return this.records.get(linkedinId)?.record;
  }

  // ---------------------------------------------------------------------
  // Headline
  // ---------------------------------------------------------------------

  async generateHeadlineForStyle(linkedinId: string, style: HeadlineStyle): Promise<LinkedinRecord> {
    const record = this.mustGet(linkedinId);
    const { ctx, resume, rewriteRecord } = this.resolveContext(record);

    let variant = await generateHeadline(ctx, style);
    let validation = validateLinkedinContent(resume, variant.text, rewriteRecord, ctx.jd);

    if (!validation.valid) {
      variant = await generateHeadline(ctx, style, validation.violations.join("; "));
      validation = validateLinkedinContent(resume, variant.text, rewriteRecord, ctx.jd);

      if (!validation.valid) {
        throw new Error(`Headline generation repeatedly produced ungrounded content: ${validation.violations.join("; ")}`);
      }
    }

    console.log(`${LOG_PREFIX} Headline Generated`, { linkedinId, style });

    const updated: LinkedinRecord = {
      ...record,
      headlines: { ...record.headlines, [style]: variant },
      updatedAt: new Date().toISOString(),
    };

    this.save(updated);

    return updated;
  }

  acceptHeadline(linkedinId: string, style: HeadlineStyle): LinkedinRecord {
    const record = this.mustGet(linkedinId);

    if (!record.headlines[style]) {
      throw new Error(`No generated headline for style "${style}" to accept.`);
    }

    const updated: LinkedinRecord = { ...record, acceptedHeadlineStyle: style, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  // ---------------------------------------------------------------------
  // About
  // ---------------------------------------------------------------------

  async generateAboutForStyle(linkedinId: string, storyType: AboutStyle): Promise<LinkedinRecord> {
    const record = this.mustGet(linkedinId);
    const { ctx, resume, rewriteRecord } = this.resolveContext(record);

    let output = await generateAbout(ctx, storyType);

    if (output.characterCount > ABOUT_MAX_CHARACTERS) {
      output = await generateAbout(ctx, storyType, `Your previous draft was ${output.characterCount} characters — tighten it to ${ABOUT_MAX_CHARACTERS} characters or fewer.`);
    }

    let validation = validateLinkedinContent(resume, output.text, rewriteRecord, ctx.jd);

    if (!validation.valid) {
      output = await generateAbout(ctx, storyType, validation.violations.join("; "));
      validation = validateLinkedinContent(resume, output.text, rewriteRecord, ctx.jd);

      if (!validation.valid) {
        throw new Error(`About generation repeatedly produced ungrounded content: ${validation.violations.join("; ")}`);
      }
    }

    console.log(`${LOG_PREFIX} About Generated`, { linkedinId, storyType, characterCount: output.characterCount });

    const variant: AboutVariant = { storyType, text: output.text, characterCount: output.characterCount };

    const updated: LinkedinRecord = {
      ...record,
      about: { ...record.about, [storyType]: variant },
      updatedAt: new Date().toISOString(),
    };

    this.save(updated);

    return updated;
  }

  acceptAbout(linkedinId: string, storyType: AboutStyle): LinkedinRecord {
    const record = this.mustGet(linkedinId);

    if (!record.about[storyType]) {
      throw new Error(`No generated About section for story type "${storyType}" to accept.`);
    }

    const updated: LinkedinRecord = { ...record, acceptedAboutStyle: storyType, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  // ---------------------------------------------------------------------
  // Experience + Projects
  // ---------------------------------------------------------------------

  async generateExperienceSection(linkedinId: string): Promise<LinkedinRecord> {
    const record = this.mustGet(linkedinId);
    const { ctx, resume, rewriteRecord } = this.resolveContext(record);

    let items = await generateExperience(ctx);
    const invalidByIndex = new Map<number, string[]>();

    items.forEach((item, index) => {
      const validation = validateLinkedinContent(resume, item.rewritten, rewriteRecord, ctx.jd);
      if (!validation.valid) invalidByIndex.set(index, validation.violations);
    });

    if (invalidByIndex.size > 0) {
      const correction = Array.from(invalidByIndex.values()).flat().join("; ");
      items = await generateExperience(ctx, correction);
    }

    console.log(`${LOG_PREFIX} Experience Optimized`, { linkedinId, items: items.length });

    const experience: ExperienceItem[] = items.map((item) => {
      const validation = validateLinkedinContent(resume, item.rewritten, rewriteRecord, ctx.jd);
      const atsKeywords = ctx.jd
        ? [...(ctx.jd.skills ?? [])].filter((skill) => item.rewritten.toLowerCase().includes(skill.toLowerCase()))
        : [];

      return {
        original: item.original,
        rewritten: validation.valid ? item.rewritten : item.original,
        atsKeywords,
      };
    });

    const updated: LinkedinRecord = { ...record, experience, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  async generateProjectsSection(linkedinId: string): Promise<LinkedinRecord> {
    const record = this.mustGet(linkedinId);
    const { ctx, resume, rewriteRecord } = this.resolveContext(record);

    let projects = await generateProjects(ctx);
    const invalidByIndex = new Map<number, string[]>();

    projects.forEach((project, index) => {
      const combined = `${project.problem} ${project.solution} ${project.architecture} ${project.businessValue} ${project.impact}`;
      const validation = validateLinkedinContent(resume, combined, rewriteRecord, ctx.jd);
      if (!validation.valid) invalidByIndex.set(index, validation.violations);
    });

    if (invalidByIndex.size > 0) {
      const correction = Array.from(invalidByIndex.values()).flat().join("; ");
      projects = await generateProjects(ctx, correction);
    }

    console.log(`${LOG_PREFIX} Experience Optimized`, { linkedinId, projects: projects.length });

    const updated: LinkedinRecord = { ...record, projects, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  // ---------------------------------------------------------------------
  // Skills / Featured / Recommendations / Banner
  // ---------------------------------------------------------------------

  async generateSkillsSection(linkedinId: string): Promise<LinkedinRecord> {
    const record = this.mustGet(linkedinId);
    const { resume } = this.resolveContext(record);

    const skills = await generateSkills(resume);

    const updated: LinkedinRecord = { ...record, skills, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  computeFeatured(linkedinId: string): LinkedinRecord {
    const record = this.mustGet(linkedinId);
    const { resume } = this.resolveContext(record);

    const featured = computeFeaturedSuggestions(resume);
    const updated: LinkedinRecord = { ...record, featured, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  async generateRecommendations(linkedinId: string): Promise<LinkedinRecord> {
    const record = this.mustGet(linkedinId);
    const { ctx, resume, rewriteRecord } = this.resolveContext(record);

    let messages = await generateRecommendationMessages(ctx);
    const invalid = messages.filter((message) => !validateLinkedinContent(resume, message.message, rewriteRecord, ctx.jd).valid);

    if (invalid.length > 0) {
      const violations = invalid.flatMap((message) => validateLinkedinContent(resume, message.message, rewriteRecord, ctx.jd).violations);
      messages = await generateRecommendationMessages(ctx, violations.join("; "));
    }

    const valid = messages.filter((message) => validateLinkedinContent(resume, message.message, rewriteRecord, ctx.jd).valid);

    console.log(`${LOG_PREFIX} Completed`, { linkedinId, phase: "recommendations", kept: valid.length });

    const updated: LinkedinRecord = { ...record, recommendations: valid, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  async generateBannerAndBios(linkedinId: string): Promise<LinkedinRecord> {
    const record = this.mustGet(linkedinId);
    const { ctx, resume, rewriteRecord } = this.resolveContext(record);

    let output = await generateBanner(ctx);
    const combinedText = [output.tagline, ...output.bios.map((bio) => bio.bio)].join(" ");
    let validation = validateLinkedinContent(resume, combinedText, rewriteRecord, ctx.jd);

    if (!validation.valid) {
      output = await generateBanner(ctx, validation.violations.join("; "));
      validation = validateLinkedinContent(
        resume,
        [output.tagline, ...output.bios.map((bio) => bio.bio)].join(" "),
        rewriteRecord,
        ctx.jd
      );

      if (!validation.valid) {
        throw new Error(`Banner/branding generation repeatedly produced ungrounded content: ${validation.violations.join("; ")}`);
      }
    }

    console.log(`${LOG_PREFIX} Completed`, { linkedinId, phase: "banner" });

    const updated: LinkedinRecord = {
      ...record,
      bannerTagline: output.tagline,
      brandingBios: output.bios,
      updatedAt: new Date().toISOString(),
    };

    this.save(updated);

    return updated;
  }

  // ---------------------------------------------------------------------
  // Career interests — user-supplied preferences only; never AI-invented,
  // since only the candidate knows what they actually want.
  // ---------------------------------------------------------------------

  updateCareerInterests(linkedinId: string, input: Partial<CareerInterests>): LinkedinRecord {
    const record = this.mustGet(linkedinId);

    const careerInterests: CareerInterests = {
      preferredRoles: input.preferredRoles ?? record.careerInterests?.preferredRoles ?? [],
      preferredIndustries: input.preferredIndustries ?? record.careerInterests?.preferredIndustries ?? [],
      preferredLocations: input.preferredLocations ?? record.careerInterests?.preferredLocations ?? [],
      remotePreference: input.remotePreference ?? record.careerInterests?.remotePreference ?? null,
      relocationPreference: input.relocationPreference ?? record.careerInterests?.relocationPreference ?? null,
      visaSponsorshipStatement: input.visaSponsorshipStatement ?? record.careerInterests?.visaSponsorshipStatement ?? null,
    };

    const updated: LinkedinRecord = { ...record, careerInterests, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  // ---------------------------------------------------------------------
  // SEO / Profile Score — deterministic, recomputed fresh on each call.
  // ---------------------------------------------------------------------

  computeSeo(linkedinId: string): LinkedinRecord {
    const record = this.mustGet(linkedinId);
    const { resume, jdMatchResult } = this.resolveContext(record);

    const seo = computeSeoReport(record, resume, jdMatchResult);
    console.log(`${LOG_PREFIX} SEO Completed`, { linkedinId, missingKeywords: seo.missingKeywords.length });

    const updated: LinkedinRecord = { ...record, seo, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }

  computeScore(linkedinId: string): LinkedinRecord {
    const record = this.mustGet(linkedinId);
    const profileScore = computeProfileScore(record);

    console.log(`${LOG_PREFIX} Profile Score Generated`, { linkedinId, overall: profileScore.overall.score });

    const updated: LinkedinRecord = { ...record, profileScore, updatedAt: new Date().toISOString() };
    this.save(updated);

    return updated;
  }
}

export const linkedinService = new LinkedinService();
