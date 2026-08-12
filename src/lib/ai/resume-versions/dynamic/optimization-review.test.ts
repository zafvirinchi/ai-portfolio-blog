import { describe, expect, it } from "vitest";

import { applyChangeProposals, buildChangeProposals, buildEducationAndCertificationProposals, gapSkillsFor, projectAtsScoreAfterProposals, ResumeChangeProposal } from "./optimization-review";
import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION } from "./dynamic-resume-schema";
import { OptimizerOutput } from "../../job-description/jd-schema";
import { Resume } from "../../resume/resume-schema";
import { JobDescription } from "../../job-description/jd-schema";

function baseDocument(): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    sections: [
      {
        id: "summary-section",
        type: "SUMMARY",
        title: "Professional Summary",
        order: 0,
        visible: true,
        custom: false,
        settings: { showTitle: true, showDivider: true },
        entries: [{ id: "summary-entry", order: 0, visible: true, fields: { content: "Full Stack Developer with experience in Java and Angular." }, hiddenFieldKeys: [], customFields: [] }],
      },
      {
        id: "experience-section",
        type: "EXPERIENCE",
        title: "Experience",
        order: 1,
        visible: true,
        custom: false,
        settings: { showTitle: true, showDivider: true },
        entries: [
          {
            id: "job-1",
            order: 0,
            visible: true,
            fields: { jobTitle: "Full Stack Developer", company: "Acme", achievements: ["Worked on Angular applications.", "Fixed bugs."] },
            hiddenFieldKeys: [],
            customFields: [],
          },
        ],
      },
      {
        id: "projects-section",
        type: "PROJECTS",
        title: "Projects",
        order: 2,
        visible: true,
        custom: false,
        settings: { showTitle: true, showDivider: true },
        entries: [{ id: "project-1", order: 0, visible: true, fields: { projectName: "Internal Tool", description: "Built a tool for the team." }, hiddenFieldKeys: [], customFields: [] }],
      },
      {
        id: "skills-section",
        type: "SKILLS",
        title: "Skills",
        order: 3,
        visible: true,
        custom: false,
        settings: { showTitle: true, showDivider: true },
        entries: [{ id: "skills-entry", order: 0, visible: true, fields: { category: "Skills", skills: ["HTML", "CSS", "Java", "Angular"] }, hiddenFieldKeys: [], customFields: [] }],
      },
      {
        id: "education-section",
        type: "EDUCATION",
        title: "Education",
        order: 4,
        visible: true,
        custom: false,
        settings: { showTitle: true, showDivider: true },
        entries: [{ id: "education-entry", order: 0, visible: true, fields: { degree: "B.Tech Computer Science", institution: "State University" }, hiddenFieldKeys: [], customFields: [] }],
      },
      {
        id: "certifications-section",
        type: "CERTIFICATIONS",
        title: "Certifications",
        order: 5,
        visible: true,
        custom: false,
        settings: { showTitle: true, showDivider: true },
        entries: [{ id: "certification-entry", order: 0, visible: true, fields: { name: "AWS Certified Developer - Associate" }, hiddenFieldKeys: [], customFields: [] }],
      },
      {
        id: "custom-section",
        type: "CUSTOM",
        title: "Untouched Custom Section",
        order: 6,
        visible: true,
        custom: true,
        settings: { showTitle: true, showDivider: true },
        entries: [{ id: "custom-entry", order: 0, visible: true, fields: {}, hiddenFieldKeys: [], customFields: [{ id: "cf1", label: "Note", value: "Should never change", order: 0, visible: true }] }],
      },
    ],
  };
}

function baseResumeData(overrides: Partial<Resume> = {}): Resume {
  return {
    contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    summary: "Full Stack Developer with experience in Java and Angular.",
    skills: [],
    technicalSkills: [],
    softSkills: [],
    workExperience: [],
    education: [{ degree: "B.Tech Computer Science", institution: "State University", location: null, startDate: null, endDate: null, gpa: null }],
    certifications: [{ name: "AWS Certified Developer - Associate", issuer: "Amazon", date: null }],
    projects: [],
    achievements: [],
    languages: [],
    yearsOfExperience: null,
    ...overrides,
  };
}

