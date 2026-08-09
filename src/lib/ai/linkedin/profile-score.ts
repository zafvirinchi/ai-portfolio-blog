import { ProfileScore, ProfileScoreEntry } from "./linkedin-schema";
import { LinkedinRecord } from "./linkedin-types";

// Deterministic — no LLM call. Same "compute what can be computed"
// discipline as every score module in this arc. Every sub-score is
// paired with one recommendation, per the spec's explicit requirement.

function entry(score: number, recommendation: string): ProfileScoreEntry {
  return { score: Math.max(0, Math.min(100, Math.round(score))), recommendation };
}

function currentHeadline(record: LinkedinRecord) {
  const accepted = record.acceptedHeadlineStyle ? record.headlines[record.acceptedHeadlineStyle] : undefined;
  return accepted ?? Object.values(record.headlines)[0];
}

function currentAbout(record: LinkedinRecord) {
  const accepted = record.acceptedAboutStyle ? record.about[record.acceptedAboutStyle] : undefined;
  return accepted ?? Object.values(record.about)[0];
}

export function computeProfileScore(record: LinkedinRecord): ProfileScore {
  const headline = currentHeadline(record);
  const about = currentAbout(record);

  const headlineScore = entry(
    headline ? (record.acceptedHeadlineStyle ? 100 : 70) : 0,
    headline
      ? record.acceptedHeadlineStyle
        ? "Headline is accepted and ready."
        : "Accept a headline variant to lock it in."
      : "Generate a Headline — it's the first thing recruiters and LinkedIn search see."
  );

  const aboutScore = entry(
    about ? Math.min(100, (about.characterCount / 800) * 60 + (record.acceptedAboutStyle ? 40 : 20)) : 0,
    about
      ? about.characterCount < 400
        ? "Consider a fuller About section — aim for at least a few solid paragraphs."
        : "About section looks solid."
      : "Generate an About section to tell your story beyond the headline."
  );

  const experienceScore = entry(
    record.experience && record.experience.length > 0 ? Math.min(100, record.experience.length * 20) : 0,
    record.experience && record.experience.length > 0
      ? "Experience bullets are rewritten — review and tune tone as needed."
      : "Generate rewritten Experience bullets to strengthen this section."
  );

  const skillsScore = entry(
    record.skills ? Math.min(100, record.skills.reduce((sum, group) => sum + group.skills.length, 0) * 8) : 0,
    record.skills && record.skills.length > 0
      ? "Skills are categorized — consider pinning your top 3 on LinkedIn."
      : "Generate categorized Skills to make your profile more searchable."
  );

  const projectsScore = entry(
    record.projects ? Math.min(100, record.projects.length * 25) : 0,
    record.projects && record.projects.length > 0
      ? "Projects have recruiter-grade descriptions."
      : "Generate Project descriptions if you have projects on your resume."
  );

  const keywordScore = entry(
    record.seo && record.seo.keywordCoverage.length > 0
      ? ((record.seo.keywordCoverage.length - record.seo.missingKeywords.length) / record.seo.keywordCoverage.length) * 100
      : 0,
    record.seo
      ? record.seo.missingKeywords.length > 0
        ? `Work in more of your real keywords: ${record.seo.missingKeywords.slice(0, 3).join(", ")}.`
        : "Strong keyword coverage."
      : "Run the SEO analysis to see your keyword coverage."
  );

  const recruiterScore = entry(
    (headline ? 25 : 0) + (about ? 25 : 0) + (record.skills ? 25 : 0) + (record.recommendations ? 25 : 0),
    "A recruiter-ready profile needs a Headline, About, Skills, and outreach messages ready to send."
  );

  const seoScore = entry(
    record.seo?.searchRankingScore ?? 0,
    record.seo ? "See the SEO tab for keyword-level detail." : "Run the SEO analysis."
  );

  const networkingScore = entry(
    record.recommendations && record.recommendations.length > 0 ? 100 : 0,
    record.recommendations && record.recommendations.length > 0
      ? "Networking messages are ready to send."
      : "Generate recruiter/networking messages to make outreach easier."
  );

  const visibilityScore = entry(
    record.seo?.recruiterVisibilityScore ?? 0,
    record.seo ? "See the SEO tab for visibility detail." : "Run the SEO analysis to see recruiter visibility."
  );

  const scores = [
    headlineScore,
    aboutScore,
    experienceScore,
    skillsScore,
    projectsScore,
    keywordScore,
    recruiterScore,
    seoScore,
    networkingScore,
    visibilityScore,
  ];

  const overall = entry(
    scores.reduce((sum, score) => sum + score.score, 0) / scores.length,
    "Overall score is the average of every section below — improve the lowest ones first."
  );

  return {
    overall,
    headline: headlineScore,
    about: aboutScore,
    experience: experienceScore,
    skills: skillsScore,
    projects: projectsScore,
    keyword: keywordScore,
    recruiter: recruiterScore,
    seo: seoScore,
    networking: networkingScore,
    visibility: visibilityScore,
  };
}
