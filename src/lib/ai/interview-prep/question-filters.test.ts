import { describe, expect, it } from "vitest";

import { DEFAULT_QUESTION_FILTERS, filterQuestions } from "./question-filters";
import { BrowsableQuestion } from "./interview-coverage";

// Phase 17 Milestone 4, §7/§8/§15.6/§15.7/§15.9 — deterministic tests
// for the one reusable client-side filter/search utility. No LLM, no
// network — pure array filtering over already-loaded data.

const questions: BrowsableQuestion[] = [
  { id: "technical-0", question: "Explain your experience with Kafka.", category: "technical", topic: "Kafka", difficulty: "Hard", priority: "CRITICAL", evidenceSource: "JD", reason: "Mandatory JD requirement.", studyOrder: 1 },
  { id: "technical-1", question: "Explain your experience with Java.", category: "technical", topic: "Java", difficulty: "Medium", priority: "HIGH", evidenceSource: "Resume", reason: "Core technology explicitly listed on the resume.", studyOrder: 2 },
  { id: "hr-0", question: "Tell me about a time you led a team.", category: "behavioral", topic: "Leadership", difficulty: null, priority: "MEDIUM", evidenceSource: null, reason: "Standard behavioral interview category.", studyOrder: 3 },
  { id: "project-0", question: "Walk me through Inventory System.", category: "resume", topic: "Inventory System", difficulty: null, priority: "HIGH", evidenceSource: "Resume", reason: "Real project from your resume.", studyOrder: 4 },
];

describe("filterQuestions — category (§7/§15.7)", () => {
  it("returns only questions in the selected category", () => {
    const result = filterQuestions(questions, { ...DEFAULT_QUESTION_FILTERS, category: "technical" });
    expect(result.map((q) => q.id)).toEqual(["technical-0", "technical-1"]);
  });

  it("'All' returns every question, unfiltered by category", () => {
    expect(filterQuestions(questions, DEFAULT_QUESTION_FILTERS)).toHaveLength(4);
  });
});

describe("filterQuestions — priority (§7/§15.6)", () => {
  it("returns only questions at the selected priority", () => {
    const result = filterQuestions(questions, { ...DEFAULT_QUESTION_FILTERS, priority: "CRITICAL" });
    expect(result.map((q) => q.id)).toEqual(["technical-0"]);
  });
});

describe("filterQuestions — difficulty (§7)", () => {
  it("returns only questions at the selected difficulty", () => {
    const result = filterQuestions(questions, { ...DEFAULT_QUESTION_FILTERS, difficulty: "Hard" });
    expect(result.map((q) => q.id)).toEqual(["technical-0"]);
  });
});

describe("filterQuestions — search (§8/§15.9)", () => {
  it("matches on question text", () => {
    const result = filterQuestions(questions, { ...DEFAULT_QUESTION_FILTERS, search: "Kafka" });
    expect(result.map((q) => q.id)).toEqual(["technical-0"]);
  });

  it("matches on topic", () => {
    const result = filterQuestions(questions, { ...DEFAULT_QUESTION_FILTERS, search: "Inventory System" });
    expect(result.map((q) => q.id)).toEqual(["project-0"]);
  });

  it("matches on evidence source", () => {
    const result = filterQuestions(questions, { ...DEFAULT_QUESTION_FILTERS, search: "resume" });
    expect(result.map((q) => q.id).sort()).toEqual(["project-0", "technical-1"].sort());
  });

  it("is case-insensitive", () => {
    expect(filterQuestions(questions, { ...DEFAULT_QUESTION_FILTERS, search: "KAFKA" })).toHaveLength(1);
  });
});

describe("filterQuestions — combined filters (§7/§15.6/§15.7)", () => {
  it("applies category, priority, and search together (AND, not OR)", () => {
    const result = filterQuestions(questions, { category: "technical", priority: "HIGH", difficulty: "All", search: "java" });
    expect(result.map((q) => q.id)).toEqual(["technical-1"]);
  });

  it("returns an empty list when filters exclude everything, never a crash", () => {
    const result = filterQuestions(questions, { category: "coding", priority: "All", difficulty: "All", search: "" });
    expect(result).toEqual([]);
  });
});
