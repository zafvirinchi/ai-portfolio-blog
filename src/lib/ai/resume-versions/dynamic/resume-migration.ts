import { randomUUID } from "node:crypto";

import { Resume } from "../../resume/resume-schema";
import { OptimizedSectionsSnapshot, RewrittenSectionsSnapshot } from "../resume-version-types";

import { DYNAMIC_RESUME_SCHEMA_VERSION, DynamicResumeDocument, ResumeEntry, ResumeSection, SectionType } from "./dynamic-resume-schema";

// Phase 13 — Dynamic Resume Sections. Pure, deterministic conversion
// from the LEGACY, fixed-shape Resume (Phase 12's resume-schema.ts —
// still the live parser's output, and still what JD-matching/
// optimization/ATS scoring operate on; none of that is touched by this
// milestone) into the new sections[]-based DynamicResumeDocument. Runs
// at READ time whenever a resume_versions row has no sections_data yet
// (lazy migration) — the row's own resume_data/optimized_sections/
// rewritten_sections columns are never modified by this function.
// Only ever creates a section when the legacy data actually has
// something in it — never a meaningless empty section.

function newEntry(order: number, fields: ResumeSection["entries"][number]["fields"]): ResumeEntry {
  return { id: randomUUID(), order, visible: true, fields, hiddenFieldKeys: [], customFields: [] };
}

function newSection(type: SectionType, title: string, order: number, entries: ResumeEntry[]): ResumeSection {
  return { id: randomUUID(), type, title, order, visible: true, custom: type === "CUSTOM", entries, settings: { showTitle: true, showDivider: true } };
}

export function toDynamicResumeDocument(resume: Resume): DynamicResumeDocument {
  const sections: ResumeSection[] = [];
  let order = 0;

  if (resume.summary && resume.summary.trim()) {
    sections.push(newSection("SUMMARY", "Professional Summary", order++, [newEntry(0, { content: resume.summary })]));
  }

  if (resume.workExperience.length > 0) {
    const entries = resume.workExperience.map((job, index) =>
      newEntry(index, {
        jobTitle: job.title,
        company: job.company,
        location: job.location,
        startDate: job.startDate,
        endDate: job.endDate,
        current: job.isCurrent,
        description: null,
        achievements: job.description,
        technologies: [],
      })
    );
    sections.push(newSection("EXPERIENCE", "Experience", order++, entries));
  }

  if (resume.projects.length > 0) {
    const entries = resume.projects.map((project, index) =>
      newEntry(index, {
        projectName: project.name,
        role: null,
        description: project.description,
        technologies: project.technologies,
        url: project.url,
        startDate: null,
        endDate: null,
        achievements: [],
      })
    );
    sections.push(newSection("PROJECTS", "Projects", order++, entries));
  }

  if (resume.education.length > 0) {
    const entries = resume.education.map((entry, index) =>
      newEntry(index, {
        degree: entry.degree,
        institution: entry.institution,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        gpa: entry.gpa,
        description: null,
      })
    );
    sections.push(newSection("EDUCATION", "Education", order++, entries));
  }

  const skillGroups: { category: string; skills: string[] }[] = [];
  if (resume.skills.length > 0) skillGroups.push({ category: "Skills", skills: resume.skills });
  if (resume.technicalSkills.length > 0) skillGroups.push({ category: "Technical Skills", skills: resume.technicalSkills });
  if (resume.softSkills.length > 0) skillGroups.push({ category: "Soft Skills", skills: resume.softSkills });

  if (skillGroups.length > 0) {
    const entries = skillGroups.map((group, index) => newEntry(index, { category: group.category, skills: group.skills }));
    sections.push(newSection("SKILLS", "Skills", order++, entries));
  }

  if (resume.certifications.length > 0) {
    const entries = resume.certifications.map((cert, index) =>
      newEntry(index, {
        name: cert.name,
        issuer: cert.issuer,
        issueDate: cert.date,
        expirationDate: null,
        credentialId: null,
        credentialUrl: null,
      })
    );
    sections.push(newSection("CERTIFICATIONS", "Certifications", order++, entries));
  }

  if (resume.achievements.length > 0) {
    const entries = resume.achievements.map((item, index) => newEntry(index, { description: item }));
    sections.push(newSection("ACHIEVEMENTS", "Achievements", order++, entries));
  }

  if (resume.languages.length > 0) {
    const entries = resume.languages.map((language, index) => newEntry(index, { language, proficiency: null }));
    sections.push(newSection("LANGUAGES", "Languages", order++, entries));
  }

  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: {
      name: resume.contact.name,
      headline: null,
      email: resume.contact.email,
      phone: resume.contact.phone,
      location: resume.contact.location,
      linkedin: resume.contact.linkedin,
      github: resume.contact.github,
      website: resume.contact.website,
    },
    sections,
  };
}

