import { ragKnowledge } from "../knowledge/rag.service";
import { jdMatchRequestContext, jdMatchService } from "../job-description/jd-service";
import { JdMatchRecord } from "../job-description/jd-types";
import { interviewPrepRequestContext, prepService } from "../interview-prep/prep-service";
import { PrepRecord } from "../interview-prep/prep-types";
import { mockInterviewRequestContext, sessionService } from "../mock-interview/session-service";
import { SessionRecord } from "../mock-interview/session-types";
import { REWRITE_STYLES, RewriteSection, RewriteStyle } from "../resume-rewriter/rewrite-schema";
import { rewriteRequestContext, rewriteService } from "../resume-rewriter/rewrite-service";
import { PendingSectionRewrite } from "../resume-rewriter/rewrite-types";
import { COVER_LETTER_LENGTHS, COVER_LETTER_STYLES, EMAIL_AUDIENCES, CoverLetterLength, CoverLetterStyle } from "../cover-letter/cover-schema";
import { coverRequestContext, coverLetterService } from "../cover-letter/cover-service";
import { HEADLINE_STYLES, AboutStyle, HeadlineStyle } from "../linkedin/linkedin-schema";
import { linkedinRequestContext, linkedinService } from "../linkedin/linkedin-service";
import { computeRankingScore } from "../recruiter/candidate-ranking";
import { candidateService, recruiterRequestContext } from "../recruiter/candidate-service";
import { CandidateSummary } from "../recruiter/candidate-types";
import { daysInStage } from "../recruitment/candidate-stage";
import { interviewScheduler } from "../recruitment/interview-scheduler";
import { jobService } from "../recruitment/job-service";
import { computeAnalytics } from "../recruitment/pipeline-analytics";
import { recruitmentRequestContext, pipelineService } from "../recruitment/pipeline-service";
import { resumeRequestContext, resumeService } from "../resume";
import { ResumeRecord } from "../resume/resume-types";
import * as activityService from "../../saas/activity-service";
import { ACTIVITY_TYPES, ActivityType } from "../../saas/organization-schema";
import { ActivityLogEntry } from "../../saas/organization-types";
import { organizationRequestContext, listMyOrganizations } from "../../saas/tenant-context";
import { resolveEmail } from "../../saas/team-service";
import * as auditAuth from "../../auth/audit-auth";
import * as authSessionService from "../../auth/session-service";
import { authRequestContext } from "../../auth/permission-service";
import { getCreditBalance, listCreditBalances } from "../../billing/credit-service";
import { getActiveSubscription } from "../../billing/subscription-service";
import { PLAN_DEFINITIONS } from "../../billing/plan-service";
import { PLAN_KEYS, PlanKey, FeatureKey } from "../../billing/billing-schema";
import * as billingInvoiceService from "../../billing/invoice-service";
import { getBalance as getAiCreditBalance, getSummary as getUsageSummary } from "../usage/usage-service";
import { UsageFeatureKey } from "../usage/usage-schema";
import { requireFeature } from "../../billing/entitlement-service";
import { ToolResponse, AITool } from "./types";
import { RagToolResult } from "@/types/tool-result";

// Renders the in-memory analysis of an uploaded resume into a text block
// suitable for prompt context — mirrors the shape `buildContext()`
// (lib/ai/context.ts) produces for RAG chunks, since the result is fed
// through the exact same generation step (PortfolioChain).
function buildResumeContext(record: ResumeRecord): string {
  const { resume, analysis, atsScore, skillGap } = record;

  const lines: string[] = [
    "SPECIAL MODE — RESUME ANALYSIS: The user has uploaded their own resume " +
      "for analysis below. For this question, answer as a resume-analysis " +
      "assistant for THIS candidate (not about Zafrul). This data is real " +
      "and provided — never say the information is unavailable.",
    "",
    `Uploaded resume: ${record.filename} (candidate: ${resume.contact.name ?? "unknown"})`,
    `Years of experience: ${resume.yearsOfExperience ?? "unknown"}`,
    `Career level: ${analysis.careerLevel}`,
    `Suitable roles: ${analysis.suitableRoles.join(", ") || "none identified"}`,
    `Technology stack: ${analysis.technologyStack.join(", ") || "none identified"}`,
    "",
    `ATS overall score: ${atsScore.overall}/100`,
    `ATS breakdown — formatting: ${atsScore.formatting}, keyword: ${atsScore.keyword}, experience: ${atsScore.experience}, skills: ${atsScore.skills}, education: ${atsScore.education}, certification: ${atsScore.certification}`,
    `ATS explanation: ${atsScore.explanation}`,
    "",
    `Key strengths: ${analysis.keyStrengths.join("; ") || "none identified"}`,
    `Weaknesses: ${analysis.weaknesses.join("; ") || "none identified"}`,
    `Missing skills (general): ${analysis.missingSkills.join(", ") || "none identified"}`,
    `Improvement suggestions: ${analysis.improvementSuggestions.join("; ") || "none"}`,
    "",
    `Missing Java skills: ${skillGap.missingJavaSkills.join(", ") || "none"}`,
    `Missing Spring skills: ${skillGap.missingSpringSkills.join(", ") || "none"}`,
    `Missing Cloud skills: ${skillGap.missingCloudSkills.join(", ") || "none"}`,
    `Missing DevOps skills: ${skillGap.missingDevOpsSkills.join(", ") || "none"}`,
    `Missing AI skills: ${skillGap.missingAiSkills.join(", ") || "none"}`,
    `Missing Database skills: ${skillGap.missingDatabaseSkills.join(", ") || "none"}`,
    `Recommended courses: ${skillGap.recommendedCourses.join("; ") || "none"}`,
    `Recommended certifications: ${skillGap.recommendedCertifications.join("; ") || "none"}`,
    `Recommended projects: ${skillGap.recommendedProjects.join("; ") || "none"}`,
  ];

  return lines.join("\n");
}

