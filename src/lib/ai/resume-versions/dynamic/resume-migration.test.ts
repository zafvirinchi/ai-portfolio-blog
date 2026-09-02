import { describe, expect, it } from "vitest";

import { Resume } from "../../resume/resume-schema";
import { OptimizedSectionsSnapshot, RewrittenSectionsSnapshot } from "../resume-version-types";

import { addEntry, addSection, updatePersonalInformation } from "./dynamic-resume-document-service";
import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION } from "./dynamic-resume-schema";
import { fromDynamicResumeDocument, mergeOptimizedSectionsIntoDocument, mergeRewrittenSectionsIntoDocument, toDynamicResumeDocument } from "./resume-migration";

function emptyResumeDocument(): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: null, headline: null, email: null, phone: null, location: null, linkedin: null, github: null, website: null },
    sections: [],
  };
}

function emptyResume(): Resume {
  return {
    contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    summary: null,
    skills: [],
    technicalSkills: [],
    softSkills: [],
    workExperience: [],
    education: [],
    certifications: [],
    projects: [],
    achievements: [],
    languages: [],
    yearsOfExperience: null,
  };
}

describe("toDynamicResumeDocument", () => {
  it("produces no sections at all for a bare-minimum resume (only contact info)", () => {
    const document = toDynamicResumeDocument(emptyResume());
    expect(document.sections).toEqual([]);
    expect(document.personalInformation.name).toBe("Jane Doe");
  });

  it("only creates a SUMMARY section when summary has real text, never a blank one", () => {
    const whitespaceOnly = toDynamicResumeDocument({ ...emptyResume(), summary: "   " });
    expect(whitespaceOnly.sections.find((s) => s.type === "SUMMARY")).toBeUndefined();

    const withSummary = toDynamicResumeDocument({ ...emptyResume(), summary: "Experienced engineer." });
    const summarySection = withSummary.sections.find((s) => s.type === "SUMMARY");
    expect(summarySection?.entries[0].fields.content).toBe("Experienced engineer.");
  });

  it("maps work experience bullets into the entry's achievements field", () => {
    const resume: Resume = {
      ...emptyResume(),
      workExperience: [
        { title: "Software Engineer", company: "Acme", location: "Remote", startDate: "2020", endDate: null, isCurrent: true, description: ["Built X", "Shipped Y"] },
      ],
    };

    const document = toDynamicResumeDocument(resume);
    const experience = document.sections.find((s) => s.type === "EXPERIENCE");
    expect(experience?.entries).toHaveLength(1);
    expect(experience?.entries[0].fields).toMatchObject({
      jobTitle: "Software Engineer",
      company: "Acme",
      current: true,
      achievements: ["Built X", "Shipped Y"],
    });
  });

  it("splits skills/technicalSkills/softSkills into separate category entries, only for non-empty groups", () => {
    const resume: Resume = { ...emptyResume(), skills: ["Leadership"], technicalSkills: ["TypeScript", "React"], softSkills: [] };
    const document = toDynamicResumeDocument(resume);

    const skillsSection = document.sections.find((s) => s.type === "SKILLS");
    expect(skillsSection?.entries).toHaveLength(2);
    expect(skillsSection?.entries.map((e) => e.fields.category)).toEqual(["Skills", "Technical Skills"]);
  });

  it("assigns increasing section order only to sections that were actually created", () => {
    const resume: Resume = { ...emptyResume(), summary: "Summary text", achievements: ["Won an award"] };
    const document = toDynamicResumeDocument(resume);

    expect(document.sections.map((s) => s.type)).toEqual(["SUMMARY", "ACHIEVEMENTS"]);
    expect(document.sections.map((s) => s.order)).toEqual([0, 1]);
  });

  // Phase 25 Milestone 1 — legacy Resume has no headline field, so a
  // freshly-migrated document always starts with headline: null.
  it("sets headline to null — the legacy Resume schema has no equivalent field", () => {
    const document = toDynamicResumeDocument(emptyResume());
    expect(document.personalInformation.headline).toBeNull();
  });

  it("every generated entry defaults to visible with no hidden fields or custom fields", () => {
    const resume: Resume = { ...emptyResume(), languages: ["English", "Arabic"] };
    const document = toDynamicResumeDocument(resume);
    const entry = document.sections[0].entries[0];

    expect(entry.visible).toBe(true);
    expect(entry.hiddenFieldKeys).toEqual([]);
    expect(entry.customFields).toEqual([]);
  });
});