/**
 * Phase 15 Milestone 2 — the inverse of toDynamicResumeDocument() above,
 * used by resume-version-service.ts's saveDynamicDocument() so that
 * EVERY builder mutation (add/edit/delete a section, entry, or field)
 * keeps the legacy resume_data column — the one ATS scoring, JD
 * matching, and the resume chat tool actually read — in sync with what
 * the user just edited. Without this, an edit made through the Resume
 * Builder would only ever be visible in the builder/preview/export, and
 * every other AI feature would keep seeing the resume as it was the
 * moment the version was created.
 *
 * Pure and deterministic — no AI call. `previousResume` supplies
 * `yearsOfExperience`, the one legacy field with no corresponding
 * section/field anywhere in the dynamic model (there is nothing to
 * derive it from, and this function must never fabricate a new value —
 * it carries the last-known one forward unchanged, same as a field the
 * builder simply doesn't expose an editor for).
 *
 * Fields the dynamic model can express but the legacy Resume schema
 * has no slot for (e.g. a Project's start/end dates, a job's free-text
 * Description, per-entry Technologies on Experience, Certification's
 * expiration/credential fields, AWARDS/PUBLICATIONS/etc. sections
 * entirely) are necessarily dropped from this derived snapshot — the
 * exact same one-directional limitation toDynamicResumeDocument()
 * already has in reverse, inherent to the legacy schema's fixed shape,
 * not something this milestone changes.
 */
export function fromDynamicResumeDocument(document: DynamicResumeDocument, previousResume: Resume): Resume {
  const sectionOfType = (type: SectionType) => document.sections.find((section) => section.type === type);
  const stringField = (value: unknown): string | null => (typeof value === "string" && value.trim().length > 0 ? value : null);
  const listField = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

  const summarySection = sectionOfType("SUMMARY");
  const summary = summarySection ? stringField(summarySection.entries[0]?.fields.content) : null;

  const workExperience = (sectionOfType("EXPERIENCE")?.entries ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      title: stringField(entry.fields.jobTitle) ?? "",
      company: stringField(entry.fields.company) ?? "",
      location: stringField(entry.fields.location),
      startDate: stringField(entry.fields.startDate),
      endDate: stringField(entry.fields.endDate),
      isCurrent: entry.fields.current === true,
      description: listField(entry.fields.achievements),
    }));

  const education = (sectionOfType("EDUCATION")?.entries ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      degree: stringField(entry.fields.degree) ?? "",
      institution: stringField(entry.fields.institution) ?? "",
      location: stringField(entry.fields.location),
      startDate: stringField(entry.fields.startDate),
      endDate: stringField(entry.fields.endDate),
      gpa: stringField(entry.fields.gpa),
    }));

  const projects = (sectionOfType("PROJECTS")?.entries ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      name: stringField(entry.fields.projectName) ?? "",
      description: stringField(entry.fields.description),
      technologies: listField(entry.fields.technologies),
      url: stringField(entry.fields.url),
    }));

  const certifications = (sectionOfType("CERTIFICATIONS")?.entries ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      name: stringField(entry.fields.name) ?? "",
      issuer: stringField(entry.fields.issuer),
      date: stringField(entry.fields.issueDate),
    }));

  const achievements = (sectionOfType("ACHIEVEMENTS")?.entries ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => stringField(entry.fields.description))
    .filter((value): value is string => value !== null);

  const languages = (sectionOfType("LANGUAGES")?.entries ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => stringField(entry.fields.language))
    .filter((value): value is string => value !== null);

  // Skill groups are matched back to their legacy bucket by category
  // name (the same names toDynamicResumeDocument() assigns); any group
  // renamed or newly added by the user in the builder — including the
  // default "Skills" category — folds into the general `skills` array
  // rather than being silently dropped.
  const skills: string[] = [];
  const technicalSkills: string[] = [];
  const softSkills: string[] = [];
  for (const entry of sectionOfType("SKILLS")?.entries ?? []) {
    const category = stringField(entry.fields.category)?.toLowerCase() ?? "";
    const values = listField(entry.fields.skills);
    if (category === "technical skills") technicalSkills.push(...values);
    else if (category === "soft skills") softSkills.push(...values);
    else skills.push(...values);
  }

  // Destructured explicitly (not a blanket spread) so `headline` — a
  // dynamic-document-only field with no legacy Resume.contact slot —
  // never rides along onto the legacy shape.
  const { name, email, phone, location, linkedin, github, website } = document.personalInformation;

  return {
    contact: { name, email, phone, location, linkedin, github, website },
    summary,
    skills,
    technicalSkills,
    softSkills,
    workExperience,
    education,
    certifications,
    projects,
    achievements,
    languages,
    yearsOfExperience: previousResume.yearsOfExperience,
  };
}

