import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import {
  CandidateExportContext,
  renderCandidateListCsv,
  renderCandidateListExcel,
  renderCandidateListPdf,
  renderCandidateReportPdf,
  renderComparisonCsv,
  renderComparisonExcel,
  renderHiringDecisionReportCsv,
} from "./candidate-export";
import { CandidateProfile, CandidateSummary, ComparisonRow, DecisionHistoryEntry } from "./candidate-types";
import { Resume } from "../resume/resume-schema";
import { RecruiterAnalytics } from "./recruiter-analytics-types";
import { RecruiterJobRecord } from "./recruiter-job-types";

// Phase 16 Milestone 5, §19 — deterministic tests for CSV
// formula-injection protection, no LLM/network involved.

function candidate(overrides: Partial<CandidateSummary> = {}): CandidateSummary {
  return {
    candidateId: "c1",
    jobId: null,
    name: "Jane Doe",
    email: null,
    phone: null,
    currentRole: null,
    currentCompany: null,
    experienceYears: null,
    location: null,
    noticePeriod: null,
    expectedSalary: null,
    status: "Pending Review",
    tags: [],
    scores: {
      resumeScore: null,
      atsScore: null,
      jdMatch: null,
      experienceScore: null,
      skillsScore: null,
      projectsScore: null,
      leadershipScore: null,
      communicationScore: null,
      cloudScore: null,
      aiScore: null,
      devOpsScore: null,
      certificationScore: null,
      interviewReadiness: null,
      overallScore: null,
    },
    importedAt: new Date().toISOString(),
    evaluatedAt: null,
    fitScore: 0,
    fitLevel: "LOW",
    recommendedAction: "",
    evaluationStatus: "not_evaluated",
    ...overrides,
  };
}

describe("renderCandidateListCsv — formula injection protection (Phase 16 Milestone 5, §19)", () => {
  it.each(["=CMD('/C calc')", "+1+1", "-2+3", "@SUM(A1:A9)"])("neutralizes a name starting with %s", (dangerous) => {
    const csv = renderCandidateListCsv([candidate({ name: dangerous })]);
    const nameCell = csv.split("\n")[1].split(",")[0];

    // Still starts with the dangerous prefix as literal TEXT once a
    // spreadsheet app strips the leading apostrophe on display — the
    // apostrophe itself (not present in the underlying value) is what
    // prevents formula evaluation.
    expect(nameCell.replace(/^"|"$/g, "")).toBe(`'${dangerous}`);
  });

  it("does not alter a name that merely CONTAINS one of the dangerous characters, only one that STARTS with it", () => {
    const csv = renderCandidateListCsv([candidate({ name: "Anne-Marie" })]);
    const nameCell = csv.split("\n")[1].split(",")[0];
    expect(nameCell).toBe("Anne-Marie");
  });

  it("still applies the existing comma/quote/newline escaping alongside injection protection", () => {
    const csv = renderCandidateListCsv([candidate({ name: '=HYPERLINK("http://evil","click"),extra' })]);
    const line = csv.split("\n")[1];

    // The whole neutralized+comma-containing value must be quoted, not split across cells.
    expect(line.startsWith('"\'=HYPERLINK')).toBe(true);
  });

  it("leaves ordinary candidate names completely untouched", () => {
    const csv = renderCandidateListCsv([candidate({ name: "Jane Doe" })]);
    expect(csv.split("\n")[1].split(",")[0]).toBe("Jane Doe");
  });

  it("includes the Milestone 5 screening columns (Fit, Fit Level, Evaluation Status, Recommended Action)", () => {
    const csv = renderCandidateListCsv([candidate({ fitScore: 82, fitLevel: "GOOD", evaluationStatus: "stale", recommendedAction: "Review" })]);
    const header = csv.split("\n")[0];

    expect(header).toContain("Candidate Fit");
    expect(header).toContain("Fit Level");
    expect(header).toContain("Evaluation Status");
    expect(header).toContain("Recommended Action");

    const row = csv.split("\n")[1];
    expect(row).toContain("82");
    expect(row).toContain("GOOD");
    expect(row).toContain("Stale");
    expect(row).toContain("Review");
  });
});