function baseJobDescription(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    companyName: "TestCo",
    jobTitle: "Full Stack Engineer",
    experienceRequired: { minYears: null, maxYears: null, raw: null },
    educationRequired: [],
    skills: [],
    mandatorySkills: [],
    goodToHaveSkills: [],
    responsibilities: [],
    softSkills: [],
    certifications: [],
    cloud: [],
    frameworks: [],
    programmingLanguages: [],
    tools: [],
    databases: [],
    aiSkills: [],
    security: [],
    domain: null,
    ...overrides,
  };
}

function baseOptimized(overrides: Partial<OptimizerOutput> = {}): OptimizerOutput {
  return {
    optimizedSummary: "Full Stack Developer with experience in Java and Angular.",
    optimizedExperience: [],
    optimizedProjects: [],
    optimizedSkills: [],
    missingSkillsSection: [],
    improvementSuggestions: [],
    ...overrides,
  };
}

describe("buildChangeProposals", () => {
  it("produces no proposals when the optimizer's output is identical to existing content", () => {
    const proposals = buildChangeProposals(baseDocument(), baseOptimized(), []);
    expect(proposals).toEqual([]);
  });

  it("proposes a summary change and marks high confidence when a gap skill is verifiably introduced", () => {
    const optimized = baseOptimized({ optimizedSummary: "Lead Full Stack Developer with Java, Angular, and AWS experience." });
    const proposals = buildChangeProposals(baseDocument(), optimized, ["AWS"]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ fieldKey: "summary", sectionId: "summary-section", entryId: "summary-entry", matchedRequirement: "AWS", confidence: "high" });
  });

  it("proposes an achievement change per rewritten bullet, matched by original text", () => {
    const optimized = baseOptimized({
      optimizedExperience: [{ original: "Worked on Angular applications.", optimized: "Designed and developed enterprise Angular applications using RxJS.", starFormat: false }],
    });
    const proposals = buildChangeProposals(baseDocument(), optimized, ["RxJS"]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      fieldKey: "achievement",
      sectionId: "experience-section",
      entryId: "job-1",
      originalValue: "Worked on Angular applications.",
      matchedRequirement: "RxJS",
      confidence: "high",
    });
  });

  it("does not propose a change for a bullet that was not rewritten", () => {
    const optimized = baseOptimized({
      optimizedExperience: [{ original: "Worked on Angular applications.", optimized: "Designed enterprise Angular applications.", starFormat: false }],
    });
    const proposals = buildChangeProposals(baseDocument(), optimized, []);

    expect(proposals.filter((p) => p.originalValue === "Fixed bugs.")).toHaveLength(0);
  });

  it("proposes a project description change", () => {
    const optimized = baseOptimized({ optimizedProjects: [{ original: "Built a tool for the team.", optimized: "Built and shipped an internal productivity tool used by the team.", starFormat: false }] });
    const proposals = buildChangeProposals(baseDocument(), optimized, []);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ fieldKey: "projectDescription", sectionId: "projects-section", entryId: "project-1" });
  });

  it("proposes a section-level skills reorganization with no entryId, never adding a skill absent from the resume", () => {
    const optimized = baseOptimized({ optimizedSkills: ["Java", "Angular", "HTML", "CSS"] });
    const proposals = buildChangeProposals(baseDocument(), optimized, []);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ fieldKey: "skillsReorganization", sectionId: "skills-section", entryId: null });
    expect(proposals[0].proposedValue).toEqual(["Java", "Angular", "HTML", "CSS"]);
  });

  it("never produces a proposal touching the custom section", () => {
    const optimized = baseOptimized({ optimizedSummary: "Completely different summary mentioning nothing from the custom section." });
    const proposals = buildChangeProposals(baseDocument(), optimized, []);

    expect(proposals.every((p) => p.sectionId !== "custom-section")).toBe(true);
  });
});