describe("fromDynamicResumeDocument", () => {
  it("round-trips every field the legacy schema supports through toDynamicResumeDocument and back", () => {
    const resume: Resume = {
      ...emptyResume(),
      summary: "Experienced engineer.",
      skills: ["Leadership"],
      technicalSkills: ["TypeScript", "React"],
      softSkills: ["Communication"],
      workExperience: [{ title: "Software Engineer", company: "Acme", location: "Remote", startDate: "2020", endDate: null, isCurrent: true, description: ["Built X", "Shipped Y"] }],
      education: [{ degree: "B.Sc. Computer Science", institution: "MIT", location: "MA", startDate: "2016", endDate: "2020", gpa: "3.9" }],
      certifications: [{ name: "AWS SAA", issuer: "Amazon", date: "2022" }],
      projects: [{ name: "Portfolio Site", description: "A personal site", technologies: ["Next.js"], url: "https://example.com" }],
      achievements: ["Won an award"],
      languages: ["English", "Arabic"],
      yearsOfExperience: 5,
    };

    const document = toDynamicResumeDocument(resume);
    const roundTripped = fromDynamicResumeDocument(document, resume);

    expect(roundTripped).toEqual(resume);
  });

  it("carries yearsOfExperience forward from previousResume — nothing in the dynamic model can express it", () => {
    const resume: Resume = { ...emptyResume(), yearsOfExperience: 12 };
    const document = toDynamicResumeDocument(resume);

    const derived = fromDynamicResumeDocument(document, resume);
    expect(derived.yearsOfExperience).toBe(12);
  });

  it("reflects a builder edit made after the initial migration — the exact scenario ATS/chat/JD-matching must see", () => {
    const resume: Resume = { ...emptyResume(), workExperience: [{ title: "Software Engineer", company: "Acme", location: null, startDate: null, endDate: null, isCurrent: false, description: [] }] };
    let document = toDynamicResumeDocument(resume);
    const experienceSectionId = document.sections.find((s) => s.type === "EXPERIENCE")!.id;

    // Simulate the builder's own updateEntry call editing the job title.
    const entryId = document.sections.find((s) => s.type === "EXPERIENCE")!.entries[0].id;
    document = { ...document, sections: document.sections.map((s) => (s.id !== experienceSectionId ? s : { ...s, entries: s.entries.map((e) => (e.id !== entryId ? e : { ...e, fields: { ...e.fields, jobTitle: "Lead Full Stack Developer" } })) })) };

    const derived = fromDynamicResumeDocument(document, resume);
    expect(derived.workExperience[0].title).toBe("Lead Full Stack Developer");
  });

  it("folds a skills group renamed or newly added by the user into the general skills array rather than dropping it", () => {
    let document = addSection(emptyResumeDocument(), "SKILLS");
    document = addEntry(document, document.sections[0].id, { category: "Cloud Platforms", skills: ["AWS", "Azure"] });

    const derived = fromDynamicResumeDocument(document, emptyResume());
    expect(derived.skills).toEqual(["AWS", "Azure"]);
    expect(derived.technicalSkills).toEqual([]);
  });

  it("correctly buckets a Technical Skills / Soft Skills group by category name", () => {
    let document = addSection(emptyResumeDocument(), "SKILLS");
    document = addEntry(document, document.sections[0].id, { category: "Technical Skills", skills: ["Go"] });
    document = addEntry(document, document.sections[0].id, { category: "Soft Skills", skills: ["Teamwork"] });

    const derived = fromDynamicResumeDocument(document, emptyResume());
    expect(derived.technicalSkills).toEqual(["Go"]);
    expect(derived.softSkills).toEqual(["Teamwork"]);
    expect(derived.skills).toEqual([]);
  });

  it("personalInformation on the dynamic document always wins over previousResume's contact info", () => {
    const document = updatePersonalInformation(emptyResumeDocument(), { name: "Updated Name", email: "updated@example.com" });
    const derived = fromDynamicResumeDocument(document, emptyResume());
    expect(derived.contact.name).toBe("Updated Name");
    expect(derived.contact.email).toBe("updated@example.com");
  });

  // Phase 25 Milestone 1 — headline is a dynamic-document-only field
  // with no legacy Resume.contact slot; it must never leak onto the
  // derived legacy shape (see resume-migration.ts's explicit
  // destructure, not a blanket spread, of personalInformation).
  it("never leaks headline onto the derived legacy contact shape", () => {
    const document = updatePersonalInformation(emptyResumeDocument(), { name: "Jane Doe", headline: "Senior Backend Engineer" });
    const derived = fromDynamicResumeDocument(document, emptyResume());

    expect(document.personalInformation.headline).toBe("Senior Backend Engineer");
    expect(derived.contact).not.toHaveProperty("headline");
  });

  it("a section type the legacy schema has no slot for (e.g. AWARDS) does not throw and is simply not represented", () => {
    let document = emptyResumeDocument();
    document = addSection(document, "AWARDS");
    document = addEntry(document, document.sections[0].id, { title: "Employee of the Year" });

    expect(() => fromDynamicResumeDocument(document, emptyResume())).not.toThrow();
  });
});

