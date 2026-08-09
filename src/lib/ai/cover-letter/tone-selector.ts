import { CoverLetterLength, CoverLetterStyle } from "./cover-schema";

// Shared prompt fragments every generator (cover-generator.ts,
// email-generator.ts, application-generator.ts) draws from — keeps
// tone/length consistent across the letter, email, and LinkedIn calls.

export const STYLE_DESCRIPTIONS: Record<CoverLetterStyle, string> = {
  Recruiter: "Keyword-dense and scannable, optimized for a recruiter doing a fast first read.",
  Professional: "Clear, polished, and neutral — broadly appropriate corporate tone.",
  Executive: "Concise and outcome-led, written for a senior audience skimming for impact.",
  Startup: "Energetic and direct, emphasizes range, speed, and ownership.",
  FAANG: "Direct, metrics-forward, action-verb-led — the terse style big tech applications favor.",
  Consulting: "Structured around problem-solution-impact, client/stakeholder-facing framing.",
  Banking: "Formal, precise, and risk-aware — conservative tone appropriate for financial services.",
  AI: "Technically fluent, emphasizes applied AI/ML experience and measurable outcomes.",
  Healthcare: "Careful and compliance-aware, emphasizes reliability and patient/data-safety framing where genuinely relevant.",
  Government: "Formal and process-oriented, structured accomplishment framing — never claims a clearance or certification the resume doesn't state.",
};

export const LENGTH_GUIDES: Record<CoverLetterLength, { targetWords: number; paragraphGuidance: string }> = {
  Short: {
    targetWords: 150,
    paragraphGuidance:
      "3 short paragraphs: opening, one combined why-company/why-candidate paragraph, closing with a call to action.",
  },
  Standard: {
    targetWords: 300,
    paragraphGuidance:
      "4-5 paragraphs: opening, why company, why candidate plus relevant experience, closing with a call to action.",
  },
  Executive: {
    targetWords: 500,
    paragraphGuidance:
      "5-6 paragraphs: opening, why company, why candidate, relevant experience and projects, business impact, closing with a call to action.",
  },
};
