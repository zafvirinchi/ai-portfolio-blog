import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeQueryBuilder } from "../../analytics/test-helpers";

let rows: Record<string, unknown>[] = [];
let idCounter = 0;

vi.mock("../../supabase/admin", () => ({
  supabaseAdmin: {
    from: () => {
      const builder = makeQueryBuilder(rows) as unknown as {
        insert: (payload: Record<string, unknown>) => unknown;
        update: (payload: Record<string, unknown>) => unknown;
      };

      // Extend the shared filter-aware mock with insert/update, which
      // this service needs but analytics's read-only queries never did.
      const extended = builder as typeof builder & Record<string, unknown>;

      extended.insert = (payload: Record<string, unknown>) => {
        const row = { id: `row-${++idCounter}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        rows.push(row);
        return makeQueryBuilder([row]);
      };

      extended.update = (payload: Record<string, unknown>) => {
        // .update() must apply the SAME eq()/filter chain called after
        // it before actually mutating — deferred via a proxy-ish
        // closure: collect filters, then mutate matching rows.
        const filters: { column: string; value: unknown }[] = [];
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push({ column, value });
            return chain;
          },
          select: () => chain,
          single: () => {
            const target = rows.find((row) => filters.every((f) => row[f.column] === f.value));
            if (target) Object.assign(target, payload);
            return Promise.resolve({ data: target ?? null, error: target ? null : { message: "not found" } });
          },
          then: (resolve: (v: { data: null; error: null }) => unknown) => {
            rows.filter((row) => filters.every((f) => row[f.column] === f.value)).forEach((row) => Object.assign(row, payload));
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        return chain;
      };

      return extended;
    },
  },
}));

const resumeServiceGet = vi.fn();
vi.mock("../resume/resume-service", () => ({
  resumeService: { get: (...args: unknown[]) => resumeServiceGet(...(args as [])) },
}));

vi.mock("../resume/resume-score", () => ({
  resumeScorer: { score: vi.fn(() => ({ overall: 82, formatting: 80, keyword: 80, experience: 80, skills: 80, education: 80, certification: 80, explanation: "" })) },
}));

const computeJdMatchForResume = vi.fn();
vi.mock("../job-description/jd-service", () => ({
  computeJdMatchForResume: (...args: unknown[]) => computeJdMatchForResume(...(args as [])),
}));

import { resumeVersionService, ResumeVersionNotFoundError, MasterResumeProtectedError } from "./resume-version-service";
import type { Resume } from "../resume/resume-schema";

const baseResume: Resume = {
  contact: { name: "Jane Doe", email: null, phone: null, location: null, linkedin: null, github: null, website: null },
  summary: "Full Stack Developer with experience...",
  skills: ["Java", "Spring"],
  technicalSkills: [],
  softSkills: [],
  workExperience: [],
  education: [],
  certifications: [],
  projects: [],
  achievements: [],
  languages: [],
  yearsOfExperience: 5,
};

beforeEach(() => {
  rows = [];
  idCounter = 0;
  resumeServiceGet.mockReset();
  computeJdMatchForResume.mockReset();
});

describe("createVersion", () => {
  it("bootstraps the very first version as Master when no master exists and a resumeId is given", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });

    const version = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    expect(version.isMaster).toBe(true);
    expect(version.versionName).toBe("Master Resume");
    expect(version.atsScore).toBe(82);
    expect(version.sourceVersionId).toBeNull();
  });

  it("creates a non-master version cloned from the existing master when one already exists", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    const tailored = await resumeVersionService.createVersion("user-1", { versionName: "UAE Role", targetCompany: "Emirates" });

    expect(tailored.isMaster).toBe(false);
    expect(tailored.sourceVersionId).toBe(master.id);
    expect(tailored.resumeData).toEqual(baseResume);
    // The master itself must be untouched by creating a tailored version off it.
    const reloadedMaster = await resumeVersionService.getVersion("user-1", master.id);
    expect(reloadedMaster.isMaster).toBe(true);
  });

  it("runs the existing JD-matching pipeline and stores its output when a job description is supplied", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    computeJdMatchForResume.mockResolvedValue({
      matchResult: {
        atsScore: 94,
        overallMatch: 91,
        matchedSkills: ["Java", "Spring Boot"],
        missingSkills: ["Kubernetes"],
        optimizedSummary: "Lead Full Stack Developer specializing in...",
        optimizedExperience: [],
        optimizedProjects: [],
        optimizedSkills: ["Java", "Spring Boot", "AWS"],
        improvementSuggestions: [],
      },
    });

    const tailored = await resumeVersionService.createVersion("user-1", { versionName: "UAE Role", jobDescriptionText: "We need a Java developer..." });

    expect(tailored.atsScore).toBe(94);
    expect(tailored.jdMatchScore).toBe(91);
    expect(tailored.matchedSkills).toEqual(["Java", "Spring Boot"]);
    expect(tailored.optimizedSections?.optimizedSummary).toBe("Lead Full Stack Developer specializing in...");
  });

  it("throws when neither a source version, a master, nor a resumeId can be resolved", async () => {
    await expect(resumeVersionService.createVersion("user-1", {})).rejects.toThrow(/No master resume exists/);
  });
});

describe("ownership isolation", () => {
  it("getVersion throws NotFoundError (not the row) when the version belongs to a different user", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const version = await resumeVersionService.createVersion("user-A", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.getVersion("user-B", version.id)).rejects.toBeInstanceOf(ResumeVersionNotFoundError);
  });

  it("listVersions for user B never includes user A's versions", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    await resumeVersionService.createVersion("user-A", { resumeId: "ephemeral-1" });

    const userBVersions = await resumeVersionService.listVersions("user-B");
    expect(userBVersions).toEqual([]);
  });
});

describe("master immutability", () => {
  it("deleteVersion refuses to delete the active master", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.deleteVersion("user-1", master.id)).rejects.toBeInstanceOf(MasterResumeProtectedError);
  });

  it("applyJdOptimization refuses to run against the master", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.applyJdOptimization("user-1", master.id, "some JD")).rejects.toBeInstanceOf(MasterResumeProtectedError);
    expect(computeJdMatchForResume).not.toHaveBeenCalled();
  });

  it("saveRewrittenSections refuses to run against the master", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.saveRewrittenSections("user-1", master.id, { summary: ["x"] })).rejects.toBeInstanceOf(MasterResumeProtectedError);
  });

  // Phase 13 Milestone 19 — applyOptimizationProposals() is the ONLY
  // apply path any current UI reaches (see optimization-review.ts and
  // this milestone's consolidation doc); previously only its sibling
  // applyJdOptimization() had a direct master-protection test at this
  // service layer, even though the proposal-review flow is what's
  // actually reachable from VersionDetail.tsx today.
  it("applyOptimizationProposals refuses to run against the master", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.applyOptimizationProposals("user-1", master.id, [])).rejects.toBeInstanceOf(MasterResumeProtectedError);
  });
});

describe("duplicateVersion", () => {
  it("creates an independent copy that never mutates the original when later changed", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    const tailored = await resumeVersionService.createVersion("user-1", { versionName: "Amazon Java Developer" });

    const duplicate = await resumeVersionService.duplicateVersion("user-1", tailored.id);
    expect(duplicate.id).not.toBe(tailored.id);
    expect(duplicate.isMaster).toBe(false);

    await resumeVersionService.renameVersion("user-1", duplicate.id, "Amazon Java Developer — Updated");

    const original = await resumeVersionService.getVersion("user-1", tailored.id);
    expect(original.versionName).toBe("Amazon Java Developer");

    const masterAfter = await resumeVersionService.getVersion("user-1", master.id);
    expect(masterAfter.versionName).toBe("Master Resume");
  });
});

describe("restoreAsMaster", () => {
  it("demotes the previous master (never archives it) and promotes the target", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    const tailored = await resumeVersionService.createVersion("user-1", { versionName: "UAE Role" });

    const promoted = await resumeVersionService.restoreAsMaster("user-1", tailored.id);
    expect(promoted.isMaster).toBe(true);

    const demoted = await resumeVersionService.getVersion("user-1", master.id);
    expect(demoted.isMaster).toBe(false);
    expect(demoted.isArchived).toBe(false); // preserved in history, not deleted

    const versions = await resumeVersionService.listVersions("user-1");
    expect(versions).toHaveLength(2);
    expect(versions.filter((v) => v.isMaster)).toHaveLength(1);
  });
});

describe("Dynamic Resume Builder — resume_data/ats_score sync (Phase 15 Milestone 2)", () => {
  it("addEntry updates resume_data to reflect the new content, not just sections_data", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    const withSection = await resumeVersionService.addSection("user-1", master.id, "EXPERIENCE");
    // baseResume already has a summary/skills, so lazy migration seeds those
    // sections too — the new EXPERIENCE section isn't necessarily index 0.
    const sectionId = withSection.sectionsData!.sections.find((s) => s.type === "EXPERIENCE")!.id;

    const updated = await resumeVersionService.addEntry("user-1", master.id, sectionId, { jobTitle: "Software Engineer", company: "Acme", current: true });

    expect(updated.resumeData.workExperience).toHaveLength(1);
    expect(updated.resumeData.workExperience[0].title).toBe("Software Engineer");
    expect(updated.resumeData.workExperience[0].company).toBe("Acme");
  });

  it("updateEntry propagates an edited field into resume_data — the exact 'Resume Chat/ATS/JD Matching should see the updated value' scenario", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    const withSection = await resumeVersionService.addSection("user-1", master.id, "EXPERIENCE");
    const sectionId = withSection.sectionsData!.sections.find((s) => s.type === "EXPERIENCE")!.id;
    const withEntry = await resumeVersionService.addEntry("user-1", master.id, sectionId, { jobTitle: "Software Engineer", company: "Acme" });
    const entryId = withEntry.sectionsData!.sections.find((s) => s.type === "EXPERIENCE")!.entries[0].id;

    const updated = await resumeVersionService.updateEntry("user-1", master.id, sectionId, entryId, { fields: { jobTitle: "Lead Full Stack Developer" } });

    expect(updated.resumeData.workExperience[0].title).toBe("Lead Full Stack Developer");
  });

  it("recomputes ats_score (via the existing deterministic scorer) after a builder edit, using the mocked score", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    expect(master.atsScore).toBe(82); // from createVersion's own call

    // EDUCATION — baseResume has no education, so this doesn't collide with the SUMMARY/SKILLS sections lazy migration already seeded.
    const updated = await resumeVersionService.addSection("user-1", master.id, "EDUCATION");
    expect(updated.atsScore).toBe(82); // same mocked deterministic scorer, called again — never stale, never an LLM call
  });

  it("does not touch jd_match_score/matchedSkills/missingSkills on a builder edit — only an explicit JD-optimization run does that", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    computeJdMatchForResume.mockResolvedValue({
      matchResult: { atsScore: 94, overallMatch: 91, matchedSkills: ["Java"], missingSkills: ["Kubernetes"], optimizedSummary: "", optimizedExperience: [], optimizedProjects: [], optimizedSkills: [], improvementSuggestions: [] },
    });
    const tailored = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1", jobDescriptionText: "JD text" });
    expect(tailored.jdMatchScore).toBe(91);

    const updated = await resumeVersionService.addSection("user-1", tailored.id, "EDUCATION");

    expect(updated.jdMatchScore).toBe(91); // unchanged by the builder edit
    expect(updated.matchedSkills).toEqual(["Java"]); // unchanged
    expect(computeJdMatchForResume).toHaveBeenCalledTimes(1); // only createVersion's own call — the builder edit made zero new LLM calls
  });
});

describe("updatePersonalInformation (Phase 15 Milestone 2)", () => {
  it("updates the dynamic document's personalInformation and syncs it into resume_data.contact", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    const updated = await resumeVersionService.updatePersonalInformation("user-1", master.id, { name: "Updated Name", email: "updated@example.com" });

    expect(updated.sectionsData!.personalInformation.name).toBe("Updated Name");
    expect(updated.resumeData.contact.name).toBe("Updated Name");
    expect(updated.resumeData.contact.email).toBe("updated@example.com");
  });

  it("is blocked for a version owned by a different user", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-A", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.updatePersonalInformation("user-B", master.id, { name: "Attacker" })).rejects.toBeInstanceOf(ResumeVersionNotFoundError);
  });
});

describe("field validation is enforced through the full service layer, not just the pure function (Phase 15 Milestone 2)", () => {
  it("addEntry rejects an unknown field key end-to-end", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    const withSection = await resumeVersionService.addSection("user-1", master.id, "EXPERIENCE");
    const sectionId = withSection.sectionsData!.sections.find((s) => s.type === "EXPERIENCE")!.id;

    await expect(resumeVersionService.addEntry("user-1", master.id, sectionId, { maliciousField: "payload" })).rejects.toThrow(/not a supported field/);
  });
});

describe("Section and entry ordering (Phase 15 Milestone 3)", () => {
  it("reorderSections persists the new order and it survives a fresh read", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    // baseResume's summary+skills already seed SUMMARY/SKILLS sections via lazy migration.
    const withSection = await resumeVersionService.addSection("user-1", master.id, "EDUCATION");
    const sections = withSection.sectionsData!.sections;
    const reversedIds = [...sections].sort((a, b) => b.order - a.order).map((s) => s.id);

    await resumeVersionService.reorderSections("user-1", master.id, reversedIds);

    const reloaded = await resumeVersionService.getVersion("user-1", master.id);
    const byOrder = [...reloaded.sectionsData!.sections].sort((a, b) => a.order - b.order);
    expect(byOrder.map((s) => s.id)).toEqual(reversedIds);
  });

  it("a reorder payload with a duplicate id is rejected and the previously-persisted order is left untouched (atomicity)", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    const withSection = await resumeVersionService.addSection("user-1", master.id, "EDUCATION");
    const sections = withSection.sectionsData!.sections;
    const [first] = sections;

    await expect(resumeVersionService.reorderSections("user-1", master.id, [first.id, first.id])).rejects.toThrow(/Invalid reorder request/);

    const reloaded = await resumeVersionService.getVersion("user-1", master.id);
    expect(reloaded.sectionsData!.sections).toHaveLength(sections.length); // nothing dropped
  });

  it("a reorder payload referencing a section id from a different user's document is rejected — never trusts the client's array", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const ownVersion = await resumeVersionService.createVersion("user-A", { resumeId: "ephemeral-1" });
    const otherVersion = await resumeVersionService.createVersion("user-B", { resumeId: "ephemeral-1" });
    const otherSectionId = otherVersion.sectionsData
      ? otherVersion.sectionsData.sections[0]?.id
      : (await resumeVersionService.getDynamicDocument("user-B", otherVersion.id)).sections[0]?.id;

    await expect(resumeVersionService.reorderSections("user-A", ownVersion.id, [otherSectionId ?? "unknown-id"])).rejects.toThrow();
  });

  it("reordering Experience entries propagates into resume_data.workExperience's order — ATS/JD-matching/chat all read that array", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    const withSection = await resumeVersionService.addSection("user-1", master.id, "EXPERIENCE");
    const sectionId = withSection.sectionsData!.sections.find((s) => s.type === "EXPERIENCE")!.id;
    let withEntries = await resumeVersionService.addEntry("user-1", master.id, sectionId, { jobTitle: "Senior Engineer", company: "Acme" });
    withEntries = await resumeVersionService.addEntry("user-1", master.id, sectionId, { jobTitle: "Engineer", company: "Beta" });
    const [seniorEntry, engineerEntry] = withEntries.sectionsData!.sections.find((s) => s.id === sectionId)!.entries;

    expect(withEntries.resumeData.workExperience.map((job) => job.title)).toEqual(["Senior Engineer", "Engineer"]);

    const reordered = await resumeVersionService.reorderEntries("user-1", master.id, sectionId, [engineerEntry.id, seniorEntry.id]);

    expect(reordered.resumeData.workExperience.map((job) => job.title)).toEqual(["Engineer", "Senior Engineer"]);
  });

  it("reordering never triggers the JD-optimization LLM pipeline — only the deterministic scorer runs", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    const withSection = await resumeVersionService.addSection("user-1", master.id, "EDUCATION");
    const ids = withSection.sectionsData!.sections.map((s) => s.id).reverse();

    await resumeVersionService.reorderSections("user-1", master.id, ids);

    expect(computeJdMatchForResume).not.toHaveBeenCalled();
  });
});

describe("Template selection (Phase 15 Milestone 4)", () => {
  it("saveTemplateSettings never touches resume content, ats_score, or jd_match_score — presentation only", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    computeJdMatchForResume.mockResolvedValue({
      matchResult: { atsScore: 94, overallMatch: 91, matchedSkills: ["Java"], missingSkills: [], optimizedSummary: "", optimizedExperience: [], optimizedProjects: [], optimizedSkills: [], improvementSuggestions: [] },
    });
    const tailored = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1", jobDescriptionText: "JD text" });

    const updated = await resumeVersionService.saveTemplateSettings("user-1", tailored.id, { templateId: "executive" });

    expect(updated.resumeData).toEqual(tailored.resumeData); // untouched
    expect(updated.atsScore).toBe(tailored.atsScore); // untouched
    expect(updated.jdMatchScore).toBe(tailored.jdMatchScore); // untouched
    expect(updated.matchedSkills).toEqual(tailored.matchedSkills); // untouched
    expect(updated.sectionsData).toEqual(tailored.sectionsData); // the raw persisted column — still null, template settings live in their own column entirely
    expect(computeJdMatchForResume).toHaveBeenCalledTimes(1); // only createVersion's own call — zero new LLM calls from a template switch
  });

  it("switching templates updates the same version row — never creates a new version", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await resumeVersionService.saveTemplateSettings("user-1", master.id, { templateId: "classic" });
    await resumeVersionService.saveTemplateSettings("user-1", master.id, { templateId: "gcc" });

    const versions = await resumeVersionService.listVersions("user-1");
    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe(master.id);
  });

  it("getTemplateSettings falls back to DEFAULT_TEMPLATE_SETTINGS (modern) for a version that has never set one — existing resumes keep working", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    const settings = await resumeVersionService.getTemplateSettings("user-1", master.id);
    expect(settings.templateId).toBe("modern");
  });

  it("rejects an unregistered templateId — never trusts the client-supplied value", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.saveTemplateSettings("user-1", master.id, { templateId: "fake-template" as never })).rejects.toThrow();
  });

  it("is blocked for a version owned by a different user", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-A", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.saveTemplateSettings("user-B", master.id, { templateId: "executive" })).rejects.toBeInstanceOf(ResumeVersionNotFoundError);
  });

  it("is allowed on the Master Resume — a deterministic, non-AI, presentation-only edit", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.saveTemplateSettings("user-1", master.id, { templateId: "minimal" })).resolves.not.toThrow();
  });
});

describe("Presentation settings — margin/pageSize/Reset Design (Phase 15 Milestone 5)", () => {
  it("saveTemplateSettings persists margin/pageSize and reload reflects them", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await resumeVersionService.saveTemplateSettings("user-1", master.id, { margin: "wide", pageSize: "a4" });

    const reloaded = await resumeVersionService.getTemplateSettings("user-1", master.id);
    expect(reloaded.margin).toBe("wide");
    expect(reloaded.pageSize).toBe("a4");
  });

  it("getTemplateSettings fills in margin/pageSize defaults for a row saved before Milestone 5 added those fields (backward compatibility)", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    await resumeVersionService.saveTemplateSettings("user-1", master.id, { templateId: "executive", accentColor: "navy" });

    // Simulate a legacy row: strip the two fields this milestone introduced, as if written by pre-Milestone-5 code.
    const row = rows.find((candidate) => candidate.id === master.id)!;
    const legacySettings = { ...(row.template_settings as Record<string, unknown>) };
    delete legacySettings.margin;
    delete legacySettings.pageSize;
    row.template_settings = legacySettings;

    const settings = await resumeVersionService.getTemplateSettings("user-1", master.id);
    expect(settings.margin).toBe("normal");
    expect(settings.pageSize).toBe("letter");
    expect(settings.templateId).toBe("executive"); // fields that DID exist before this milestone are still preserved exactly
    expect(settings.accentColor).toBe("navy");
  });

  it("rejects an unregistered margin or pageSize end-to-end", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.saveTemplateSettings("user-1", master.id, { margin: "extra-wide" as never })).rejects.toThrow();
    await expect(resumeVersionService.saveTemplateSettings("user-1", master.id, { pageSize: "legal" as never })).rejects.toThrow();
  });

  it("changing margin/pageSize never touches resume content, ats_score, or jd_match_score", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    computeJdMatchForResume.mockResolvedValue({
      matchResult: { atsScore: 94, overallMatch: 91, matchedSkills: ["Java"], missingSkills: [], optimizedSummary: "", optimizedExperience: [], optimizedProjects: [], optimizedSkills: [], improvementSuggestions: [] },
    });
    const tailored = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1", jobDescriptionText: "JD text" });

    const updated = await resumeVersionService.saveTemplateSettings("user-1", tailored.id, { margin: "narrow", pageSize: "a4" });

    expect(updated.resumeData).toEqual(tailored.resumeData);
    expect(updated.atsScore).toBe(tailored.atsScore);
    expect(updated.jdMatchScore).toBe(tailored.jdMatchScore);
    expect(computeJdMatchForResume).toHaveBeenCalledTimes(1); // only createVersion's own call
  });

  it("resetDesign-equivalent patch (the UI's Reset Design button) restores a template's own defaults, including margin/pageSize back to normal/letter", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    await resumeVersionService.saveTemplateSettings("user-1", master.id, { templateId: "executive", accentColor: "purple", fontFamily: "times", margin: "wide", pageSize: "a4", spacing: "spacious" });

    // Mirrors ThemeControls.tsx's resetDesign(): the executive template's own registry defaults (navy/georgia), plus the schema's standard values for everything else.
    const reset = await resumeVersionService.saveTemplateSettings("user-1", master.id, {
      accentColor: "navy",
      fontFamily: "georgia",
      fontSize: "standard",
      spacing: "standard",
      pageLength: "auto",
      margin: "normal",
      pageSize: "letter",
      atsMode: false,
    });

    expect(reset.templateSettings).toEqual({
      templateId: "executive", // reset never touches which template is selected
      accentColor: "navy",
      fontFamily: "georgia",
      fontSize: "standard",
      spacing: "standard",
      atsMode: false,
      pageLength: "auto",
      margin: "normal",
      pageSize: "letter",
    });
  });
});

describe("Layout & pagination stability at scale (Phase 15 Milestone 6)", () => {
  it("saveDynamicDocument/resume_data sync remains correct and in-order with 50 experience entries", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });
    let version = await resumeVersionService.addSection("user-1", master.id, "EXPERIENCE");
    const sectionId = version.sectionsData!.sections.find((s) => s.type === "EXPERIENCE")!.id;

    for (let i = 0; i < 50; i++) {
      version = await resumeVersionService.addEntry("user-1", master.id, sectionId, { jobTitle: `Engineer ${i}`, company: `Company ${i}` });
    }

    expect(version.sectionsData!.sections.find((s) => s.id === sectionId)!.entries).toHaveLength(50);
    expect(version.resumeData.workExperience).toHaveLength(50);
    expect(version.resumeData.workExperience.map((job) => job.title)).toEqual(Array.from({ length: 50 }, (_, i) => `Engineer ${i}`));
    expect(typeof version.atsScore).toBe("number"); // the deterministic scorer completed without throwing on a large document
  });
});

describe("compareVersions", () => {
  it("computes score deltas and skill set differences deterministically", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-1", { resumeId: "ephemeral-1" });

    computeJdMatchForResume.mockResolvedValue({
      matchResult: {
        atsScore: 94,
        overallMatch: 91,
        matchedSkills: ["Java", "AWS"],
        missingSkills: [],
        optimizedSummary: "Lead Full Stack Developer",
        optimizedExperience: [],
        optimizedProjects: [],
        optimizedSkills: [],
        improvementSuggestions: [],
      },
    });
    const tailored = await resumeVersionService.createVersion("user-1", { versionName: "UAE Role", jobDescriptionText: "JD text" });

    const comparison = await resumeVersionService.compareVersions("user-1", master.id, tailored.id);

    expect(comparison.atsScoreDelta).toBe(94 - 82);
    expect(comparison.jdMatchScoreDelta).toBeNull(); // master has no jdMatchScore
    expect(comparison.skillsAdded).toEqual(["Java", "AWS"]);
    expect(comparison.summaryChanged).toBe(true);
  });

  it("throws NotFoundError if either version isn't owned by the caller", async () => {
    resumeServiceGet.mockReturnValue({ resume: baseResume });
    const master = await resumeVersionService.createVersion("user-A", { resumeId: "ephemeral-1" });

    await expect(resumeVersionService.compareVersions("user-B", master.id, master.id)).rejects.toBeInstanceOf(ResumeVersionNotFoundError);
  });
});
