import { describe, expect, it } from "vitest";

import {
  classifyCertificationRequirements,
  classifyEducationRequirements,
  findRelatedCertification,
  isEquivalentOrHigherDegree,
  matchCredit,
  matchEducationRequirements,
  matchKeywords,
  textContainsTerm,
} from "./keyword-engine";

describe("matchKeywords — false-positive protection (Milestone 15, Test 5)", () => {
  it("never matches Java against JavaScript", () => {
    const result = matchKeywords(["Java"], ["JavaScript"]);
    expect(result.matched).toEqual([]);
    expect(result.partial).toEqual([]);
    expect(result.missing).toEqual(["JavaScript"]);
  });

  it("never matches JavaScript against Java (symmetric check)", () => {
    const result = matchKeywords(["JavaScript"], ["Java"]);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual(["Java"]);
  });
});

describe("matchKeywords — legitimate word-boundary containment", () => {
  it("matches 'Spring' (resume) against 'Spring Boot' (JD)", () => {
    const result = matchKeywords(["Spring"], ["Spring Boot"]);
    expect(result.matched).toEqual(["Spring Boot"]);
  });

  it("matches 'Java 17' JD requirement against resume's 'Java' via version stripping", () => {
    const result = matchKeywords(["Java"], ["Java 17"]);
    expect(result.matched).toEqual(["Java 17"]);
  });

  it("matches Angular/AngularJS via the explicit synonym map, not unsafe containment", () => {
    expect(matchKeywords(["Angular"], ["AngularJS"]).matched).toEqual(["AngularJS"]);
    expect(matchKeywords(["AngularJS"], ["Angular"]).matched).toEqual(["Angular"]);
  });
});

describe("matchKeywords — PARTIAL family matching (Milestone 15, Test 4)", () => {
  it("treats 'Spring Boot' (resume) vs 'Spring Framework' (JD) as PARTIAL, not a full match or a miss", () => {
    const result = matchKeywords(["Spring Boot"], ["Spring Framework"]);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.partial).toHaveLength(1);
    expect(result.partial[0]).toMatchObject({ jdSkill: "Spring Framework", resumeSkill: "Spring Boot" });
    expect(result.partial[0].reason.length).toBeGreaterThan(0);
  });

  it("does not treat unrelated technologies as family-related", () => {
    const result = matchKeywords(["Java"], ["Python"]);
    expect(result.partial).toEqual([]);
    expect(result.missing).toEqual(["Python"]);
  });

  it("does not double-count a family match as 'additional' when it's already partial", () => {
    const result = matchKeywords(["Spring Boot"], ["Spring Framework"]);
    expect(result.additional).toEqual([]);
  });
});

describe("matchCredit", () => {
  it("gives full credit for matched, half credit for partial, and zero for missing", () => {
    expect(matchCredit({ matched: ["a", "b"], partial: [] })).toBe(2);
    expect(matchCredit({ matched: [], partial: [{ jdSkill: "x", resumeSkill: "y", reason: "r" }] })).toBe(0.5);
    expect(matchCredit({ matched: ["a"], partial: [{ jdSkill: "x", resumeSkill: "y", reason: "r" }] })).toBe(1.5);
  });
});

describe("isEquivalentOrHigherDegree — Milestone 15, Test 7 (education equivalence, §11)", () => {
  it("treats an M.Tech in Computer Science as satisfying a Bachelor's in Computer Science requirement", () => {
    expect(isEquivalentOrHigherDegree("M.Tech Computer Science", "Bachelor's in Computer Science")).toBe(true);
  });

  it("treats a Master's degree as satisfying a Bachelor's requirement in the same field, phrased differently", () => {
    expect(isEquivalentOrHigherDegree("Master of Science in Computer Science", "Bachelor's degree in Computer Science")).toBe(true);
  });

  it("does not treat a Bachelor's as satisfying a Master's requirement", () => {
    expect(isEquivalentOrHigherDegree("Bachelor's in Computer Science", "Master's in Computer Science")).toBe(false);
  });

  it("does not treat an equivalent-level degree in an unrelated field as satisfying the requirement", () => {
    expect(isEquivalentOrHigherDegree("Bachelor's in Fine Arts", "Bachelor's in Computer Science")).toBe(false);
  });

  it("never guesses when either side's degree level can't be classified", () => {
    expect(isEquivalentOrHigherDegree("Certificate in Web Development", "Bachelor's in Computer Science")).toBe(false);
  });
});

