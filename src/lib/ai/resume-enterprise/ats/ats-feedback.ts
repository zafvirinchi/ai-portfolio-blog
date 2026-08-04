import { EnterpriseResume } from "../resume-schema";
import { AtsAchievementFinding, AtsBuzzwordFinding, AtsFeedbackItem, AtsInsights, AtsSectionScore } from "./ats-schema";
import {
  collectAllFreeText,
  collectExperienceText,
  collectProjectText,
  FEEDBACK_RULES,
  findAchievementMatches,
  findWeakPhraseOccurrences,
  WEAK_PHRASES,
} from "./ats-rules";

// Phase 12 Milestone 3. Buzzword/achievement detection, the prioritized
// feedback list, and the derived "insights" summary — the last stage
// before ats-engine.ts assembles the full AtsReport.

export function detectBuzzwords(resume: EnterpriseResume): AtsBuzzwordFinding[] {
  const occurrences = findWeakPhraseOccurrences(collectAllFreeText(resume));

  return occurrences.map((entry) => {
    const rule = WEAK_PHRASES.find((weakPhrase) => weakPhrase.phrase === entry.phrase);

    return {
      phrase: entry.phrase,
      occurrences: entry.occurrences,
      suggestedReplacements: rule?.replacements ?? [],
    };
  });
}

export function detectAchievements(resume: EnterpriseResume): AtsAchievementFinding[] {
  const texts = [...collectExperienceText(resume), ...collectProjectText(resume), ...resume.achievements];
  return findAchievementMatches(texts);
}

export function buildFeedback(resume: EnterpriseResume): AtsFeedbackItem[] {
  return FEEDBACK_RULES.filter((rule) => rule.appliesTo(resume)).map((rule) => ({
    id: rule.id,
    section: rule.section,
    message: rule.message,
    priority: rule.priority,
    impact: rule.impact,
    quickFix: rule.quickFix,
  }));
}

export function buildInsights(sections: AtsSectionScore[], feedback: AtsFeedbackItem[]): AtsInsights {
  const topStrengths = [...sections]
    .filter((section) => section.status === "Excellent" || section.status === "Good")
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3)
    .map((section) => `${section.label} is ${section.status.toLowerCase()} (${section.percentage}%).`);

  const topWeaknesses = [...sections]
    .filter((section) => section.status === "Poor" || section.status === "Critical")
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 3)
    .map((section) => `${section.label} is ${section.status.toLowerCase()} (${section.percentage}%).`);

  const criticalImprovements = feedback.filter((item) => item.priority === "High").map((item) => item.message);

  const immediateFixes = [...feedback]
    .filter((item) => item.quickFix)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)
    .map((item) => item.message);

  return { topStrengths, topWeaknesses, criticalImprovements, immediateFixes };
}