// Phase 12 Milestone 4 — additive only: appended to the resume context
// block when a JD match has been analyzed for this session (see
// jdMatchRequestContext below). If no JD match is in context, this
// function is never called and existing resume-only chat behavior is
// unchanged.
function buildJdMatchContext(record: JdMatchRecord): string {
  const { jobDescription, matchResult } = record;

  const lines: string[] = [
    "",
    `The user has also analyzed this resume against a job description${
      jobDescription.jobTitle ? ` — ${jobDescription.jobTitle}` : ""
    }${jobDescription.companyName ? ` at ${jobDescription.companyName}` : ""}. Use this match data too.`,
    "",
    `Overall JD match: ${matchResult.overallMatch}%`,
    `JD-aware ATS score: ${matchResult.atsScore}/100 (keyword: ${matchResult.keywordScore}, experience: ${matchResult.experienceScore}, education: ${matchResult.educationScore}, formatting: ${matchResult.formattingScore}, achievement: ${matchResult.achievementScore}, project: ${matchResult.projectScore}, leadership: ${matchResult.leadershipScore}, certification: ${matchResult.certificationScore}, AI skills: ${matchResult.aiScore}, cloud: ${matchResult.cloudScore}, security: ${matchResult.securityScore}, soft skills: ${matchResult.softSkillsScore})`,
    `Experience match: ${matchResult.experienceMatch.level} — ${matchResult.experienceMatch.reasoning}`,
    "",
    `Matched skills: ${matchResult.matchedSkills.join(", ") || "none"}`,
    `Partially matched skills (same technology family, not a confirmed exact match): ${
      matchResult.partialSkills.map((p) => `${p.jdSkill} (via ${p.resumeSkill})`).join(", ") || "none"
    }`,
    `Missing skills: ${matchResult.missingSkills.join(", ") || "none"}`,
    `Missing keywords: ${matchResult.missingKeywords.join(", ") || "none"}`,
    `Missing education/certifications: ${matchResult.educationMatch.missing.join(", ") || "none"}`,
    "",
    `Resume strengths for this JD: ${matchResult.resumeStrengths.join("; ") || "none identified"}`,
    `Resume weaknesses for this JD: ${matchResult.resumeWeaknesses.join("; ") || "none identified"}`,
    "",
    `AI-optimized professional summary (already generated, only rephrases real resume content — offer this if asked to "rewrite my summary"): ${matchResult.optimizedSummary}`,
    "Optimized experience bullets (already generated — offer these if asked to rewrite experience/projects):",
    ...matchResult.optimizedExperience.map((bullet) => `  - Original: "${bullet.original}" -> Optimized: "${bullet.optimized}"`),
    ...matchResult.optimizedProjects.map((bullet) => `  - Original: "${bullet.original}" -> Optimized: "${bullet.optimized}"`),
    "",
    `Top improvement suggestions: ${
      matchResult.improvementSuggestions
        .slice(0, 5)
        .map((s) => `${s.title} (${s.priority} priority — ${s.why})`)
        .join("; ") || "none"
    }`,
  ];

  return lines.join("\n");
}

// Phase 13 Milestone 3 — additive only, same pattern as
// buildJdMatchContext above: appended when an interview-prep report has
// been generated for this session (see interviewPrepRequestContext
// below). Kept as a short summary (not the full question/answer set,
// which would be very long) — chat can call the standalone
// /api/ai/interview-prep/[prepId]/answer route for "explain the ideal
// answer" style follow-ups rather than needing everything in context.
function buildInterviewPrepContext(record: PrepRecord): string {
  const { report } = record;

  const lines: string[] = [
    "",
    `The user has also generated an interview preparation report for this resume + job description. Use this too — you can quote a question and its ideal answer, or point them at what to study.`,
    "",
    `Interview readiness score: ${report.readinessScore.overall}/100`,
    `Question counts — technical: ${report.technicalQuestions.length}, HR: ${report.hrQuestions.length}, project: ${report.projectQuestions.length}, system design: ${report.systemDesignQuestions.length}`,
    "",
    "Technical questions:",
    ...report.technicalQuestions.map((item) => `  - [${item.difficulty}] ${item.question}`),
    "",
    "HR questions:",
    ...report.hrQuestions.map((item) => `  - [${item.category}] ${item.question}`),
    "",
    "Project questions:",
    ...report.projectQuestions.map((item) => `  - [${item.projectName} / ${item.focus}] ${item.question}`),
    "",
    "System design questions:",
    ...report.systemDesignQuestions.map((item) => `  - [${item.difficulty}] ${item.question}`),
    "",
    `Weak areas: ${report.weaknessAnalysis.weakAreas.join("; ") || "none identified"}`,
    `Concepts to learn first: ${report.weaknessAnalysis.conceptsToLearn.join(", ") || "none"}`,
    `7-day plan focus: ${report.learningRoadmap[0]?.focus.join(", ") ?? "none"}`,
  ];

  return lines.join("\n");
}

// Phase 13 Milestone 4 — additive only, same short-summary approach as
// buildInterviewPrepContext above. Context-only (no mutation — that's
// interview.tool.ts's job, see its handleMockInterviewMessage) since
// "resume" questions aren't where interview commands land; this just
// keeps the model aware a mock interview is in progress if asked about it.
function buildMockInterviewContext(session: SessionRecord): string {
  const current = session.pendingFollowUp ?? session.questions[session.currentIndex];

  const lines: string[] = [
    "",
    `The user also has a mock interview session in progress (${session.interviewType}, ${session.mode} mode, status: ${session.status}).`,
    current ? `Current question: ${current.text}` : "No question is currently active.",
    `Questions answered so far: ${session.transcript.length}`,
  ];

  if (session.report) {
    lines.push(
      `Final report — overall score: ${session.report.overallScore}/100, interview readiness: ${session.report.interviewReadiness}/100.`
    );
  }

  return lines.join("\n");
}

// Phase 13 Milestone 5 — additive only, same "detect intent, call the
// real service, fold the result into context" pattern Milestone 4
// established for mock-interview commands. Scoped to a rewrite session
// that already exists (started from /resume-rewriter) — chat drives
// style/section/domain-targeted rewrites on top of it.

function detectStyle(question: string): RewriteStyle | null {
  const lower = question.toLowerCase();
  return REWRITE_STYLES.find((style) => lower.includes(style.toLowerCase())) ?? null;
}

function detectSection(question: string): RewriteSection | null {
  const lower = question.toLowerCase();

  if (/\bcareer objective\b/.test(lower)) return "careerObjective";
  if (/\bsummary\b/.test(lower)) return "summary";
  if (/\bexperience\b/.test(lower)) return "experience";
  if (/\bproject/.test(lower)) return "projects";
  if (/\bskill/.test(lower)) return "skills";
  if (/\bachievement/.test(lower)) return "achievements";
  if (/\bcertificat/.test(lower)) return "certifications";

  return null;
}