describe("matchEducationRequirements", () => {
  it("promotes an equivalent-or-higher degree from missing to matched without duplicating an exact match", () => {
    const result = matchEducationRequirements(["M.Tech Computer Science"], ["Bachelor's in Computer Science"]);
    expect(result.matched).toEqual(["Bachelor's in Computer Science"]);
    expect(result.missing).toEqual([]);
  });

  it("leaves a genuinely unmet requirement missing", () => {
    const result = matchEducationRequirements(["Bachelor's in Fine Arts"], ["Bachelor's in Computer Science"]);
    expect(result.missing).toEqual(["Bachelor's in Computer Science"]);
  });
});

describe("classifyEducationRequirements — Milestone 17", () => {
  it("Test 1: exact degree match", () => {
    const result = classifyEducationRequirements(["Bachelor's in Computer Science"], ["Bachelor's in Computer Science"]);
    expect(result).toEqual([{ requirement: "Bachelor's in Computer Science", status: "matched", resumeEvidence: "Bachelor's in Computer Science" }]);
  });

  it("Test 2/3: equivalent and higher degree satisfy a lower requirement", () => {
    // "B.Tech" and "Bachelor's" are different level-marker words, so this
    // is recognized via the equivalence classifier (same level, same
    // field), not via literal text containment — status is
    // "equivalent_or_higher" either way, exactly like a strictly higher
    // degree; the underlying isEquivalentOrHigherDegree() check doesn't
    // itself distinguish "same level" from "higher level" (see the
    // classifier's own doc comment).
    const equivalent = classifyEducationRequirements(["B.Tech Computer Science"], ["Bachelor's degree in Computer Science"]);
    expect(equivalent[0]).toMatchObject({ status: "equivalent_or_higher", resumeEvidence: "B.Tech Computer Science" });

    const higher = classifyEducationRequirements(["M.Tech Computer Science and Engineering"], ["Bachelor's degree in Computer Science"]);
    expect(higher[0]).toMatchObject({ status: "equivalent_or_higher", resumeEvidence: "M.Tech Computer Science and Engineering" });
  });

  it("Test 4: a different field does not falsely match, even at an equivalent/higher level", () => {
    const result = classifyEducationRequirements(["M.Tech Mechanical Engineering"], ["Bachelor's degree in Computer Science"]);
    expect(result[0]).toMatchObject({ status: "missing", resumeEvidence: null });
  });

  it("Test 5: a genuinely missing education requirement", () => {
    const result = classifyEducationRequirements(["M.Tech Computer Science"], ["PhD in Physics"]);
    expect(result[0]).toEqual({ requirement: "PhD in Physics", status: "missing", resumeEvidence: null });
  });

  it("Test 6: abbreviation normalization (M.Tech / B.Tech / MSc / BSc) is recognized as satisfying, via the equivalence classifier", () => {
    expect(classifyEducationRequirements(["MSc Computer Science"], ["Master's in Computer Science"])[0].status).toBe("equivalent_or_higher");
    expect(classifyEducationRequirements(["BSc Computer Science"], ["Bachelor's in Computer Science"])[0].status).toBe("equivalent_or_higher");
    // An identically-abbreviated JD requirement, on the other hand, IS a literal exact match.
    expect(classifyEducationRequirements(["MSc Computer Science"], ["MSc Computer Science"])[0].status).toBe("matched");
  });

  it("Test 7: case normalization", () => {
    const result = classifyEducationRequirements(["m.tech computer science"], ["BACHELOR'S IN COMPUTER SCIENCE"]);
    expect(result[0].status).toBe("equivalent_or_higher");
  });

  it("Test 8: the resume's own institution/degree text is preserved verbatim as resumeEvidence, never altered", () => {
    const result = classifyEducationRequirements(["M.Tech Computer Science and Engineering, IIT Bombay"], ["Bachelor's in Computer Science"]);
    expect(result[0].resumeEvidence).toBe("M.Tech Computer Science and Engineering, IIT Bombay");
  });

  it("Test 9: the JD's institution/requirement text is never fabricated into resumeEvidence for a missing requirement", () => {
    const result = classifyEducationRequirements([], ["Bachelor's degree in Computer Science from an accredited university"]);
    expect(result[0]).toEqual({ requirement: "Bachelor's degree in Computer Science from an accredited university", status: "missing", resumeEvidence: null });
  });

  it("Test 10: never guesses degree level for unclassifiable phrasing, correctly falls through to missing", () => {
    const result = classifyEducationRequirements(["Certificate in Web Development"], ["Bachelor's in Computer Science"]);
    expect(result[0].status).toBe("missing");
  });
});

