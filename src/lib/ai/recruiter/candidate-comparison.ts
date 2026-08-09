import { openai } from "../openai";
import {
  COMPARISON_RECOMMENDATION_JSON_SCHEMA,
  ComparisonRecommendation,
  comparisonRecommendationLlmOutputSchema,
} from "./candidate-schema";
import { CandidateScoreBreakdown, CandidateSummary, COMPARISON_METRICS, ComparisonMetric, ComparisonRow } from "./candidate-types";

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.2;

// The side-by-side table is fully deterministic — built directly from
// each candidate's already-computed candidate-score.ts breakdown. Only
// the narrative recommendation below is LLM-generated, and it's
// strictly grounded in this same table (never invents new facts).

const METRIC_FIELD_MAP: Record<ComparisonMetric, keyof CandidateScoreBreakdown> = {
  Experience: "experienceScore",
  ATS: "atsScore",
  "JD Match": "jdMatch",
  Skills: "skillsScore",
  Projects: "projectsScore",
  Leadership: "leadershipScore",
  Communication: "communicationScore",
  Cloud: "cloudScore",
  AI: "aiScore",
  DevOps: "devOpsScore",
  "Overall Score": "overallScore",
};

export function buildComparisonTable(summaries: CandidateSummary[]): ComparisonRow[] {
  return COMPARISON_METRICS.map((metric) => ({
    metric,
    values: Object.fromEntries(summaries.map((summary) => [summary.candidateId, summary.scores[METRIC_FIELD_MAP[metric]]])),
  }));
}

function buildMessages(summaries: CandidateSummary[], table: ComparisonRow[], correction?: string) {
  const candidateLines = summaries
    .map(
      (summary) =>
        `${summary.candidateId}: ${summary.name} — ${summary.currentRole ?? "role unknown"} at ${
          summary.currentCompany ?? "unknown company"
        }, ${summary.experienceYears ?? "unknown"} yrs experience, tags: ${summary.tags.join(", ") || "none"}`
    )
    .join("\n");

  const tableLines = table
    .map(
      (row) =>
        `${row.metric}: ` +
        summaries.map((summary) => `${summary.name}=${row.values[summary.candidateId] ?? "N/A"}`).join(", ")
    )
    .join("\n");

  return [
    {
      role: "system" as const,
      content: `You are a recruiter comparing candidates for a hiring decision.

Ground every claim strictly in the data given below — never invent a
skill, company, certification, or fact about any candidate that isn't
in the data given. This includes notice period, availability, salary
expectations, location preference, or anything else not explicitly
listed below — if it isn't given, do not mention it or assume a value
for it (e.g. never say a candidate is "immediately available" unless
their notice period was explicitly given to you as such). Reference
candidates by name. Recommend a candidate (or a short-list) and explain
your ranking rationale based only on the given numeric scores and tags
— "N/A" means that score hasn't been computed yet for that candidate,
not that it's zero.${
        correction ? `\n\nYour previous attempt was rejected — fix these issues:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Candidates:\n${candidateLines}\n\nComparison scores (0-100, N/A = not yet computed):\n${tableLines}`,
    },
  ];
}

export async function generateComparisonRecommendation(
  summaries: CandidateSummary[],
  table: ComparisonRow[],
  correction?: string
): Promise<ComparisonRecommendation> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: buildMessages(summaries, table, correction),
    response_format: {
      type: "json_schema",
      json_schema: COMPARISON_RECOMMENDATION_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Candidate comparison recommendation LLM returned no content");
  }

  const parsed = comparisonRecommendationLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Candidate comparison recommendation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