describe("mergeOptimizedSectionsIntoDocument", () => {
  function baseOptimized(): OptimizedSectionsSnapshot {
    return { optimizedSummary: "", optimizedExperience: [], optimizedProjects: [], optimizedSkills: [], improvementSuggestions: [] };
  }

  it("replaces the summary section's content field without touching other sections", () => {
    const document = toDynamicResumeDocument({ ...emptyResume(), summary: "Old summary", achievements: ["Kept as-is"] });
    const merged = mergeOptimizedSectionsIntoDocument(document, { ...baseOptimized(), optimizedSummary: "New, JD-tailored summary" });

    expect(merged.sections.find((s) => s.type === "SUMMARY")?.entries[0].fields.content).toBe("New, JD-tailored summary");
    expect(merged.sections.find((s) => s.type === "ACHIEVEMENTS")?.entries[0].fields.description).toBe("Kept as-is");
  });

  it("rewrites only the experience achievement lines that match an original bullet exactly, leaving unmatched lines untouched", () => {
    const document = toDynamicResumeDocument({
      ...emptyResume(),
      workExperience: [{ title: "Engineer", company: "Acme", location: null, startDate: null, endDate: null, isCurrent: false, description: ["Built X", "Unrelated bullet"] }],
    });

    const merged = mergeOptimizedSectionsIntoDocument(document, {
      ...baseOptimized(),
      optimizedExperience: [{ original: "Built X", optimized: "Architected and delivered X", starFormat: true }],
    });

    const achievements = merged.sections.find((s) => s.type === "EXPERIENCE")?.entries[0].fields.achievements;
    expect(achievements).toEqual(["Architected and delivered X", "Unrelated bullet"]);
  });

  it("does not mutate the input document (pure function)", () => {
    const document = toDynamicResumeDocument({ ...emptyResume(), summary: "Old summary" });
    const snapshot = JSON.parse(JSON.stringify(document));

    mergeOptimizedSectionsIntoDocument(document, { ...baseOptimized(), optimizedSummary: "Changed" });

    expect(document).toEqual(snapshot);
  });

  it("leaves a custom section the user added completely untouched", () => {
    let document = toDynamicResumeDocument({ ...emptyResume(), summary: "Old summary" });
    document = {
      ...document,
      sections: [
        ...document.sections,
        { id: "custom-1", type: "CUSTOM", title: "My Custom Section", order: 5, visible: true, custom: true, entries: [], settings: { showTitle: true, showDivider: true } },
      ],
    };

    const merged = mergeOptimizedSectionsIntoDocument(document, { ...baseOptimized(), optimizedSummary: "New" });
    expect(merged.sections.find((s) => s.id === "custom-1")).toEqual(document.sections.find((s) => s.id === "custom-1"));
  });
});

describe("mergeRewrittenSectionsIntoDocument", () => {
  it("replaces the summary with the first rewritten summary line", () => {
    const document = toDynamicResumeDocument({ ...emptyResume(), summary: "Old summary" });
    const rewritten: RewrittenSectionsSnapshot = { summary: ["Rewritten summary line"] };

    const merged = mergeRewrittenSectionsIntoDocument(document, rewritten);
    expect(merged.sections.find((s) => s.type === "SUMMARY")?.entries[0].fields.content).toBe("Rewritten summary line");
  });

  it("parses 'Category: a, b, c' skill lines back into category groups", () => {
    const document = toDynamicResumeDocument({ ...emptyResume(), skills: ["Old skill"] });
    const rewritten: RewrittenSectionsSnapshot = { skills: ["Technical Skills: TypeScript, React, Node.js"] };

    const merged = mergeRewrittenSectionsIntoDocument(document, rewritten);
    const skillsEntry = merged.sections.find((s) => s.type === "SKILLS")?.entries[0];
    expect(skillsEntry?.fields.category).toBe("Technical Skills");
    expect(skillsEntry?.fields.skills).toEqual(["TypeScript", "React", "Node.js"]);
  });

  it("replaces achievement lines wholesale, one entry per line", () => {
    const document = toDynamicResumeDocument({ ...emptyResume(), achievements: ["Old achievement"] });
    const rewritten: RewrittenSectionsSnapshot = { achievements: ["New achievement A", "New achievement B"] };

    const merged = mergeRewrittenSectionsIntoDocument(document, rewritten);
    const achievementsSection = merged.sections.find((s) => s.type === "ACHIEVEMENTS");
    expect(achievementsSection?.entries.map((e) => e.fields.description)).toEqual(["New achievement A", "New achievement B"]);
  });

  it("leaves sections with no corresponding rewritten key completely untouched", () => {
    const document = toDynamicResumeDocument({ ...emptyResume(), summary: "Old summary", achievements: ["Kept"] });
    const merged = mergeRewrittenSectionsIntoDocument(document, { summary: ["New"] });

    expect(merged.sections.find((s) => s.type === "ACHIEVEMENTS")).toEqual(document.sections.find((s) => s.type === "ACHIEVEMENTS"));
  });
});