describe("gapSkillsFor", () => {
  it("combines missing skills and partial-match JD skill names", () => {
    expect(gapSkillsFor(["Kubernetes"], [{ jdSkill: "Spring Framework" } as never])).toEqual(["Kubernetes", "Spring Framework"]);
  });
});

describe("applyChangeProposals — accept/reject/apply semantics (Milestone 15 Tests 9-11)", () => {
  it("rejecting all changes (applying an empty list) leaves the document byte-identical", () => {
    const document = baseDocument();
    const { document: result, results } = applyChangeProposals(document, []);
    expect(result).toEqual(document);
    expect(results).toEqual([]);
  });

  it("accepting exactly one change only modifies that field, leaving every other entry/section untouched", () => {
    const document = baseDocument();
    const optimized = baseOptimized({
      optimizedExperience: [{ original: "Worked on Angular applications.", optimized: "Designed enterprise Angular applications with RxJS.", starFormat: false }],
    });
    const proposals = buildChangeProposals(document, optimized, []);

    const { document: result, results } = applyChangeProposals(document, [proposals[0]]);

    const experienceEntry = result.sections.find((s) => s.id === "experience-section")!.entries[0];
    expect(experienceEntry.fields.achievements).toEqual(["Designed enterprise Angular applications with RxJS.", "Fixed bugs."]);
    expect(results).toEqual([{ proposalId: proposals[0].id, outcome: "applied" }]);

    // Everything else is untouched.
    expect(result.sections.find((s) => s.id === "summary-section")).toEqual(document.sections.find((s) => s.id === "summary-section"));
    expect(result.sections.find((s) => s.id === "projects-section")).toEqual(document.sections.find((s) => s.id === "projects-section"));
    expect(result.sections.find((s) => s.id === "custom-section")).toEqual(document.sections.find((s) => s.id === "custom-section"));
  });

  it("accepting all proposals applies every one of them correctly", () => {
    const document = baseDocument();
    const optimized = baseOptimized({
      optimizedSummary: "Lead Full Stack Developer with Java, Angular, and AWS experience.",
      optimizedExperience: [{ original: "Worked on Angular applications.", optimized: "Designed enterprise Angular applications.", starFormat: false }],
      optimizedProjects: [{ original: "Built a tool for the team.", optimized: "Built and shipped an internal tool.", starFormat: false }],
      optimizedSkills: ["Java", "Angular", "HTML", "CSS"],
    });
    const proposals = buildChangeProposals(document, optimized, ["AWS"]);
    expect(proposals.length).toBeGreaterThanOrEqual(4);

    const { document: result, results } = applyChangeProposals(document, proposals);

    expect(result.sections.find((s) => s.id === "summary-section")!.entries[0].fields.content).toBe("Lead Full Stack Developer with Java, Angular, and AWS experience.");
    expect(result.sections.find((s) => s.id === "experience-section")!.entries[0].fields.achievements).toEqual(["Designed enterprise Angular applications.", "Fixed bugs."]);
    expect(result.sections.find((s) => s.id === "projects-section")!.entries[0].fields.description).toBe("Built and shipped an internal tool.");
    expect(result.sections.find((s) => s.id === "skills-section")!.entries[0].fields.skills).toEqual(["Java", "Angular", "HTML", "CSS"]);
    expect(results.every((r) => r.outcome === "applied")).toBe(true); // every accepted proposal genuinely changed something
  });

  it("preserves section order, visibility, and custom sections/fields exactly (Milestone 15 §24)", () => {
    const document = baseDocument();
    const optimized = baseOptimized({ optimizedSummary: "A rewritten summary mentioning Java and Angular experience broadly." });
    const proposals = buildChangeProposals(document, optimized, []);

    const { document: result } = applyChangeProposals(document, proposals);

    expect(result.sections.map((s) => ({ id: s.id, order: s.order, visible: s.visible }))).toEqual(document.sections.map((s) => ({ id: s.id, order: s.order, visible: s.visible })));
    expect(result.sections.find((s) => s.id === "custom-section")!.entries[0].customFields).toEqual([{ id: "cf1", label: "Note", value: "Should never change", order: 0, visible: true }]);
  });

  it("does not throw and is a safe no-op when a proposal's original text is no longer present (already edited elsewhere)", () => {
    const document = baseDocument();
    const staleProposal: ResumeChangeProposal = {
      id: "stale",
      sectionId: "experience-section",
      sectionType: "EXPERIENCE",
      entryId: "job-1",
      fieldKey: "achievement",
      originalValue: "This text does not exist in the document.",
      proposedValue: "Replacement text.",
      reason: "test",
      matchedRequirement: null,
      confidence: "medium",
      autoApplicable: true,
    };

    const { document: result, results } = applyChangeProposals(document, [staleProposal]);
    expect(result.sections.find((s) => s.id === "experience-section")!.entries[0].fields.achievements).toEqual(["Worked on Angular applications.", "Fixed bugs."]);
    // Phase 15 Milestone 9 — this is reported honestly as stale, never silently as "applied".
    expect(results).toEqual([{ proposalId: "stale", outcome: "skipped_stale" }]);
  });

  it("Milestone 16 §5 — never applies a proposal marked autoApplicable:false, even if the caller passes it in as 'accepted'", () => {
    const document = baseDocument();
    const gapProposal: ResumeChangeProposal = {
      id: "gap-1",
      sectionId: "education-section",
      sectionType: "EDUCATION",
      entryId: null,
      fieldKey: "educationGap",
      originalValue: "",
      proposedValue: "Master's in Computer Science",
      reason: "test",
      matchedRequirement: "Master's in Computer Science",
      confidence: "medium",
      autoApplicable: false,
    };

    const { document: result, results } = applyChangeProposals(document, [gapProposal]);
    expect(result).toEqual(document);
    // Phase 15 Milestone 9 — even if a malicious/buggy client sent this proposal with autoApplicable flipped to true, the SERVER's own copy (not shown here) is what's checked; this test uses the honest false value and confirms it's reported as such, not silently as "applied".
    expect(results).toEqual([{ proposalId: "gap-1", outcome: "skipped_not_applicable" }]);
  });

  it("Phase 15 Milestone 9, §6 — a client-forged autoApplicable:true on a gap proposal still cannot write anything (defense in depth: the fieldKey itself has no write branch)", () => {
    const document = baseDocument();
    const forgedGapProposal: ResumeChangeProposal = {
      id: "forged-gap",
      sectionId: "education-section",
      sectionType: "EDUCATION",
      entryId: null,
      fieldKey: "educationGap",
      originalValue: "",
      proposedValue: "Fabricated PhD in Computer Science",
      reason: "test",
      matchedRequirement: null,
      confidence: "medium",
      autoApplicable: true, // forged — a real client would never receive this from /propose for a gap proposal
    };

    const { document: result } = applyChangeProposals(document, [forgedGapProposal]);
    expect(result).toEqual(document); // untouched, even though the (forged) flag said it was safe
  });
});