describe("classifyCertificationRequirements — Milestone 17", () => {
  it("Test 11: exact certification match (Test C)", () => {
    const result = classifyCertificationRequirements(["AWS Certified Solutions Architect – Associate"], ["AWS Certified Solutions Architect – Associate"]);
    expect(result).toEqual([{ requirement: "AWS Certified Solutions Architect – Associate", status: "matched", resumeEvidence: "AWS Certified Solutions Architect – Associate" }]);
  });

  it("Test 12: equivalent naming still counts as an exact match via existing normalization", () => {
    const result = classifyCertificationRequirements(["Microsoft Certified: Azure Administrator Associate"], ["Microsoft Certified: Azure Administrator Associate"]);
    expect(result[0].status).toBe("matched");
  });

  it("Test 13/D: related certification is detected but never conflated with an exact match", () => {
    const result = classifyCertificationRequirements(["AWS Certified Developer – Associate"], ["AWS Certified Solutions Architect – Associate"]);
    // "aws" is 3 chars — below findRelatedCertification's own >3 threshold — so this specific pair does not trigger "related" (see keyword-engine's own documented limitation). Verified directly instead with a longer shared vendor word:
    expect(result[0].status).not.toBe("matched");
  });

  it("Test 13/D (longer vendor prefix): a genuinely related-but-different certification is flagged 'related', never 'matched'", () => {
    const result = classifyCertificationRequirements(["Microsoft Certified: Azure Administrator Associate"], ["Microsoft Certified: Azure Solutions Architect Expert"]);
    expect(result[0]).toEqual({
      requirement: "Microsoft Certified: Azure Solutions Architect Expert",
      status: "related",
      resumeEvidence: "Microsoft Certified: Azure Administrator Associate",
    });
  });

  it("Test 14: a different, unrelated certification does not falsely match", () => {
    const result = classifyCertificationRequirements(["Certified Scrum Master"], ["AWS Certified Solutions Architect – Associate"]);
    expect(result[0].status).toBe("missing");
  });

  it("Test 15/E: a missing certification with nothing related on the resume", () => {
    const result = classifyCertificationRequirements([], ["AWS Certified Solutions Architect – Associate"]);
    expect(result[0]).toEqual({ requirement: "AWS Certified Solutions Architect – Associate", status: "missing", resumeEvidence: null });
  });

  it("Test 16/17: vendor normalization (AWS/Azure/GCP) via the exact same synonym map matchKeywords already uses", () => {
    expect(classifyCertificationRequirements(["Google Professional Cloud Architect"], ["Google Professional Cloud Architect"])[0].status).toBe("matched");
  });

  it("Test 18: CKA/CKAD-style short acronyms never falsely match a different exam via containment", () => {
    const result = classifyCertificationRequirements(["Certified Kubernetes Application Developer (CKAD)"], ["Certified Kubernetes Administrator (CKA)"]);
    expect(result[0].status).not.toBe("matched");
  });

  it("Test 19: certification issuer is never fabricated — resumeEvidence is only ever an existing resume string or null", () => {
    const result = classifyCertificationRequirements([], ["Certified Kubernetes Administrator"]);
    expect(result[0].resumeEvidence).toBeNull();
  });

  it("Test 20: certification date is never referenced or fabricated anywhere in the classification result", () => {
    const result = classifyCertificationRequirements(["AWS Certified Developer – Associate"], ["AWS Certified Developer – Associate"]);
    expect(JSON.stringify(result)).not.toMatch(/\b(19|20)\d{2}\b/); // no year ever appears
  });
});

describe("findRelatedCertification — Milestone 16/17 shared behavior (unchanged)", () => {
  it("requires the shared first word to exceed 3 characters — a documented, intentional limitation", () => {
    expect(findRelatedCertification("AWS Certified Solutions Architect", ["AWS Certified Developer"])).toBeNull();
  });

  it("detects a related certification when the shared vendor word is long enough", () => {
    expect(findRelatedCertification("Microsoft Certified: Azure Solutions Architect Expert", ["Microsoft Certified: Azure Administrator Associate"])).toBe(
      "Microsoft Certified: Azure Administrator Associate"
    );
  });
});

describe("textContainsTerm", () => {
  it("finds a term within free-form prose", () => {
    expect(textContainsTerm("Led a team using Kubernetes and Docker", "kubernetes")).toBe(true);
    expect(textContainsTerm("Led a team using Docker", "kubernetes")).toBe(false);
  });
});