function detectTargetContext(question: string): string | null {
  const match = question.match(/\bfor\s+([a-z0-9][a-z0-9 ]*?(?:domain|role))\b/i);
  return match ? match[1].trim() : null;
}

function describeRewritePending(section: RewriteSection, style: RewriteStyle, pending: PendingSectionRewrite): string {
  if (pending.variants) {
    return `Generated ${pending.variants.length} ${style}-style variant(s) for ${section}:\n\n${pending.variants
      .map((variant) => `[Version ${variant.version}] ${variant.text}`)
      .join("\n\n")}`;
  }

  if (pending.items) {
    const example = pending.items[0]?.variants[0]?.text;
    return `Rewrote ${pending.items.length} ${section} item(s) in the ${style} style.${example ? ` Example: ${example}` : ""}`;
  }

  if (pending.projectItems) {
    return `Rewrote ${pending.projectItems.length} project(s) in the ${style} style.`;
  }

  if (pending.skillCategories) {
    return `Recategorized skills into ${pending.skillCategories.length} categories: ${pending.skillCategories
      .map((group) => group.category)
      .join(", ")}.`;
  }

  return "Rewrite generated.";
}

async function handleRewriteMessage(rewriteId: string, question: string): Promise<string> {
  const record = rewriteService.get(rewriteId);

  if (!record) {
    return "The resume rewrite session referenced is no longer available — start a new one from the Resume Rewriter page.";
  }

  const section = detectSection(question);

  if (!section) {
    return `Tell me which section to rewrite — summary, career objective, experience, projects, skills, achievements, or certifications — and optionally a style (e.g. "FAANG", "Technical", "Executive") or target context (e.g. "for banking domain").`;
  }

  const style = detectStyle(question) ?? "Professional";
  const targetContext = detectTargetContext(question);

  try {
    const pending = await rewriteService.rewriteSection(rewriteId, { section, style, targetContext: targetContext ?? undefined });
    return describeRewritePending(section, style, pending);
  } catch (error) {
    return `That rewrite couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

// Phase 13 Milestone 6 — additive only, same "detect intent, call the
// real service, fold the result into context" pattern Milestones 4/5
// established. Scoped to a cover-letter session that already exists
// (started from /cover-letter, which is where companyName/role/style/
// length are first set) — chat drives regeneration/email/LinkedIn
// generation on top of it.

function detectCoverStyle(question: string): CoverLetterStyle | null {
  const lower = question.toLowerCase();
  return COVER_LETTER_STYLES.find((style) => lower.includes(style.toLowerCase())) ?? null;
}

function detectCoverLength(question: string): CoverLetterLength | null {
  const lower = question.toLowerCase();
  if (/\bshort\b/.test(lower)) return "Short";
  if (/\bstandard\b/.test(lower)) return "Standard";
  if (/\b(long|detailed)\b/.test(lower)) return "Executive";
  return COVER_LETTER_LENGTHS.find((length) => lower.includes(length.toLowerCase())) ?? null;
}

async function handleCoverMessage(coverLetterId: string, question: string): Promise<string> {
  const record = coverLetterService.get(coverLetterId);

  if (!record) {
    return "The cover letter session referenced is no longer available — start a new one from the Cover Letter page.";
  }

  const lower = question.toLowerCase();

  try {
    if (/\bemail\b/.test(lower)) {
      const audience = EMAIL_AUDIENCES.find((candidate) => lower.includes(candidate.toLowerCase())) ?? "Recruiter";
      const updated = await coverLetterService.generateEmail(coverLetterId, audience);
      const email = updated.emails[audience];

      return email
        ? `Generated a ${audience} application email.\n\nSubject: ${email.subject}\n\n${email.body}`
        : "Email generation failed.";
    }

    if (/\blinkedin\b/.test(lower)) {
      const updated = await coverLetterService.generateLinkedinMessages(coverLetterId);

      return `Generated LinkedIn messages:\n\n${(updated.linkedinMessages ?? [])
        .map((message) => `[${message.type}] ${message.message}`)
        .join("\n\n")}`;
    }

    const style = detectCoverStyle(question);
    const length = detectCoverLength(question);
    const updated = await coverLetterService.regenerateLetter(coverLetterId, style ?? undefined, length ?? undefined);
    const primary = updated.letterVariants[0];

    return `Generated a ${updated.style} cover letter (Version A):\n\n${primary?.sections.fullText ?? ""}`;
  } catch (error) {
    return `That cover letter action couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

// Phase 13 Milestone 7 — additive only, same "detect intent, call the
// real service, fold the result into context" pattern Milestones 4-6
// established. Scoped to a LinkedIn optimizer session that already
// exists (started from /linkedin-optimizer).

function detectLinkedinHeadlineStyle(question: string): HeadlineStyle | null {
  const lower = question.toLowerCase();
  return HEADLINE_STYLES.find((style) => lower.includes(style.toLowerCase())) ?? null;
}

function detectAboutStoryType(question: string): AboutStyle | null {
  const lower = question.toLowerCase();
  if (/\brecruiter\b/.test(lower)) return "RecruiterFriendly";
  if (/\bleadership\b/.test(lower)) return "Leadership";
  if (/\btechnical\b/.test(lower)) return "Technical";
  if (/\bprofessional\b/.test(lower)) return "Professional";
  return null;
}

async function handleLinkedinMessage(linkedinId: string, question: string): Promise<string> {
  const record = linkedinService.get(linkedinId);

  if (!record) {
    return "The LinkedIn optimizer session referenced is no longer available — start a new one from the LinkedIn Optimizer page.";
  }

  const lower = question.toLowerCase();

  try {
    if (/\babout\b/.test(lower) || /\brecruiter summary\b/.test(lower)) {
      const storyType = detectAboutStoryType(question) ?? "Professional";
      const updated = await linkedinService.generateAboutForStyle(linkedinId, storyType);
      const variant = updated.about[storyType];
      return `Generated a ${storyType} About section (${variant?.characterCount ?? 0} characters):\n\n${variant?.text ?? ""}`;
    }

    if (/\bheadline\b/.test(lower)) {
      const style = detectLinkedinHeadlineStyle(question) ?? "Professional";
      const updated = await linkedinService.generateHeadlineForStyle(linkedinId, style);
      const variant = updated.headlines[style];
      return `Generated a ${style} headline:\n\n${variant?.text ?? ""}`;
    }

    if (/\bnetworking message\b|\brecruiter outreach\b|\bconnection request\b|\breferral\b/.test(lower)) {
      const updated = await linkedinService.generateRecommendations(linkedinId);
      return `Generated ${updated.recommendations?.length ?? 0} networking message(s):\n\n${(updated.recommendations ?? [])
        .map((message) => `[${message.type}] ${message.message}`)
        .join("\n\n")}`;
    }

    if (/\bseo\b/.test(lower)) {
      const updated = linkedinService.computeSeo(linkedinId);
      return `SEO analysis — search ranking: ${updated.seo?.searchRankingScore ?? 0}/100, recruiter visibility: ${
        updated.seo?.recruiterVisibilityScore ?? 0
      }/100. ${(updated.seo?.recommendations ?? []).join(" ")}`;
    }

    if (/\bskills?\b/.test(lower)) {
      const updated = await linkedinService.generateSkillsSection(linkedinId);
      return `Categorized skills into ${updated.skills?.length ?? 0} categories.`;
    }

    if (/\bexperience\b/.test(lower)) {
      const updated = await linkedinService.generateExperienceSection(linkedinId);
      return `Rewrote ${updated.experience?.length ?? 0} experience bullet(s) for LinkedIn.`;
    }

    return "Tell me what to work on — your headline, About section, skills, experience, SEO, or a networking message.";
  } catch (error) {
    return `That LinkedIn action couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

// Phase 13 Milestone 8 — additive only, same "detect intent, call the
// real service, fold the result into context" pattern Milestones 4-7
// established. Unlike every prior branch, this one has no per-session
// ID to scope to — the Recruiter Workspace is a true singleton, so it
// operates over the whole in-memory candidate list (see
// recruiterRequestContext in candidate-service.ts).

function summarizeCandidates(summaries: CandidateSummary[], limit = 5): string {
  if (summaries.length === 0) return "No matching candidates found in the workspace.";

  return summaries
    .slice(0, limit)
    .map(
      (candidate) =>
        `${candidate.name} — ${candidate.currentRole ?? "role unknown"} at ${
          candidate.currentCompany ?? "unknown company"
        }, ATS ${candidate.scores.atsScore ?? "N/A"}, JD Match ${candidate.scores.jdMatch ?? "N/A"}, tags: ${
          candidate.tags.join(", ") || "none"
        }`
    )
    .join("\n");
}

function detectSkillTerm(question: string): string | null {
  const match = question.match(/\b(?:has|with|in|knows?)\s+([a-z0-9][a-z0-9+.# ]*?)(?:\s+experience\b|\s+skills?\b|\s+candidates?\b)/i);
  return match ? match[1].trim() : null;
}

function detectCompareNames(question: string): [string, string] | null {
  const match = question.match(/compare\s+([a-z0-9][a-z0-9 ._'-]*?)\s+(?:and|vs\.?|versus)\s+([a-z0-9][a-z0-9 ._'-]*?)(?:[.?!]|$)/i);
  return match ? [match[1].trim(), match[2].trim()] : null;
}

function detectTopN(question: string): number {
  const match = question.match(/top\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : 5;
}

async function handleRecruiterMessage(question: string, recruiterId: string): Promise<string> {
  const lower = question.toLowerCase();

  try {
    if (/\bcompare\b/.test(lower)) {
      const names = detectCompareNames(question);

      if (!names) {
        return `Tell me which two (or more) candidates to compare by name, e.g. "Compare Jane Doe and John Smith".`;
      }

      // Phase 19 Milestone 5 — genuine bypass found and fixed: this tool
      // path called candidateService.compare() (a real LLM call) with no
      // entitlement check at all, while its dedicated sibling route
      // (/api/ai/recruiter/compare) has always required this. Reuses
      // the identical feature ID and gate — no new metering invented.
      // A rejection is caught by this function's own try/catch below
      // and surfaced as a friendly chat message, same as any other
      // recruiter-tool failure.
      await requireFeature(recruiterId, "recruiter.analytics");

      const matchedByName = await Promise.all(names.map((name) => candidateService.findByNameFragment(name, recruiterId)));
      const matched = matchedByName.map((candidates) => candidates[0]).filter((candidate): candidate is CandidateSummary => Boolean(candidate));

      if (matched.length < 2) {
        return `I couldn't find at least two matching candidates in the workspace for "${names.join('" and "')}".`;
      }

      const result = await candidateService.compare(recruiterId, matched.map((candidate) => candidate.candidateId));
      return `Comparison of ${result.candidates.map((candidate) => candidate.name).join(", ")}:\n\n${result.recommendation}\n\n${result.rankingRationale}`;
    }

    if (/\brecommend\b.*\bcandidates?\b|\btop\s+\d+\s+candidates?\b/.test(lower)) {
      // Phase 19 Milestone 5 — same finding/fix as compare() above,
      // mirroring /api/ai/recruiter/recommend's own gate exactly.
      await requireFeature(recruiterId, "recruiter.analytics");

      const topN = detectTopN(question);
      const result = await candidateService.recommendTopCandidates(recruiterId, topN);
      return `Top ${result.candidates.length} recommended candidates:\n\n${summarizeCandidates(result.candidates, topN)}\n\n${result.summary}`;
    }

    if (/\bready for interview\b|\binterview.?ready\b/.test(lower)) {
      const ready = await candidateService.findReadyForInterview(recruiterId);
      return `Candidates ready for interview:\n\n${summarizeCandidates(ready, 10)}`;
    }

    if (/\bstrongest\b|\bbest\b/.test(lower)) {
      const skillMatch = question.match(/\b(?:strongest|best)\s+([a-z0-9][a-z0-9+.# ]*?)\s+candidate/i);
      const term = skillMatch ? skillMatch[1].trim() : null;
      const pool = term ? await candidateService.searchBySkill(term, recruiterId) : await candidateService.list(recruiterId);

      if (pool.length === 0) {
        return term ? `No candidates with "${term}" experience found in the workspace.` : "No candidates in the workspace yet.";
      }

      const top = [...pool].sort((a, b) => computeRankingScore(b.scores) - computeRankingScore(a.scores))[0];
      return `The strongest${term ? ` ${term}` : ""} candidate is ${top.name} — ${top.currentRole ?? "role unknown"} at ${
        top.currentCompany ?? "unknown company"
      }, ATS ${top.scores.atsScore ?? "N/A"}, JD Match ${top.scores.jdMatch ?? "N/A"}, tags: ${top.tags.join(", ") || "none"}.`;
    }

    if (/\bwho has\b|\bexperience with\b|\bexperience in\b/.test(lower)) {
      const term = detectSkillTerm(question);

      if (!term) {
        return `Tell me which skill or technology to search for, e.g. "Who has Spring Boot experience?"`;
      }

      const matches = await candidateService.searchBySkill(term, recruiterId);
      return `Candidates with "${term}" experience:\n\n${summarizeCandidates(matches, 10)}`;
    }

    return "Tell me what to check — the strongest candidate in a skill, who has a specific technology, who's ready for interview, a comparison between two candidates, or a top-N recommendation.";
  } catch (error) {
    return `That recruiter workspace action couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

// Phase 13 Milestone 9 — additive only, same "detect intent, call the
// real service, fold the result into context" pattern Milestones 4-8
// established. Like recruiterMode, the Recruitment Pipeline has no
// per-session ID to scope to — it operates over whatever jobs/pipeline
// candidates already exist (see recruitmentRequestContext).

function summarizePipelineCandidates(entries: { candidateId: string; extra?: string }[], allCandidates: CandidateSummary[], limit = 5): string {
  const resolved = entries
    .slice(0, limit)
    .map((entry) => {
      const candidate = allCandidates.find((c) => c.candidateId === entry.candidateId);
      if (!candidate) return null;
      return `${candidate.name} — ${candidate.currentRole ?? "role unknown"}${entry.extra ? ` (${entry.extra})` : ""}`;
    })
    .filter((line): line is string => Boolean(line));

  return resolved.length > 0 ? resolved.join("\n") : "No matching candidates found.";
}

function detectSkillTermForTopCandidates(question: string): string | null {
  const match = question.match(/\btop\s+([a-z0-9][a-z0-9+.# ]*?)\s+candidates?\b/i);
  return match ? match[1].trim() : null;
}

function detectJobTitleFragment(question: string): string | null {
  const match = question.match(/\bfor\s+(?:the\s+)?([a-z0-9][a-z0-9 ]*?)(?:\s+role\b|\s+position\b|\s+job\b|[.?!]|$)/i);
  return match ? match[1].trim() : null;
}

async function handleRecruitmentMessage(question: string): Promise<string> {
  const lower = question.toLowerCase();
  // The Recruitment Pipeline (Phase 13 Milestone 9) is a separate,
  // sibling feature from the Recruiter Workspace (candidate ownership
  // added in Phase 16 Milestone 2) with its own not-yet-authenticated
  // job.recruiter/hiringManager actor model — out of this milestone's
  // scope to redesign, so it deliberately keeps using the unscoped
  // system-use accessors rather than a recruiterId it doesn't have.
  const allCandidates = await candidateService.listForSystemUse();

  try {
    if (/\btop\b.*\bcandidates?\b/.test(lower)) {
      const term = detectSkillTermForTopCandidates(question);
      const pool = term ? await candidateService.searchBySkillForSystemUse(term) : allCandidates;

      const ranked = [...pool]
        .sort((a, b) => computeRankingScore(b.scores) - computeRankingScore(a.scores))
        .map((candidate) => ({ candidateId: candidate.candidateId, extra: `score ${computeRankingScore(candidate.scores)}/100` }));

      return `Top${term ? ` ${term}` : ""} candidates:\n\n${summarizePipelineCandidates(ranked, allCandidates)}`;
    }

    if (/\bready for hr\b/.test(lower)) {
      const entries = pipelineService
        .listAll()
        .filter((pc) => pc.stage === "HR Interview")
        .map((pc) => ({ candidateId: pc.candidateId, extra: "HR Interview stage" }));

      return `Candidates ready for the HR round:\n\n${summarizePipelineCandidates(entries, allCandidates, 10)}`;
    }

    if (/\bwaiting longest\b|\blongest\b/.test(lower)) {
      const entries = pipelineService
        .listAll()
        .map((pc) => ({ pc, days: daysInStage(pc) }))
        .filter(({ pc }) => pc.stage !== "Hired" && pc.stage !== "Rejected")
        .sort((a, b) => b.days - a.days)
        .map(({ pc, days }) => ({ candidateId: pc.candidateId, extra: `${days} day(s) in ${pc.stage}` }));

      return `Candidates waiting longest:\n\n${summarizePipelineCandidates(entries, allCandidates, 10)}`;
    }

    if (/\brecommend\b.*\bcandidates?\b.*\bfor\b/.test(lower)) {
      const titleFragment = detectJobTitleFragment(question);

      if (!titleFragment) {
        return `Tell me which job title to recommend candidates for, e.g. "Recommend candidates for Senior Java Developer".`;
      }

      const job = jobService.findByTitleFragment(titleFragment)[0];

      if (!job) {
        return `I couldn't find a job matching "${titleFragment}".`;
      }

      const entries = pipelineService
        .list(job.jobId)
        .map((pc) => ({ candidateId: pc.candidateId, summary: allCandidates.find((c) => c.candidateId === pc.candidateId) }))
        .filter((entry): entry is { candidateId: string; summary: CandidateSummary } => Boolean(entry.summary))
        .map((entry) => ({ candidateId: entry.candidateId, score: computeRankingScore(entry.summary.scores) }))
        .sort((a, b) => b.score - a.score)
        .map((entry) => ({ candidateId: entry.candidateId, extra: `score ${entry.score}/100` }));

      return `Recommended candidates for ${job.title}:\n\n${summarizePipelineCandidates(entries, allCandidates)}`;
    }

    if (/\binterview feedback summary\b/.test(lower)) {
      const pending = interviewScheduler.list().find((interview) => interview.feedback && !interview.feedback.summary);

      if (!pending) {
        return "There's no recorded interview feedback awaiting a summary right now.";
      }

      const updated = await interviewScheduler.generateFeedbackSummary(pending.interviewId);
      return `Feedback summary for the ${updated.type} interview:\n\n${updated.feedback?.summary ?? ""}\n\nRecommendation: ${updated.feedback?.recommendation ?? ""}`;
    }

    if (/\bhiring funnel\b/.test(lower)) {
      const titleFragment = detectJobTitleFragment(question);
      const job = titleFragment ? jobService.findByTitleFragment(titleFragment)[0] : undefined;

      const pipelineCandidates = job ? pipelineService.list(job.jobId) : pipelineService.listAll();
      const analytics = computeAnalytics(pipelineCandidates, job?.jobId ?? null);

      return `Hiring funnel${job ? ` for ${job.title}` : " (all jobs)"}:\n\n${analytics.hiringFunnel.map((entry) => `${entry.stage}: ${entry.count}`).join("\n")}`;
    }

    return "Tell me what to check — top candidates in a skill, who's ready for HR, who's waiting longest, a job-specific recommendation, an interview feedback summary, or the hiring funnel.";
  } catch (error) {
    return `That recruitment pipeline action couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

// Phase 14 Milestone 1 — additive only, same "detect intent, call the
// real service, fold the result into context" pattern Milestones 4-9
// established. Unlike every other branch here, this one is never opted
// into by a client-sent flag — organizationRequestContext is populated
// automatically by /api/ai/chat/route.ts whenever the requester is
// logged in with an active organization (design decision 9), so it is
// checked first in execute() below. Backed by real activity_logs data.

function detectActivitySince(question: string): string | undefined {
  const lower = question.toLowerCase();
  const start = new Date();

  if (/\byesterday\b/.test(lower)) {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }

  if (/\btoday\b/.test(lower)) {
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }

  if (/\bthis week\b/.test(lower)) {
    start.setDate(start.getDate() - 7);
    return start.toISOString();
  }

  return undefined;
}

function detectActivityType(question: string): ActivityType | null {
  const lower = question.toLowerCase();
  return ACTIVITY_TYPES.find((type) => lower.includes(type.toLowerCase())) ?? null;
}

async function describeActivityEntry(entry: ActivityLogEntry): Promise<string> {
  const who = entry.user_id ? (await resolveEmail(entry.user_id)) ?? entry.user_id.slice(0, 8) : "someone";
  return `${entry.activity_type} by ${who} — ${entry.description} (${new Date(entry.created_at).toLocaleString()})`;
}

async function handleOrganizationMessage(organizationId: string, question: string): Promise<string> {
  const lower = question.toLowerCase();

  try {
    if (/\bwho (uploaded|created|scheduled|generated|optimized|rewrote|imported|added)\b/.test(lower)) {
      const activityType = detectActivityType(question);
      const entries = await activityService.list({ organizationId, activityType: activityType ?? undefined, limit: 1 });

      if (entries.length === 0) {
        return "I couldn't find a matching activity log entry for that.";
      }

      return await describeActivityEntry(entries[0]);
    }

    if (/\bhiring activity\b/.test(lower)) {
      const hiringTypes: ActivityType[] = ["Candidate Added", "Job Created", "Interview Scheduled"];
      const entries = (
        await Promise.all(hiringTypes.map((type) => activityService.list({ organizationId, activityType: type, limit: 10 })))
      )
        .flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

      if (entries.length === 0) return "No hiring activity recorded yet.";

      const lines = await Promise.all(entries.map(describeActivityEntry));
      return `Recent hiring activity:\n\n${lines.join("\n")}`;
    }

    if (/\bactivity\b/.test(lower)) {
      const since = detectActivitySince(question);
      const entries = await activityService.list({ organizationId, since, limit: 10 });

      if (entries.length === 0) return "No activity recorded in that period.";

      const lines = await Promise.all(entries.map(describeActivityEntry));
      return `Activity:\n\n${lines.join("\n")}`;
    }

    return 'Tell me what to check — who uploaded/created something, recent hiring activity, or activity in a time period (e.g. "show activity yesterday").';
  } catch (error) {
    return `That organization activity lookup couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

const ORGANIZATION_INTENT_PATTERN =
  /\bwho (uploaded|created|scheduled|generated|optimized|rewrote|imported|added)\b|\bhiring activity\b|\bshow.*\bactivity\b|\brecent activity\b/i;

// Phase 14 Milestone 2 — additive only, same "detect intent, call the
// real service, fold the result into context" pattern as the
// organization branch above. Checked first (like the organization
// branch), gated by authRequestContext instead of organizationRequestContext
// so it works for a logged-in user with no organization yet.

async function handleAuthMessage(userId: string, question: string): Promise<string> {
  const lower = question.toLowerCase();

  try {
    if (/\bwhich organizations?\b|\bwhat organizations?\b|\bmy organizations?\b/.test(lower)) {
      const memberships = await listMyOrganizations();

      if (memberships.length === 0) {
        return "You aren't a member of any organization yet.";
      }

      return `You're a member of ${memberships.length} organization(s):\n\n${memberships
        .map(({ organization, role }) => `${organization.name} (${role})`)
        .join("\n")}`;
    }

    if (/\blast (log ?in|sign ?in)\b|\bwhen did i (log|sign) ?in\b/.test(lower)) {
      const sessions = await authSessionService.list(userId, null);

      if (sessions.length === 0) {
        return "I don't have any recorded logins for your account yet.";
      }

      return `Your most recent login was ${new Date(sessions[0].created_at).toLocaleString()} from ${sessions[0].ip_address ?? "an unknown IP"}.`;
    }

    if (/\b(active|my) sessions?\b|\bsigned in\b|\blogged in\b.*\bdevices?\b/.test(lower)) {
      const sessions = await authSessionService.list(userId, null);

      if (sessions.length === 0) {
        return "You have no active sessions recorded.";
      }

      return `You have ${sessions.length} active session(s):\n\n${sessions
        .slice(0, 10)
        .map((session) => `${session.ip_address ?? "Unknown IP"} — ${session.user_agent ?? "unknown device"} (last active ${new Date(session.last_seen_at).toLocaleString()})`)
        .join("\n")}`;
    }

    if (/\bsecurity activity\b|\bsecurity events?\b|\baudit\b/.test(lower)) {
      const events = await auditAuth.list(userId, 10);

      if (events.length === 0) {
        return "No security activity recorded yet.";
      }

      return `Recent security activity:\n\n${events.map((event) => `${event.action} — ${new Date(event.created_at).toLocaleString()}`).join("\n")}`;
    }

    return "Tell me what to check — your active sessions, when you last logged in, recent security activity, or which organizations you're part of.";
  } catch (error) {
    return `That account lookup couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

const AUTH_INTENT_PATTERN =
  /\b(active|my) sessions?\b|\blast (log ?in|sign ?in)\b|\bwhen did i (log|sign) ?in\b|\bsecurity activity\b|\bsecurity events?\b|\bwhich organizations?\b|\bwhat organizations?\b|\bmy organizations?\b/i;

// Phase 14 Milestone 3 — additive only, same "detect intent, call the
// real service, fold the result into context" pattern as the auth and
// organization branches above. Reuses organizationRequestContext
// directly (no new AsyncLocalStorage) since billing is organization-
// scoped by design (Milestone 3 decision 1).

function detectPlanKeyMention(question: string): PlanKey | null {
  const lower = question.toLowerCase();
  return PLAN_KEYS.find((key) => lower.includes(key) || lower.includes(PLAN_DEFINITIONS[key].name.toLowerCase())) ?? null;
}

function detectFeatureMention(question: string): FeatureKey | null {
  const lower = question.toLowerCase();
  if (/\bresume rewrit/.test(lower)) return "resume_rewrite";
  if (/\bresume upload|\bupload.*resume|\bparsing\b/.test(lower)) return "resume_upload";
  if (/\bjd match|\bjob description match/.test(lower)) return "jd_match";
  if (/\bats report|\bats score/.test(lower)) return "ats_report";
  if (/\bmock interview/.test(lower)) return "mock_interview";
  if (/\bknowledge upload/.test(lower)) return "knowledge_upload";
  if (/\bchat\b/.test(lower)) return "ai_chat";
  return null;
}

// Phase 14 Milestone 4 — mirrors detectFeatureMention() above but matches
// against usage-schema.ts's UsageFeatureKey set (the per-operation
// attribution keys usage-service.getSummary() groups by), not
// billing-schema.ts's request-count FeatureKey set — the two enums
// don't share casing or membership.
function detectUsageFeatureMention(question: string): UsageFeatureKey | null {
  const lower = question.toLowerCase();
  if (/\bresume rewrit/.test(lower)) return "RESUME_REWRITE";
  if (/\bresume analys/.test(lower)) return "RESUME_ANALYSIS";
  if (/\bresume upload|\bresume pars/.test(lower)) return "RESUME_PARSER";
  if (/\bats\b/.test(lower)) return "ATS_ANALYSIS";
  if (/\bjd match|\bjob description match/.test(lower)) return "JD_MATCHING";
  if (/\bmock interview/.test(lower)) return "MOCK_INTERVIEW";
  if (/\binterview evaluat/.test(lower)) return "INTERVIEW_EVALUATION";
  if (/\binterview (generation|prep)/.test(lower)) return "INTERVIEW_GENERATION";
  if (/\bknowledge upload|\bknowledge ingest/.test(lower)) return "KNOWLEDGE_INGESTION";
  if (/\bknowledge search|\brag\b/.test(lower)) return "KNOWLEDGE_SEARCH";
  if (/\bresearch agent/.test(lower)) return "MULTI_AGENT_RESEARCH";
  if (/\breview(er)? agent/.test(lower)) return "MULTI_AGENT_REVIEW";
  if (/\bsummar(y|izer) agent/.test(lower)) return "MULTI_AGENT_SUMMARY";
  if (/\bchat\b/.test(lower)) return "AI_CHAT";
  return null;
}

async function handleBillingMessage(organizationId: string, question: string): Promise<string> {
  const lower = question.toLowerCase();

  try {
    // Phase 14 Milestone 4 — "how many AI credits did my resume analysis
    // use" / "how much AI usage did I have this month" / "which feature
    // uses the most credits" are answered from real per-operation
    // records (usage-service.getSummary()), distinct from the plain
    // "how many credits do I have" balance check below.
    if (/\bwhich feature\b.*\bmost\b|\bmost\b.*\bcredits?\b/.test(lower)) {
      const summary = await getUsageSummary(organizationId, 30);

      if (summary.byFeature.length === 0) {
        return "No AI usage recorded yet this month.";
      }

      const top = [...summary.byFeature].sort((a, b) => b.credits - a.credits)[0];
      return `${top.feature.replace(/_/g, " ")} uses the most AI credits this month: ${top.credits} credits across ${top.operations} operations.`;
    }

    const usageFeatureMention = detectUsageFeatureMention(question);

    if (usageFeatureMention && /\bused?\b|\bcost\b|\bconsum/.test(lower)) {
      const summary = await getUsageSummary(organizationId, 30);
      const match = summary.byFeature.find((row) => row.feature === usageFeatureMention);

      if (!match) {
        return `No recorded AI usage for ${usageFeatureMention.replace(/_/g, " ")} this month.`;
      }

      return `${usageFeatureMention.replace(/_/g, " ")} has used ${match.credits} AI credits across ${match.operations} operation(s) this month.`;
    }

    if (/\bhow much\b.*\busage\b|\busage\b.*\bmonth\b|\btotal.*usage\b/.test(lower)) {
      const summary = await getUsageSummary(organizationId, 30);
      return `You've used ${summary.totalCreditsUsed} AI credits this month across ${summary.byFeature.reduce((sum, row) => sum + row.operations, 0)} operations. See the full breakdown at /billing/usage.`;
    }

    if (/\bcredits?\b/.test(lower) && /\bhow many\b|\bremaining\b|\bleft\b/.test(lower)) {
      const [balances, aiBalance] = await Promise.all([listCreditBalances(organizationId), getAiCreditBalance(organizationId)]);

      const aiPoolLine =
        aiBalance.monthlyLimit === null
          ? "AI credit pool: unlimited"
          : `AI credit pool: ${aiBalance.remaining} of ${aiBalance.monthlyLimit} credits remaining this month`;

      return `${aiPoolLine}\n\nPer-feature limits this month:\n${balances
        .map((balance) => `${balance.featureKey.replace(/_/g, " ")}: ${balance.limit === null ? "Unlimited" : `${balance.remaining}/${balance.limit}`}`)
        .join("\n")}`;
    }

    const mentionedPlan = detectPlanKeyMention(question);

    if (mentionedPlan && /\bfeatures?\b|\binclud/.test(lower)) {
      const plan = PLAN_DEFINITIONS[mentionedPlan];
      return `${plan.name} plan includes:\n\n${Object.entries(plan.limits)
        .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value === null ? "Unlimited" : value}`)
        .join("\n")}\nPriority Support: ${plan.priority_support ? "Yes" : "No"}\nAPI Access: ${plan.api_access ? "Yes" : "No"}`;
    }

    if (/\bwhy can'?t i\b|\bwhy am i unable\b|\bblocked\b|\blimit reached\b/.test(lower)) {
      const featureKey = detectFeatureMention(question) ?? "resume_upload";
      const balance = await getCreditBalance(organizationId, featureKey);

      if (balance.limit === null || (balance.remaining ?? 0) > 0) {
        return `You still have ${balance.remaining ?? "unlimited"} ${featureKey.replace(/_/g, " ")} credits remaining this month — if you're seeing a block, it may be a different limit. Check /billing for your full credit breakdown.`;
      }

      return `You've used all ${balance.limit} of your monthly ${featureKey.replace(/_/g, " ")} credits (resets next month). Upgrade your plan at /billing/plans for a higher limit.`;
    }

    if (/\bupgrade\b.*\bplan\b|\bplan\b.*\bupgrade\b/.test(lower)) {
      const subscription = await getActiveSubscription(organizationId);
      return `You're currently on the ${subscription.plan.name} plan. Compare plans and upgrade at /billing/plans.`;
    }

    if (/\bmy invoice\b|\bshow.*invoice\b|\blatest invoice\b/.test(lower)) {
      const invoices = await billingInvoiceService.list(organizationId, 1);

      if (invoices.length === 0) {
        return "You don't have any invoices yet.";
      }

      const invoice = invoices[0];
      return `Your most recent invoice (${invoice.invoice_number}): ${(invoice.amount_cents / 100).toFixed(2)} ${invoice.currency.toUpperCase()}, status: ${invoice.status}, dated ${new Date(invoice.created_at).toLocaleDateString()}. Download it at /billing/invoices.`;
    }

    return "Tell me what to check — your remaining AI credits, what a plan includes, why a feature is blocked, or your latest invoice.";
  } catch (error) {
    return `That billing lookup couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

const BILLING_INTENT_PATTERN =
  /\bcredits?\b|\bupgrade\b.*\bplan\b|\bplan\b.*\bupgrade\b|\bwhy can'?t i\b|\bmy invoice\b|\bshow.*invoice\b|\blatest invoice\b|\bplan.*(features?|includ)/i;

export class ResumeTool implements AITool {
  name = "resume-tool";

  description = "Questions about an uploaded resume's ATS score, skill gaps, or analysis, or Zafrul's own resume/CV";

  keywords = [
    "resume",
    "cv",
    "ats",
    "ats score",
    "skill gap",
    "skills gap",
    "missing skills",
    "career level",
    "suitable role",
  ];

  priority = 100;

  async execute(question: string): Promise<ToolResponse<RagToolResult>> {
    const authUserId = authRequestContext.getStore()?.userId;

    if (authUserId && AUTH_INTENT_PATTERN.test(question)) {
      const context = await handleAuthMessage(authUserId, question);

      return {
        success: true,
        tool: this.name,
        result: { context, chunks: [] },
      };
    }

    const organizationId = organizationRequestContext.getStore()?.organizationId;

    if (organizationId && BILLING_INTENT_PATTERN.test(question)) {
      const context = await handleBillingMessage(organizationId, question);

      return {
        success: true,
        tool: this.name,
        result: { context, chunks: [] },
      };
    }

    if (organizationId && ORGANIZATION_INTENT_PATTERN.test(question)) {
      const context = await handleOrganizationMessage(organizationId, question);

      return {
        success: true,
        tool: this.name,
        result: { context, chunks: [] },
      };
    }

    const recruitmentActive = recruitmentRequestContext.getStore()?.active;

    if (recruitmentActive) {
      const context = await handleRecruitmentMessage(question);

      return {
        success: true,
        tool: this.name,
        result: { context, chunks: [] },
      };
    }

    const recruiterStore = recruiterRequestContext.getStore();

    if (recruiterStore?.active) {
      const context = recruiterStore.recruiterId
        ? await handleRecruiterMessage(question, recruiterStore.recruiterId)
        : "Sign in as a recruiter to use the Recruiter Workspace assistant.";

      return {
        success: true,
        tool: this.name,
        result: { context, chunks: [] },
      };
    }

    const activeLinkedinId = linkedinRequestContext.getStore()?.linkedinId;

    if (activeLinkedinId) {
      const context = await handleLinkedinMessage(activeLinkedinId, question);

      return {
        success: true,
        tool: this.name,
        result: { context, chunks: [] },
      };
    }

    const activeCoverLetterId = coverRequestContext.getStore()?.coverLetterId;

    if (activeCoverLetterId) {
      const context = await handleCoverMessage(activeCoverLetterId, question);

      return {
        success: true,
        tool: this.name,
        result: { context, chunks: [] },
      };
    }

    const activeRewriteId = rewriteRequestContext.getStore()?.rewriteId;

    if (activeRewriteId) {
      const context = await handleRewriteMessage(activeRewriteId, question);

      return {
        success: true,
        tool: this.name,
        result: { context, chunks: [] },
      };
    }

    const activeResumeId = resumeRequestContext.getStore()?.resumeId;
    const record = activeResumeId ? resumeService.get(activeResumeId) : undefined;

    if (record) {
      const activeJdMatchId = jdMatchRequestContext.getStore()?.jdMatchId;
      const jdMatchRecord = activeJdMatchId ? jdMatchService.get(activeJdMatchId) : undefined;

      const activePrepId = interviewPrepRequestContext.getStore()?.prepId;
      const prepRecord = activePrepId ? prepService.get(activePrepId) : undefined;

      const activeSessionId = mockInterviewRequestContext.getStore()?.sessionId;
      const sessionRecord = activeSessionId ? sessionService.get(activeSessionId) : undefined;

      let context = buildResumeContext(record);
      if (jdMatchRecord) context += `\n${buildJdMatchContext(jdMatchRecord)}`;
      if (prepRecord) context += `\n${buildInterviewPrepContext(prepRecord)}`;
      if (sessionRecord) context += `\n${buildMockInterviewContext(sessionRecord)}`;

      return {
        success: true,
        tool: this.name,
        result: {
          context,
          chunks: [],
        },
      };
    }

    // No uploaded resume in context for this request — preserve the
    // pre-existing behavior for "resume" intent questions about Zafrul's
    // own resume/CV (a "resume" rag_documents entry, searched like any
    // other knowledge-base question).
    const fallback = await ragKnowledge.search(question);

    return {
      success: true,
      tool: this.name,
      result: {
        context: fallback.context,
        chunks: fallback.chunks,
      },
    };
  }
}

export const resumeTool = new ResumeTool();