/**
 * Controlled sync after an AI-driven JD optimization/rewrite completes
 * on a version that ALREADY has a dynamic document — merges the new
 * content into the matching sections' first entry (Summary) or
 * replaces bullet/skill lists (Experience/Projects/Skills), rather
 * than regenerating the whole document from scratch. Section
 * order/visibility/titles, other sections, and any custom
 * sections/fields the user has already added are always left
 * untouched — the whole point of "AI must not unexpectedly delete
 * user content."
 */
export function mergeOptimizedSectionsIntoDocument(document: DynamicResumeDocument, optimized: OptimizedSectionsSnapshot): DynamicResumeDocument {
  const sections = document.sections.map((section) => {
    if (section.type === "SUMMARY" && optimized.optimizedSummary) {
      const entries = section.entries.length > 0 ? section.entries : [newEntry(0, {})];
      return { ...section, entries: [{ ...entries[0], fields: { ...entries[0].fields, content: optimized.optimizedSummary } }, ...entries.slice(1)] };
    }

    if (section.type === "EXPERIENCE" && optimized.optimizedExperience.length > 0) {
      const rewritesByOriginal = new Map(optimized.optimizedExperience.map((pair) => [pair.original.trim(), pair.optimized]));
      const entries = section.entries.map((entry) => {
        const achievements = entry.fields.achievements;
        if (!Array.isArray(achievements)) return entry;
        const rewritten = achievements.map((line) => rewritesByOriginal.get(line.trim()) ?? line);
        return { ...entry, fields: { ...entry.fields, achievements: rewritten } };
      });
      return { ...section, entries };
    }

    if (section.type === "PROJECTS" && optimized.optimizedProjects.length > 0) {
      const rewritesByOriginal = new Map(optimized.optimizedProjects.map((pair) => [pair.original.trim(), pair.optimized]));
      const entries = section.entries.map((entry) => {
        const description = entry.fields.description;
        if (typeof description !== "string") return entry;
        const rewritten = rewritesByOriginal.get(description.trim());
        return rewritten ? { ...entry, fields: { ...entry.fields, description: rewritten } } : entry;
      });
      return { ...section, entries };
    }

    if (section.type === "SKILLS" && optimized.optimizedSkills.length > 0) {
      // The optimizer returns one flat, re-categorized skill list —
      // replaces this section's entries with a single "Skills" group
      // rather than guessing which of the user's original categories
      // each skill belonged to.
      return { ...section, entries: [newEntry(0, { category: "Skills", skills: optimized.optimizedSkills })] };
    }

    return section;
  });

  return { ...document, sections };
}

/** Same controlled-merge principle as above, for a saved resume-rewriter.ts session — only touches sections whose type has a corresponding rewritten entry, leaves everything else exactly as the user last edited it. */
export function mergeRewrittenSectionsIntoDocument(document: DynamicResumeDocument, rewritten: RewrittenSectionsSnapshot): DynamicResumeDocument {
  const sections = document.sections.map((section) => {
    if (section.type === "SUMMARY" && rewritten.summary && rewritten.summary.length > 0) {
      const entries = section.entries.length > 0 ? section.entries : [newEntry(0, {})];
      return { ...section, entries: [{ ...entries[0], fields: { ...entries[0].fields, content: rewritten.summary[0] } }, ...entries.slice(1)] };
    }

    if (section.type === "EXPERIENCE" && rewritten.experience) {
      const flattened = rewritten.experience;
      let cursor = 0;
      const entries = section.entries.map((entry) => {
        const achievements = entry.fields.achievements;
        if (!Array.isArray(achievements)) return entry;
        const slice = flattened.slice(cursor, cursor + achievements.length);
        cursor += achievements.length;
        return slice.length === achievements.length ? { ...entry, fields: { ...entry.fields, achievements: slice } } : entry;
      });
      return { ...section, entries };
    }

    if (section.type === "SKILLS" && rewritten.skills && rewritten.skills.length > 0) {
      // rewrite-service.ts's own skills-section shape is "Category: a, b, c" lines — parsed back into category groups.
      const entries = rewritten.skills.map((line, index) => {
        const [category, rest] = line.split(":");
        return newEntry(index, { category: (category ?? "Skills").trim(), skills: (rest ?? "").split(",").map((skill) => skill.trim()).filter(Boolean) });
      });
      return { ...section, entries };
    }

    if (section.type === "ACHIEVEMENTS" && rewritten.achievements) {
      const entries = rewritten.achievements.map((line, index) => newEntry(index, { description: line }));
      return { ...section, entries };
    }

    return section;
  });

  return { ...document, sections };
}
