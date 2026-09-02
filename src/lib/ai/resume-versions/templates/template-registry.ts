import { TemplateDefinition, TemplateId, TEMPLATE_IDS } from "./template-schema";

// Eight distinct, original layouts (not a copy of any third-party
// product's UI/assets/branding) — the original five (modern/executive/
// classic/minimal/technical) plus a GCC-focused sixth (Phase 15
// Milestone 4), plus Graduate/Academic (Phase 25 Milestone 1) to reach
// the full 8-category spread. "technical" is the one two-column
// (sidebar) layout; every other template is single-column, the safer
// default for ATS compatibility.

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
    category: "MODERN",
    experienceLevels: ["entry", "mid", "senior"],
    industries: ["general"],
    isOnePage: false,
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
    category: "EXECUTIVE",
    experienceLevels: ["senior", "executive"],
    industries: ["general"],
    isOnePage: false,
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
    category: "ATS_CLASSIC",
    experienceLevels: ["entry", "mid", "senior", "executive"],
    industries: ["general"],
    isOnePage: false,
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
    category: "PROFESSIONAL",
    experienceLevels: ["entry", "mid", "senior"],
    industries: ["general"],
    isOnePage: true,
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
    category: "TECH",
    experienceLevels: ["entry", "mid", "senior"],
    industries: ["technology"],
    isOnePage: false,
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
    category: "GCC_PROFESSIONAL",
    experienceLevels: ["mid", "senior", "executive"],
    industries: ["gcc"],
    isOnePage: false,
  },
  // Phase 25 Milestone 1 — a seventh, entry-level-oriented layout.
  // Same generic single-column renderer as every other template here;
  // its distinction from "modern"/"minimal" is entirely in metadata
  // (category/experienceLevels) and default styling, matching the
  // pattern every prior template already established — no new
  // rendering code needed.
  // Phase 25 Milestone 2 — genuine defect fix: headerAlign was
  // originally "left", making Graduate's (layout, headerAlign,
  // sectionHeadingStyle) triple byte-identical to "minimal"'s — the
  // ONLY template-intrinsic, structural differentiators this system
  // has (see TemplateDefinition's own JSDoc). Since defaultAccent/
  // defaultFont are never auto-applied on template selection and the
  // gallery's own preview cards render every card using the currently-
  // active accent/font (not each template's default), the two
  // templates were genuinely indistinguishable in the gallery and in
  // actual rendered output — failing this milestone's explicit "do
  // Graduate/Academic genuinely look different" check. headerAlign
  // changed to "center" (fits the template's own "front and center"
  // framing); the resulting (single-column, center, plain-caps) triple
  // is unique across all 8 templates.
  graduate: {
    id: "graduate",
    name: "Graduate",
    description: "A clean, encouraging layout that puts Education, Projects, and Certifications front and center — built for students and recent graduates with limited work history.",
    layout: "single-column",
    recommendedFor: "Students, recent graduates, and career starters",
    defaultAccent: "blue",
    defaultFont: "inter",
    atsFriendliness: "high",
    headerAlign: "center",
    sectionHeadingStyle: "plain-caps",
    category: "GRADUATE",
    experienceLevels: ["entry"],
    industries: ["general"],
    isOnePage: true,
  },
  // Phase 25 Milestone 1 — an eighth, academic/research-oriented
  // layout. Same generic single-column renderer as every other
  // template; distinguished by metadata/default styling only.
  academic: {
    id: "academic",
    name: "Academic",
    description: "A formal, research-oriented layout with a centered header — built for CVs emphasizing Publications, Awards, and Education over corporate work history.",
    layout: "single-column",
    recommendedFor: "Academic, research, and teaching positions",
    defaultAccent: "navy",
    defaultFont: "georgia",
    atsFriendliness: "high",
    headerAlign: "center",
    sectionHeadingStyle: "underline",
    category: "ACADEMIC",
    experienceLevels: ["mid", "senior", "executive"],
    industries: ["academic"],
    isOnePage: false,
  },
};

export const TEMPLATE_LIST: TemplateDefinition[] = TEMPLATE_IDS.map((id) => TEMPLATE_REGISTRY[id]);

export function getTemplateDefinition(id: TemplateId): TemplateDefinition {
  return TEMPLATE_REGISTRY[id];
}

/** Every filter is optional and independently AND-combined — an unset filter never excludes anything. Pure and synchronous so the Template Gallery's filter bar (and its tests) never need a component-testing framework to exercise this logic. */
export interface TemplateFilters {
  category?: TemplateDefinition["category"];
  atsOnly?: boolean;
  onePageOnly?: boolean;
}

export function filterTemplates(templates: TemplateDefinition[], filters: TemplateFilters): TemplateDefinition[] {
  return templates.filter((template) => {
    if (filters.category && template.category !== filters.category) return false;
    if (filters.atsOnly && template.atsFriendliness !== "high") return false;
    if (filters.onePageOnly && !template.isOnePage) return false;
    return true;
  });
}
