import { enterpriseResumeParser, extractEnterpriseResumeText } from "../resume-parser";
import { EnterpriseResume, ResumeParserConfidence } from "../resume-schema";
import { EnterpriseResumeUploadInput } from "../resume-types";
import { analyzeCareerProgression } from "./career-progression";
import { normalizeCertifications } from "./certification-normalizer";
import { dedupeBy, dedupeStrings } from "./deduplicator";
import { normalizeEducation } from "./education-normalizer";
import { detectEmploymentGaps } from "./gap-detector";
import { normalizeLanguages } from "./language-normalizer";
import { buildParserMetadata } from "./parser-metadata";
import { normalizeProjects } from "./project-normalizer";
import { computeParserQuality } from "./quality-score";
import { detectSections } from "./section-detector";
import { SectionIntelligenceResult } from "./section-intelligence-schema";
import { extractSoftSkills } from "./soft-skill-normalizer";
import { buildTimeline, computeCareerStatistics } from "./timeline-builder";

const LOG_PREFIX = "[section-intelligence]";

/**
 * Second, additive analysis pass on top of Milestone 2's EnterpriseResume
 * parse: section-boundary detection, timeline reconstruction, employment
 * gaps, career progression, and normalization/dedup across every list
 * section. Deterministic (aside from an ongoing role's duration, which
 * depends on `referenceDate` — see date-normalizer.ts). Reuses Milestone
 * 2's parser read-only via its existing public exports; nothing in
 * resume-parser.ts is modified.
 */
export class SectionIntelligenceParser {
  analyze(
    resume: EnterpriseResume,
    rawText: string,
    confidence: ResumeParserConfidence,
    referenceDate: Date = new Date()
  ): SectionIntelligenceResult {
    const startedAt = Date.now();
    console.log(`${LOG_PREFIX} Section Intelligence Started`);

    const sections = detectSections(rawText);
    console.log(`${LOG_PREFIX} Sections Detected`, { count: sections.length });

    const timeline = buildTimeline(resume.companyHistory, referenceDate);
    console.log(`${LOG_PREFIX} Timeline Built`, { entries: timeline.length });

    const employmentGaps = detectEmploymentGaps(timeline, resume);
    console.log(`${LOG_PREFIX} Gaps Detected`, { count: employmentGaps.length });

    const careerProgression = analyzeCareerProgression(timeline);
    console.log(`${LOG_PREFIX} Career Progression Analyzed`, { promotions: careerProgression.promotionHistory.length });

    const careerStatistics = computeCareerStatistics(timeline, employmentGaps, careerProgression, referenceDate);

    const education = normalizeEducation(resume.education);
    const certifications = dedupeBy(normalizeCertifications(resume.certifications), (cert) => cert.name);
    const projects = dedupeBy(normalizeProjects(resume.projects), (project) => project.name);
    const languages = normalizeLanguages(resume.languagesKnown);
    const softSkills = dedupeStrings(extractSoftSkills(resume));

    const technicalSkillGroups = resume.skills
      .filter((group) => group.category !== "Soft Skills")
      .map((group) => ({ ...group, skills: dedupeStrings(group.skills) }));

    const technologies = dedupeStrings([
      ...technicalSkillGroups.flatMap((group) => group.skills),
      ...projects.flatMap((project) => project.technologies),
    ]);

    const tools = dedupeStrings(projects.flatMap((project) => project.tools));
    const companies = dedupeBy(resume.companyHistory, (company) => company.companyName);
    const achievements = dedupeStrings(resume.achievements);

    const parserQuality = computeParserQuality(resume, confidence, timeline, sections);
    console.log(`${LOG_PREFIX} Quality Score Computed`, { score: parserQuality.score });

    const parserMetadata = buildParserMetadata(rawText, sections, Date.now() - startedAt, confidence);

    const result: SectionIntelligenceResult = {
      personalInformation: resume.personalInfo,
      summary: resume.professionalSummary,
      timeline,
      companies,
      education,
      certifications,
      awards: resume.awards,
      projects,
      publications: resume.publications,
      patents: resume.patents,
      skills: technicalSkillGroups,
      softSkills,
      technologies,
      tools,
      languages,
      achievements,
      employmentGaps,
      careerProgression,
      parserMetadata,
      parserQuality,
      careerStatistics,
    };

    console.log(`${LOG_PREFIX} Section Intelligence Completed`, { processingTimeMs: parserMetadata.processingTime });

    return result;
  }

  /** Convenience wrapper: file -> full section-intelligence result, reusing Milestone 2's unmodified public parser exports. */
  async analyzeResume(input: EnterpriseResumeUploadInput): Promise<SectionIntelligenceResult> {
    const rawText = await extractEnterpriseResumeText(input);
    const { resume, confidence } = await enterpriseResumeParser.parseResumeText(rawText);

    return this.analyze(resume, rawText, confidence);
  }
}

export const sectionIntelligenceParser = new SectionIntelligenceParser();