function job(id: string, overrides: Partial<RecruiterJobRecord> = {}): RecruiterJobRecord {
  return {
    id,
    recruiterId: "recruiter-x",
    title: `Job ${id}`,
    company: null,
    jobDescriptionText: "text",
    normalizedJd: null,
    status: "Active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function decisionEntry(overrides: Partial<DecisionHistoryEntry> = {}): DecisionHistoryEntry {
  return { id: "d1", recruiterId: "r1", previousStatus: "Pending Review", newStatus: "Shortlisted", note: null, timestamp: new Date().toISOString(), ...overrides };
}

describe("renderCandidateListCsv/Excel — Milestone 9 fields (§1)", () => {
  it("never fabricates a field it has no data for — omits (empty string), never invents a value", () => {
    const csv = renderCandidateListCsv([candidate({})]);
    const header = csv.split("\n")[0].split(",");
    const row = csv.split("\n")[1].split(",");

    expect(header).toEqual(expect.arrayContaining(["Email", "Phone", "Job", "Skills Match", "Missing Skills", "Interview Readiness"]));
    // Every new field is empty (not "N/A", not "0", not fabricated) when no context/data is supplied.
    ["Email", "Phone", "Job", "Skills Match", "Missing Skills", "Interview Readiness"].forEach((label) => {
      expect(row[header.indexOf(label)]).toBe("");
    });
  });

  it("resolves Email/Phone directly from CandidateSummary — no extra fetch needed", () => {
    const csv = renderCandidateListCsv([candidate({ email: "jane@example.com", phone: "555-1234" })]);
    const header = csv.split("\n")[0].split(",");
    const row = csv.split("\n")[1].split(",");
    expect(row[header.indexOf("Email")]).toBe("jane@example.com");
    expect(row[header.indexOf("Phone")]).toBe("555-1234");
  });

  it("resolves Job/Job Company, Skills Match/Missing Skills, and Last Decision Date/Note from the supplied export context", () => {
    const ctx: CandidateExportContext = {
      jobsById: new Map([["job-1", job("job-1", { title: "Backend Engineer", company: "Acme" })]]),
      matchDetailsByCandidateId: new Map([["c1", { matchedSkills: ["Java"], missingSkills: ["Docker"], educationScore: 70, certificationScore: 60 }]]),
      decisionHistoryByCandidateId: new Map([
        ["c1", [decisionEntry({ timestamp: "2026-01-01T00:00:00.000Z" }), decisionEntry({ newStatus: "Interview Scheduled", note: "Strong fit", timestamp: "2026-01-05T00:00:00.000Z" })]],
      ]),
    };

    const csv = renderCandidateListCsv([candidate({ candidateId: "c1", jobId: "job-1" })], ctx);
    const header = csv.split("\n")[0].split(",");
    const row = csv.split("\n")[1].split(",");

    expect(row[header.indexOf("Job")]).toBe("Backend Engineer");
    expect(row[header.indexOf("Job Company")]).toBe("Acme");
    expect(row[header.indexOf("Skills Match")]).toBe("Java");
    expect(row[header.indexOf("Missing Skills")]).toBe("Docker");
    expect(row[header.indexOf("Education Match")]).toBe("70");
    // Last Decision Date must reflect the MOST RECENT (last) entry, not the first.
    expect(row[header.indexOf("Last Decision Date")]).toBe("2026-01-05T00:00:00.000Z");
    expect(row[header.indexOf("Last Decision Note")]).toBe("Strong fit");
  });

  it("Interview Eligible reuses buildInterviewEligibility() (Milestone 8), never a separate check", () => {
    const eligible = candidate({ status: "Shortlisted", evaluationStatus: "complete", scores: { ...candidate().scores, jdMatch: 80 } });
    const notEligible = candidate({ status: "Pending Review", evaluationStatus: "not_evaluated" });

    const csv = renderCandidateListCsv([eligible, notEligible]);
    const header = csv.split("\n")[0].split(",");
    const rows = csv.split("\n").slice(1);

    expect(rows[0].split(",")[header.indexOf("Interview Eligible")]).toBe("Yes");
    expect(rows[1].split(",")[header.indexOf("Interview Eligible")]).toBe("No");
  });

  it("XLSX: a candidate-controlled value starting with '=' is written as a literal string cell, never a live formula (§11)", async () => {
    const buffer = await renderCandidateListExcel([candidate({ name: "=CMD('/C calc')" })]);

    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Candidates")!;
    const nameCell = sheet.getRow(2).getCell(1);

    // exceljs' own re-parse must report this as a plain string value —
    // never a formula-result object ({formula, result}) — proving the
    // written cell is type "s" (shared string), not a live formula.
    expect(typeof nameCell.value).toBe("string");
    expect(nameCell.value).toBe("=CMD('/C calc')");
  });
});

describe("renderComparisonCsv/Excel — Milestone 9, §7", () => {
  const candidates = [
    candidate({ candidateId: "c1", name: "Alice", status: "Shortlisted", scores: { ...candidate().scores, interviewReadiness: 72 } }),
    candidate({ candidateId: "c2", name: "Bob", status: "Rejected", scores: { ...candidate().scores, interviewReadiness: null } }),
  ];
  const table: ComparisonRow[] = [{ metric: "Overall Score", values: { c1: 88, c2: 60 } }];

  it("renders the exact same table already computed by buildComparisonTable — no recomputation", () => {
    const csv = renderComparisonCsv(candidates, table);
    const rows = csv.split("\n");
    expect(rows[0]).toBe("Metric,Alice,Bob");
    expect(rows.find((r) => r.startsWith("Overall Score"))).toBe("Overall Score,88,60");
  });

  it("appends Status and Interview Readiness as supplementary rows from the already-fetched CandidateSummary", () => {
    const csv = renderComparisonCsv(candidates, table);
    expect(csv).toContain("Status,Shortlisted,Rejected");
    expect(csv).toContain("Interview Readiness,72,");
  });

  it("XLSX comparison export produces one column per candidate, keyed by candidateId", async () => {
    const buffer = await renderComparisonExcel(candidates, table);
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Comparison")!;
    expect(sheet.getRow(1).getCell(2).value).toBe("Alice");
    expect(sheet.getRow(1).getCell(3).value).toBe("Bob");
  });
});

describe("renderHiringDecisionReportCsv — Milestone 9, §4/§8 (pure rendering of the existing analytics engine)", () => {
  function analytics(overrides: Partial<RecruiterAnalytics> = {}): RecruiterAnalytics {
    return {
      scope: { jobId: null, job: null },
      overall: { totalJobs: 1, totalCandidates: 10, evaluatedCandidates: 8, unevaluatedCandidates: 2, staleCandidates: 0, averageJdMatch: 70, averageAtsScore: 75, averageCandidateFit: 72 },
      fitDistribution: { strongCount: 2, goodCount: 3, moderateCount: 3, lowCount: 2 },
      evaluationDistribution: { notEvaluated: 2, complete: 7, stale: 1 },
      conversionRates: { shortlistRate: 40, interviewRate: 20, hireRate: 10 },
      interviewFunnel: {
        interviewCandidates: 2,
        interviewEligibleCandidates: 1,
        shortlistToInterviewRate: 50,
        interviewToHireRate: 50,
        rejectedAfterInterviewCount: 1,
        hireCount: 1,
        interviewedCohortCount: 4,
        hiredAfterInterviewCount: 1,
      },
      statusDistribution: {
        "Pending Review": 2,
        Shortlisted: 4,
        "Interview Scheduled": 2,
        "On Hold": 0,
        Offer: 0,
        Hired: 1,
        Rejected: 1,
      },
      screeningFunnel: [],
      jobAnalytics: [],
      topCandidates: [
        {
          candidateId: "c1",
          rank: 1,
          rankingScore: 91,
          level: "STRONG",
          summary: candidate({ candidateId: "c1", name: "Alice", status: "Shortlisted" }),
        },
      ],
      skillGaps: [],
      attentionQueue: [],
      ...overrides,
    };
  }

  it("includes Pipeline Summary, Conversion Metrics, Decision Breakdown, Interview Outcome, and Top Candidates sections, all sourced from the given analytics — no recomputation", () => {
    const csv = renderHiringDecisionReportCsv(analytics());

    expect(csv).toContain("Pipeline Summary,Total Candidates,10");
    expect(csv).toContain("Pipeline Summary,Hired,1");
    expect(csv).toContain("Conversion Metrics,Shortlist Rate,40%");
    expect(csv).toContain("Decision Breakdown,Rejected After Interview,1");
    expect(csv).toContain("Interview Outcome,Interview Eligible,1");
    expect(csv).toContain("Interview Outcome,Hired After Interview,1");
    expect(csv).toContain("Top Candidates,#1 Alice");
  });

  it("computes Awaiting Interview Decision from the raw cohort counts, never a separate stored value", () => {
    const csv = renderHiringDecisionReportCsv(analytics());
    // interviewedCohortCount(4) - hiredAfterInterviewCount(1) - rejectedAfterInterviewCount(1) = 2
    expect(csv).toContain("Interview Outcome,Awaiting Interview Decision,2");
  });

  it("shows 'Not available' (never a fabricated 0%) when a conversion rate's cohort is empty", () => {
    const csv = renderHiringDecisionReportCsv(analytics({ conversionRates: { shortlistRate: null, interviewRate: null, hireRate: null } }));
    expect(csv).toContain("Conversion Metrics,Shortlist Rate,Not available");
  });
});

// Phase 16 Milestone 10, §8 — audited: renderCandidateListPdf/
// renderCandidateReportPdf (Milestone 5) had ZERO existing test
// coverage, a genuine production-readiness gap this milestone's own
// Export Regression Test explicitly calls out ("long skills/missing-
// skills do not overflow", "page breaks remain valid"). These render
// real PDF buffers (pdfkit) under adversarial content — very long
// skill lists, many work-experience entries with long bullets, and
// non-ASCII text — and assert the result is a well-formed, non-trivial
// PDF rather than a thrown exception or a truncated/empty buffer.
describe("renderCandidateListPdf/renderCandidateReportPdf — export regression (Phase 16 Milestone 10, §8)", () => {
  it("renderCandidateListPdf handles a long tag list and unicode names without throwing", async () => {
    const manyTags = Array.from({ length: 12 }, (_, i) => `Skill-${i}-${"x".repeat(20)}`) as CandidateSummary["tags"];
    const buffer = await renderCandidateListPdf([candidate({ name: "Zoë Müller-Åström", tags: manyTags })]);

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("renderCandidateReportPdf handles unicode, very long skill lists, and many work-experience bullets without throwing", async () => {
    const longSkills = Array.from({ length: 150 }, (_, i) => `Skill-${i}-日本語-🚀-${"y".repeat(20)}`);

    const resume = {
      contact: { name: "Zoë Müller-Åström", email: "z@example.com", phone: "+49", location: "München", linkedin: null, github: null, website: null },
      summary: "A".repeat(2000),
      skills: longSkills,
      technicalSkills: longSkills,
      softSkills: [],
      workExperience: Array.from({ length: 10 }, (_, i) => ({
        title: `Role ${i}`,
        company: `Company ${i}`,
        isCurrent: i === 0,
        startDate: "2020",
        endDate: "2021",
        location: null,
        description: Array.from({ length: 20 }, (_, j) => `Bullet ${j} `.repeat(15)),
      })),
      education: [],
      certifications: Array.from({ length: 30 }, (_, i) => ({ name: `Cert ${i}`, issuer: "Issuer" })),
      projects: [],
      achievements: [],
      languages: [],
      yearsOfExperience: 12,
    } as unknown as Resume;

    const profile: CandidateProfile = {
      summary: candidate({ name: "Zoë Müller-Åström" }),
      record: {
        candidateId: "c1",
        recruiterId: "r1",
        jobId: null,
        filename: "resume.pdf",
        resumeId: "resume-1",
        resumeData: resume,
        atsScore: 80,
        jdMatchResult: null,
        interviewReadinessScore: null,
        status: "Pending Review",
        tags: [],
        notes: [],
        decisionHistory: [],
        noticePeriod: null,
        expectedSalary: null,
        insights: null,
        evaluatedAt: null,
        importedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      resume,
      jdMatchResult: null,
      recruiterSummary: {
        strengths: [],
        gaps: [],
        dataAvailability: { jdMatch: "not_provided", certifications: "available", projects: "not_provided", education: "not_provided" },
        recommendedAction: "x",
      },
      atsExplanation: null,
    };

    const buffer = await renderCandidateReportPdf(profile);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
  });
});
