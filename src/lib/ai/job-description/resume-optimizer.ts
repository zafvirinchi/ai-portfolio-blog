import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { JobDescription } from "./jd-schema";
import { JdMatchComputation } from "./jd-matcher";
import {
  ChangedBullet,
  OptimizedBulletPair,
  RESUME_OPTIMIZER_JSON_SCHEMA,
  RemovedItem,
  ResumeOptimizerLlmOutput,
  ResumeOptimizerResult,
  resumeOptimizerLlmOutputSchema,
  resumeOptimizerResultSchema,
} from "./resume-optimizer-schema";

const OPTIMIZER_MODEL = "gpt-4o-mini";
const RESULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — same pattern every in-memory store in this codebase uses

// Phase 13 Milestone 2. A new, standalone optimizer module — does not
// modify or replace job-description/optimizer.ts (Milestone 4), does not
// touch jd-parser.ts/ats-engine.ts/jd-matcher.ts/jd-service.ts. Consumes
// their outputs read-only.

function buildOptimizerMessages(resume: Resume, jd: JobDescription, computation: JdMatchComputation) {
  return [
    {
      role: "system" as const,
      content: `You are an expert resume writer producing an ATS-optimized version of a
candidate's resume for a specific job description.

CRITICAL SAFETY RULES — never violate these:
- Never invent experience, companies, certifications, projects, or
  education the resume doesn't already contain. This includes naming a
  DIFFERENT certification than the one actually held (e.g. the resume has
  "AWS Certified Developer - Associate" — never write or list "AWS
  Certified Solutions Architect" instead just because the JD asks for
  it). Only ever reference a certification by its exact name from the
  resume's certifications list.
- Every entry in "insertedKeywords" must be a term you actually used
  somewhere in "optimizedSummary" or a rewritten bullet — never list a
  keyword there that doesn't literally appear in your own rewritten text.
- Never invent a metric, number, or scale that isn't already stated. If a
  bullet has no measurable result to draw on, strengthen it with better
  action verbs and clearer scope instead — qualitative, not fabricated.
- Never add an unstated descriptive qualifier ("high-traffic",
  "large-scale", "mission-critical", "enterprise-grade", ...) or a
  claimed outcome ("resulting in improved reliability", "ensuring
  performance under load", ...) unless the original text already states
  it. Adding scope/scale/result claims yourself is fabrication even
  without inventing a specific number — a lesson already learned and
  fixed once in this codebase's other optimizer, applied here from the
  start.
- Keyword injection (this JD's currently-missing keywords:
  ${computation.keywordMatch.missing.join(", ") || "none"}) applies ONLY
  to rewritten bullet/summary TEXT, never to "optimizedSkills" (see
  below). Only weave one of these into a rewritten bullet if it is the
  SAME underlying technology the candidate already used, just spelled/
  versioned differently (e.g. JD wants "Spring Boot", resume already
  shows "Spring" + REST API work — same technology, fair
  canonicalization). Never substitute a DIFFERENT-BUT-SIMILAR named
  technology for one the candidate actually has — using MySQL does NOT
  justify claiming PostgreSQL; using Java does NOT justify claiming
  Kotlin; using AWS does NOT justify claiming Azure. If the resume shows
  no real basis for a missing keyword, leave it out entirely. List every
  keyword you did weave in, in "insertedKeywords" — this must be a
  subset of what you actually used in the rewritten text, never a
  wishlist.

WHAT YOU MAY DO: rewrite wording, strengthen action verbs, restructure
for clarity/ATS formatting, weave in genuinely-supported keywords (per
the strict rule above), express existing measurable impact more clearly,
consolidate truly redundant bullets into one stronger bullet (note
removed duplicates belong in "improvementNotes" under "Removed
redundancy" — just omit the redundant one from your output, don't return
it twice).

SECTIONS:
- "optimizedSummary": rewrite the professional summary/objective to lead
  with the candidate's real seniority and stack, using the JD's own
  terminology wherever truthfully applicable.
- "optimizedSkills": reorganize ONLY the candidate's REAL, already-listed
  skills into these exact 9 categories — Programming, Backend, Frontend,
  Cloud, DevOps, AI, Database, Testing, Tools. This is pure
  recategorization, not an opportunity to add anything: never add a
  skill/technology absent from the resume here, even one from
  "insertedKeywords" or one you consider closely related to something the
  candidate has — keyword injection is for bullet text only, this list
  is a factual claim of possessed skills. Omit a category entirely if the
  candidate has nothing for it; never force a skill into a category it
  doesn't fit.
- "optimizedExperience"/"optimizedProjects"/"optimizedAchievements": for
  each bullet/item worth keeping, return { original, optimized } with
  the exact original text you rewrote from (so it can be matched back to
  the source) and your rewrite. Rewrite AT LEAST every bullet that has
  room for improvement; you don't need to return an entry for content
  you're intentionally dropping as redundant.
- "formattingSuggestions": concrete ATS-formatting fixes — headings,
  bullet spacing, ordering, whitespace, consistency, dates, capitalization
  — each as { area, suggestion }.
- "improvementNotes": a handful of high-level notes, each tagged with
  exactly one of: "Removed redundancy", "Improved wording", "Added ATS
  keywords", "Improved readability", "Strengthened action verbs".`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(resume)}\n\n---\n\nJob description (${
        jd.jobTitle ?? "role"
      } at ${jd.companyName ?? "company"}):\n${JSON.stringify(jd, null, 2)}\n\n---\n\nCurrent match data:\nOverall match: ${
        computation.overallMatch
      }%\nATS score: ${computation.ats.overall}/100\nExperience match: ${computation.experienceMatch.level} — ${
        computation.experienceMatch.reasoning
      }\nMissing skills: ${computation.keywordMatch.missing.join(", ") || "none"}`,
    },
  ];
}

function normalizeText(value: string): string {
  return value.trim();
}

function findRemoved(
  originals: string[],
  optimizedPairs: OptimizedBulletPair[],
  section: RemovedItem["section"]
): RemovedItem[] {
  const keptOriginals = new Set(optimizedPairs.map((pair) => normalizeText(pair.original)));

  return originals
    .map(normalizeText)
    .filter((text) => text.length > 0 && !keptOriginals.has(text))
    .map((text) => ({ section, text }));
}

function toChangedBullets(pairs: OptimizedBulletPair[]): ChangedBullet[] {
  return pairs.map((pair) => ({
    original: pair.original,
    optimized: pair.optimized,
    changeType: "modified" as const,
  }));
}

function countModified(pairs: OptimizedBulletPair[]): number {
  return pairs.filter((pair) => normalizeText(pair.original) !== normalizeText(pair.optimized)).length;
}

/**
 * Deterministic safety net: drops any "inserted keyword" the LLM claimed
 * but didn't actually use anywhere in the rewritten text — never trust the
 * self-report alone. Verified necessary by real testing: one run claimed
 * "AWS Certified Solutions Architect" as inserted (a certification the
 * candidate doesn't hold, per resume.certifications) while never actually
 * using it in any rewritten bullet — a phantom claim this filter removes
 * regardless of how well the prompt is followed.
 */
function filterToActuallyUsedKeywords(llmOutput: ResumeOptimizerLlmOutput): string[] {
  const haystack = [
    llmOutput.optimizedSummary,
    ...llmOutput.optimizedExperience.map((pair) => pair.optimized),
    ...llmOutput.optimizedProjects.map((pair) => pair.optimized),
    ...llmOutput.optimizedAchievements.map((pair) => pair.optimized),
  ]
    .join(" \n ")
    .toLowerCase();

  return llmOutput.insertedKeywords.filter((keyword) => {
    const normalized = keyword.trim().toLowerCase();
    return normalized.length > 0 && haystack.includes(normalized);
  });
}

function keywordIsCovered(keyword: string, insertedKeywords: string[]): boolean {
  const normalized = keyword.trim().toLowerCase();

  return insertedKeywords.some((inserted) => {
    const insertedNormalized = inserted.trim().toLowerCase();
    return insertedNormalized === normalized || insertedNormalized.includes(normalized) || normalized.includes(insertedNormalized);
  });
}

function computeOverallImprovementScore(
  llmOutput: ResumeOptimizerLlmOutput,
  verifiedInsertedKeywords: string[],
  computation: JdMatchComputation,
  totalOriginalItems: number,
  modifiedCount: number
): number {
  const missingKeywords = computation.keywordMatch.missing;
  const keywordCoverage =
    missingKeywords.length === 0
      ? 1
      : missingKeywords.filter((keyword) => keywordIsCovered(keyword, verifiedInsertedKeywords)).length /
        missingKeywords.length;

  const modifiedRatio = totalOriginalItems === 0 ? 0 : modifiedCount / totalOriginalItems;
  const formattingCredit = Math.min(1, llmOutput.formattingSuggestions.length / 5);

  const score = keywordCoverage * 50 + modifiedRatio * 30 + formattingCredit * 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

interface StoredResult {
  result: ResumeOptimizerResult;
  expiresAt: number;
}

export class ResumeOptimizer {
  private readonly results = new Map<string, StoredResult>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.results) {
      if (entry.expiresAt <= now) {
        this.results.delete(id);
      }
    }
  }

  async optimize(resume: Resume, jd: JobDescription, computation: JdMatchComputation): Promise<ResumeOptimizerResult> {
    const completion = await openai.chat.completions.create({
      model: OPTIMIZER_MODEL,
      temperature: 0.4,
      messages: buildOptimizerMessages(resume, jd, computation),
      response_format: {
        type: "json_schema",
        json_schema: RESUME_OPTIMIZER_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Resume optimizer LLM returned no content");
    }

    const parsed = resumeOptimizerLlmOutputSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Resume optimizer output failed schema validation: ${parsed.error.message}`);
    }

    const llmOutput = parsed.data;

    // Deterministic post-processing — none of this is LLM-guessed.
    const verifiedInsertedKeywords = filterToActuallyUsedKeywords(llmOutput);
    const originalExperienceBullets = resume.workExperience.flatMap((job) => job.description);
    const originalProjectDescriptions = resume.projects
      .map((project) => project.description)
      .filter((description): description is string => Boolean(description));
    const originalAchievements = resume.achievements;

    const removedItems: RemovedItem[] = [
      ...findRemoved(originalExperienceBullets, llmOutput.optimizedExperience, "experience"),
      ...findRemoved(originalProjectDescriptions, llmOutput.optimizedProjects, "project"),
      ...findRemoved(originalAchievements, llmOutput.optimizedAchievements, "achievement"),
    ];

    const totalOriginalItems =
      originalExperienceBullets.length + originalProjectDescriptions.length + originalAchievements.length;
    const modifiedCount =
      countModified(llmOutput.optimizedExperience) +
      countModified(llmOutput.optimizedProjects) +
      countModified(llmOutput.optimizedAchievements);

    const overallImprovementScore = computeOverallImprovementScore(
      llmOutput,
      verifiedInsertedKeywords,
      computation,
      totalOriginalItems,
      modifiedCount
    );

    const result = resumeOptimizerResultSchema.parse({
      optimizedSummary: llmOutput.optimizedSummary,
      optimizedSkills: llmOutput.optimizedSkills,
      optimizedExperience: toChangedBullets(llmOutput.optimizedExperience),
      optimizedProjects: toChangedBullets(llmOutput.optimizedProjects),
      optimizedAchievements: toChangedBullets(llmOutput.optimizedAchievements),
      insertedKeywords: verifiedInsertedKeywords,
      formattingSuggestions: llmOutput.formattingSuggestions,
      improvementNotes: llmOutput.improvementNotes,
      removedItems,
      overallImprovementScore,
    });

    return result;
  }

  store(jdMatchId: string, result: ResumeOptimizerResult): void {
    this.purgeExpired();
    this.results.set(jdMatchId, { result, expiresAt: Date.now() + RESULT_TTL_MS });
  }

  get(jdMatchId: string): ResumeOptimizerResult | undefined {
    this.purgeExpired();
    return this.results.get(jdMatchId)?.result;
  }
}

export const resumeOptimizer = new ResumeOptimizer();
