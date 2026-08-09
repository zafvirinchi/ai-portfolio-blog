import {
  ProjectItemRewrite,
  RejectedItem,
  RewriteSection,
  RewriteStyle,
  SkillCategoryGroup,
  TextItemRewrite,
  TextVariant,
  VariantVersion,
} from "./rewrite-schema";

export interface RewriteSectionRequest {
  section: RewriteSection;
  style: RewriteStyle;
  targetContext?: string;
}

export interface SectionActionRequest {
  action: "accept" | "reject" | "restore";
  /** Which variant to accept — for summary/careerObjective/bullet/certifications (single-target rewrites). */
  variantVersion?: VariantVersion;
  /** Which variant to accept per item — for experience/projects/achievements (bulk, per-item rewrites). Items without a selection default to variant "A". */
  itemSelections?: { itemIndex: number; version: VariantVersion }[];
  /** Which version to revert to — for "restore". */
  versionIndex?: number;
}

/**
 * The last rewrite call's result for one section, held until the user
 * accepts or rejects it. Exactly one of variants/items/projectItems/
 * skillCategories is populated, depending on the section's shape.
 */
export interface PendingSectionRewrite {
  section: RewriteSection;
  style: RewriteStyle;
  targetContext: string | null;
  /** Set only when `variants` came from a single-item rewrite (bullet-rewriter.ts) rather than a whole-section rewrite — identifies which index in the section's `current` array these variants are for, so the UI can diff against the right original. */
  itemIndex?: number;
  /** summary, careerObjective, bullet, certifications (per-cert). */
  variants?: TextVariant[];
  /** experience, achievements — one entry (with its own variants) per original bullet. */
  items?: TextItemRewrite[];
  /** projects — one entry (with its own variants) per original project. */
  projectItems?: ProjectItemRewrite[];
  /** skills — a single categorization result, no variants. */
  skillCategories?: SkillCategoryGroup[];
  rejectedItems: RejectedItem[];
  createdAt: string;
}

export interface SectionVersionEntry {
  /** Flattened, one string per line/item/category — the universal storage shape every section normalizes to once accepted, so history/diff/export can treat every section uniformly. */
  value: string[];
  label: string;
  createdAt: string;
}

export interface SectionState {
  section: RewriteSection;
  /** The current accepted content — versions[0] is always the untouched original. */
  current: string[];
  versions: SectionVersionEntry[];
  pending: PendingSectionRewrite | null;
}

export interface WholeResumeSnapshot {
  summary: string[];
  experience: string[];
  projects: string[];
  skills: string[];
  achievements: string[];
}

export interface WholeResumeVersionEntry {
  value: WholeResumeSnapshot;
  style: RewriteStyle;
  targetContext: string | null;
  improvementNotes: string[];
  createdAt: string;
}

export interface RewriteRecord {
  rewriteId: string;
  resumeId: string;
  sections: Partial<Record<RewriteSection, SectionState>>;
  wholeResumeVersions: WholeResumeVersionEntry[];
  createdAt: string;
  updatedAt: string;
}