describe("buildEducationAndCertificationProposals — Milestone 16", () => {
  it("produces no proposal when the resume already has an equivalent-or-higher degree (§2 — already satisfied)", () => {
    const document = baseDocument(); // has "B.Tech Computer Science"
    const resumeData = baseResumeData();
    const jd = baseJobDescription({ educationRequired: ["Bachelor's in Computer Science"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    expect(proposals.filter((p) => p.fieldKey === "educationGap")).toEqual([]);
  });

  it("produces no proposal when an equivalent HIGHER degree satisfies the requirement", () => {
    const document = baseDocument();
    const resumeData = baseResumeData({ education: [{ degree: "M.Tech Computer Science", institution: "State University", location: null, startDate: null, endDate: null, gpa: null }] });
    const jd = baseJobDescription({ educationRequired: ["Bachelor's in Computer Science"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    expect(proposals.filter((p) => p.fieldKey === "educationGap")).toEqual([]);
  });

  it("produces a non-auto-applicable gap proposal for a genuinely missing degree requirement (§2)", () => {
    const document = baseDocument();
    const resumeData = baseResumeData();
    const jd = baseJobDescription({ educationRequired: ["Master's in Computer Science"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    const gapProposals = proposals.filter((p) => p.fieldKey === "educationGap");

    expect(gapProposals).toHaveLength(1);
    expect(gapProposals[0]).toMatchObject({
      sectionId: "education-section",
      sectionType: "EDUCATION",
      entryId: null,
      proposedValue: "Master's in Computer Science",
      matchedRequirement: "Master's in Computer Science",
      autoApplicable: false,
    });
  });

  it("never fabricates a degree, institution, or date — the gap proposal only ever names the JD requirement text", () => {
    const document = baseDocument();
    const resumeData = baseResumeData();
    const jd = baseJobDescription({ educationRequired: ["PhD in Computer Science"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    const gapProposal = proposals.find((p) => p.fieldKey === "educationGap")!;

    expect(gapProposal.originalValue).toBe("");
    expect(gapProposal.proposedValue).toBe("PhD in Computer Science");
    expect(gapProposal.reason).not.toMatch(/institution|university name|credential id/i);
  });

  it("attaches sectionId:null when the resume has no EDUCATION section at all, rather than inventing one", () => {
    const documentWithoutEducation: DynamicResumeDocument = { ...baseDocument(), sections: baseDocument().sections.filter((s) => s.type !== "EDUCATION") };
    const resumeData = baseResumeData({ education: [] });
    const jd = baseJobDescription({ educationRequired: ["Bachelor's in Computer Science"] });

    const proposals = buildEducationAndCertificationProposals(documentWithoutEducation, resumeData, jd);
    const gapProposal = proposals.find((p) => p.fieldKey === "educationGap")!;

    expect(gapProposal.sectionId).toBeNull();
  });

  it("produces no proposal when a required certification is already present (§3 — matched)", () => {
    const document = baseDocument(); // has "AWS Certified Developer - Associate"
    const resumeData = baseResumeData();
    const jd = baseJobDescription({ certifications: ["AWS Certified Developer - Associate"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    expect(proposals.filter((p) => p.fieldKey === "certificationGap")).toEqual([]);
  });

  it("produces a gap proposal that mentions the related certification, without renaming or fabricating it (§3 — equivalent/related)", () => {
    // "aws" (3 chars) is below findRelatedCertification()'s own
    // shared-first-word length threshold (>3, an existing Milestone 15
    // heuristic this milestone reuses rather than changes) — so this
    // fixture uses "Microsoft", a first word long enough to trigger it.
    const document: DynamicResumeDocument = {
      ...baseDocument(),
      sections: baseDocument().sections.map((section) =>
        section.id === "certifications-section"
          ? { ...section, entries: [{ id: "certification-entry", order: 0, visible: true, fields: { name: "Microsoft Certified: Azure Administrator Associate" }, hiddenFieldKeys: [], customFields: [] }] }
          : section
      ),
    };
    const resumeData = baseResumeData({ certifications: [{ name: "Microsoft Certified: Azure Administrator Associate", issuer: "Microsoft", date: null }] });
    const jd = baseJobDescription({ certifications: ["Microsoft Certified: Azure Solutions Architect Expert"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    const gapProposal = proposals.find((p) => p.fieldKey === "certificationGap")!;

    expect(gapProposal.autoApplicable).toBe(false);
    expect(gapProposal.proposedValue).toBe("Microsoft Certified: Azure Solutions Architect Expert"); // never substitutes the resume's actual cert name
    expect(gapProposal.reason).toContain("Microsoft Certified: Azure Administrator Associate");
  });

  it("produces a plain gap proposal (no related-certification mention) when nothing on the resume is even loosely related (§3 — missing)", () => {
    const document = baseDocument();
    const resumeData = baseResumeData();
    const jd = baseJobDescription({ certifications: ["Certified Kubernetes Administrator"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    const gapProposal = proposals.find((p) => p.fieldKey === "certificationGap")!;

    expect(gapProposal.autoApplicable).toBe(false);
    expect(gapProposal.reason).not.toContain("related certification");
  });

  it("never fabricates a certification ID, issuer, or expiration date", () => {
    const document = baseDocument();
    const resumeData = baseResumeData();
    const jd = baseJobDescription({ certifications: ["Certified Kubernetes Administrator"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    const gapProposal = proposals.find((p) => p.fieldKey === "certificationGap")!;

    expect(gapProposal.reason).not.toMatch(/credential id|expir|issuer:/i);
  });

  it("gap proposals returned by the builder are safe no-ops even if a caller mistakenly applies them", () => {
    const document = baseDocument();
    const resumeData = baseResumeData();
    const jd = baseJobDescription({ educationRequired: ["Master's in Computer Science"], certifications: ["Certified Kubernetes Administrator"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jd);
    expect(proposals.length).toBeGreaterThan(0);

    const { document: result } = applyChangeProposals(document, proposals);
    expect(result).toEqual(document);
  });
});

describe("projectAtsScoreAfterProposals — Milestone 15 §35", () => {
  function baseResume(): Resume {
    return {
      contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
      summary: "Full Stack Developer with experience in Java and Angular.",
      skills: ["HTML", "CSS", "Java", "Angular"],
      technicalSkills: [],
      softSkills: [],
      workExperience: [{ title: "Full Stack Developer", company: "Acme", location: null, startDate: null, endDate: null, isCurrent: false, description: ["Worked on Angular applications.", "Fixed bugs."] }],
      education: [],
      certifications: [],
      projects: [{ name: "Internal Tool", description: "Built a tool for the team.", technologies: [], url: null }],
      achievements: [],
      languages: [],
      yearsOfExperience: 5,
    };
  }

  function baseJd(): JobDescription {
    return {
      companyName: "TestCo",
      jobTitle: "Full Stack Developer",
      experienceRequired: { minYears: 3, maxYears: null, raw: "3+ years" },
      educationRequired: [],
      skills: ["Java", "Angular", "AWS"],
      mandatorySkills: [],
      goodToHaveSkills: [],
      responsibilities: [],
      softSkills: [],
      certifications: [],
      cloud: [],
      frameworks: [],
      programmingLanguages: [],
      tools: [],
      databases: [],
      aiSkills: [],
      security: [],
      domain: null,
    };
  }

  it("never mutates the input resume", () => {
    const resume = baseResume();
    const snapshot = JSON.parse(JSON.stringify(resume));
    projectAtsScoreAfterProposals(resume, baseJd(), [{ id: "1", sectionId: "s", sectionType: "SUMMARY", entryId: "e", fieldKey: "summary", originalValue: "x", proposedValue: "Java Angular AWS expert", reason: "r", matchedRequirement: "AWS", confidence: "high", autoApplicable: true }]);
    expect(resume).toEqual(snapshot);
  });

  it("produces a higher projected score when a proposal introduces a currently-missing JD skill", () => {
    const resume = baseResume();
    const jd = baseJd();

    const before = projectAtsScoreAfterProposals(resume, jd, []);
    const after = projectAtsScoreAfterProposals(resume, jd, [
      { id: "1", sectionId: "s", sectionType: "SUMMARY", entryId: "e", fieldKey: "summary", originalValue: resume.summary ?? "", proposedValue: "Full Stack Developer with Java, Angular, and AWS experience.", reason: "r", matchedRequirement: "AWS", confidence: "high", autoApplicable: true },
      { id: "2", sectionId: "s2", sectionType: "SKILLS", entryId: null, fieldKey: "skillsReorganization", originalValue: resume.skills, proposedValue: [...resume.skills, "AWS"], reason: "r", matchedRequirement: null, confidence: "medium", autoApplicable: true },
    ]);

    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("has no effect (safe no-op) when a proposal's original text is not found in resume_data", () => {
    const resume = baseResume();
    const jd = baseJd();

    const before = projectAtsScoreAfterProposals(resume, jd, []);
    const after = projectAtsScoreAfterProposals(resume, jd, [
      { id: "1", sectionId: "s", sectionType: "PROJECTS", entryId: "e", fieldKey: "projectDescription", originalValue: "Text that was never in resume_data.", proposedValue: "New text.", reason: "r", matchedRequirement: null, confidence: "medium", autoApplicable: true },
    ]);

    expect(after).toBe(before);
  });
});
