import { ResumeLanguage } from "../resume-schema";
import { LanguageProficiencyLevel, NormalizedLanguage } from "./parser-types";

const LANGUAGE_ALIASES: Record<string, string> = {
  english: "English",
  hindi: "Hindi",
  arabic: "Arabic",
  spanish: "Spanish",
  french: "French",
  german: "German",
  mandarin: "Mandarin",
  chinese: "Mandarin",
  japanese: "Japanese",
  korean: "Korean",
  portuguese: "Portuguese",
  russian: "Russian",
  italian: "Italian",
  tamil: "Tamil",
  telugu: "Telugu",
  kannada: "Kannada",
  malayalam: "Malayalam",
  bengali: "Bengali",
  marathi: "Marathi",
  gujarati: "Gujarati",
  punjabi: "Punjabi",
  urdu: "Urdu",
};

const PROFICIENCY_ALIASES: { pattern: RegExp; level: LanguageProficiencyLevel }[] = [
  { pattern: /native|mother tongue|first language/i, level: "Native" },
  { pattern: /fluent|professional|full professional/i, level: "Professional" },
  { pattern: /conversational|intermediate|working proficiency/i, level: "Intermediate" },
  { pattern: /basic|beginner|elementary/i, level: "Beginner" },
];

function normalizeLanguageName(language: string): string {
  const key = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[key] ?? language.trim();
}

function normalizeProficiency(proficiency: string | null): LanguageProficiencyLevel | null {
  if (!proficiency) return null;
  const match = PROFICIENCY_ALIASES.find((entry) => entry.pattern.test(proficiency));
  return match?.level ?? null;
}

export function normalizeLanguages(entries: ResumeLanguage[]): NormalizedLanguage[] {
  return entries.map((entry) => ({
    language: normalizeLanguageName(entry.language),
    proficiency: normalizeProficiency(entry.proficiency),
  }));
}
