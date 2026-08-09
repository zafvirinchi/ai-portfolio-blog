import { openai } from "../openai";
import {
  TOP_CANDIDATES_RECOMMENDATION_JSON_SCHEMA,
  topCandidatesRecommendationLlmOutputSchema,
} from "./candidate-schema";
import { RankedCandidate, TopCandidatesRecommendation } from "./candidate-types";

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.2;

// The top-N slice itself is a deterministic read of candidate-ranking.ts's
// already-computed ranking — only the narrative explanation below is
// LLM-generated, and it's instructed not to re-rank, only to explain the
// given order. Reused by both the UI Recommendations panel and the chat
// "recommend top 5 candidates" command.

function buildMessages(top: RankedCandidate[]) {
  const lines = top
    .map(
      (item) =>
        `#${item.rank} ${item.summary.name} — ranking score ${item.rankingScore}/100, ${
          item.summary.currentRole ?? "role unknown"
        }, ${item.summary.experienceYears ?? "unknown"} yrs experience, tags: ${
          item.summary.tags.join(", ") || "none"
        }, ATS ${item.summary.scores.atsScore ?? "N/A"}, JD Match ${item.summary.scores.jdMatch ?? "N/A"}`
    )
    .join("\n");

  return [
    {
      role: "system" as const,
      content: `You are a recruiter analyst summarizing why these already-
ranked candidates were recommended. Ground every claim strictly in the
data given below — never invent a fact about any candidate, including
notice period, availability, salary expectations, or location
preference; if it isn't given, do not mention it or assume a value for
it. Do not re-rank them — the order given is final; just explain it
concisely (a short paragraph is enough).`,
    },
    {
      role: "user" as const,
      content: `Top-ranked candidates:\n${lines}`,
    },
  ];
}

export async function generateTopCandidatesRecommendation(
  ranked: RankedCandidate[],
  topN: number
): Promise<TopCandidatesRecommendation> {
  const top = ranked.slice(0, Math.max(1, topN));

  if (top.length === 0) {
    return { candidateIds: [], candidates: [], summary: "No candidates in the workspace yet — import resumes to get started." };
  }

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: buildMessages(top),
    response_format: {
      type: "json_schema",
      json_schema: TOP_CANDIDATES_RECOMMENDATION_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Top-candidates recommendation LLM returned no content");
  }

  const parsed = topCandidatesRecommendationLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Top-candidates recommendation failed schema validation: ${parsed.error.message}`);
  }

  return {
    candidateIds: top.map((item) => item.candidateId),
    candidates: top.map((item) => item.summary),
    summary: parsed.data.summary,
  };
}
