import { TemplateDefinition, TemplateId, TEMPLATE_IDS } from "./template-schema";

// Five distinct, original layouts (not a copy of any third-party
// product's UI/assets/branding) — chosen to cover the milestone's
// requested range (modern/executive/classic/minimal/technical) without
// diluting quality across a sixth. "technical" is the one two-column
// (sidebar) layout, satisfying §20's optional two-column requirement;
// the other four are single-column, which the milestone itself
// recommends as the safer default for ATS compatibility.

export const TEMPLATE_REGISTRY: Record<TemplateId, TemplateDefinition> = {
  modern: {
    id: "modern",
    name: "Modern",
    description: "Strong name header, clean section hierarchy, a subtle accent, and generous whitespace. A safe, contemporary default for most roles.",
    layout: "single-column",
    recommendedFor: "Most professionals — a versatile, contemporary default",
    defaultAccent: "blue",
    defaultFont: "inter",
    atsFriendliness: "high",
    headerAlign: "left",
    sectionHeadingStyle: "accent-left-border",
  },
  executive: {
    id: "executive",
    name: "Executive",
    description: "A premium, restrained layout with a centered header and strong typographic hierarchy — built for leadership and achievements to read first.",
    layout: "single-column",
    recommendedFor: "Senior, lead, architect, and executive roles",
    defaultAccent: "navy",
    defaultFont: "georgia",
    atsFriendliness: "high",
    headerAlign: "center",
    sectionHeadingStyle: "centered-divider",
  },
  classic: {
    id: "classic",
    name: "Classic",
    description: "Traditional corporate formatting with minimal decoration — the most conservative, ATS-tested layout available.",
    layout: "single-column",
    recommendedFor: "Conservative industries and traditional corporate applications",
    defaultAccent: "black",
    defaultFont: "times",
    atsFriendliness: "high",
    headerAlign: "left",
    sectionHeadingStyle: "underline",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Clean and compact with tighter spacing and high information density — ideal for keeping a resume to one or two pages.",
    layout: "single-column",
    recommendedFor: "Concise, high-density 1–2 page resumes",
    defaultAccent: "gray",
    defaultFont: "helvetica",
    atsFriendliness: "high",
    headerAlign: "left",
    sectionHeadingStyle: "plain-caps",
  },
  technical: {
    id: "technical",
    name: "Technical",
    description: "A two-column layout that puts Skills, Languages, Certifications, and Education in a sidebar so technical strengths are easy to scan at a glance.",
    layout: "sidebar",
    recommendedFor: "Software engineers and other technical roles",
    defaultAccent: "blue",
    defaultFont: "inter",
    atsFriendliness: "medium",
    sidebarSectionTypes: ["SKILLS", "LANGUAGES", "CERTIFICATIONS", "EDUCATION", "INTERESTS", "TRAINING", "COURSES"],
    headerAlign: "left",
    sectionHeadingStyle: "accent-left-border",
  },
  // Phase 15 Milestone 4 — a sixth, conservative single-column layout
  // for GCC/Middle East (UAE, Saudi Arabia, Qatar, Oman, Kuwait,
  // Bahrain) applications. Not an official style of any named company
  // or product — an original, application-oriented layout, like every
  // other template here.
  gcc: {
    id: "gcc",
    name: "GCC Professional",
    description: "A conservative, single-column layout with a clean contact line and strong emphasis on experience — formatted for GCC/Middle East recruiter expectations.",
    layout: "single-column",
    recommendedFor: "UAE, Saudi Arabia, Qatar, Oman, Kuwait, and Bahrain applications",
    defaultAccent: "green",
    defaultFont: "arial",
    atsFriendliness: "high",
    headerAlign: "left",
    sectionHeadingStyle: "underline",
  },
};

export const TEMPLATE_LIST: TemplateDefinition[] = TEMPLATE_IDS.map((id) => TEMPLATE_REGISTRY[id]);

export function getTemplateDefinition(id: TemplateId): TemplateDefinition {
  return TEMPLATE_REGISTRY[id];
}
