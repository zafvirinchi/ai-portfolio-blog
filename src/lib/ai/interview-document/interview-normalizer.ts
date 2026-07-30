import { z } from "zod";
import { openai } from "../openai";
import { detectCategory } from "../interview/category-detector";
import { DetectedQuestion } from "./question-detector";
import { DetectedAnswer } from "./answer-detector";
import { DetectedTopic, findTopicForLine } from "./topic-detector";

export type AnswerSource = "ORIGINAL" | "GENERATED";

export interface DocumentQuestion {
  question: string;
  category: string;
  topic: string;
  answer: string;
  answerSource: AnswerSource;
  confidence: number;
  order: number;
  documentName: string;
}

const LOG_PREFIX = "[interview-document]";
const GENERATION_MODEL = "gpt-4o-mini";

// The spec's 11-section structure, generated as separate fields via
// OpenAI Structured Outputs (same raw-SDK + strict json_schema + Zod
// pattern as interview-ai/answer-generator.ts) and then formatted into one
// markdown answer string — there's no dedicated column per section, only
// a single `answer` text column, matching how Milestone 2/3 already fold
// AI-enrichment metadata into that same field.
const generatedAnswerSchema = z.object({
  shortAnswer: z.string().min(1),
  detailedExplanation: z.string().min(1),
  internalWorking: z.string(),
  realProjectExample: z.string(),
  advantages: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
  bestPractices: z.array(z.string()).default([]),
  commonMistakes: z.array(z.string()).default([]),
  // "" when the question has no natural code example — never invented.
  codeExample: z.string(),
  interviewTips: z.string(),
});

export type GeneratedAnswer = z.infer<typeof generatedAnswerSchema>;

const GENERATED_ANSWER_JSON_SCHEMA: { name: string; strict: true; schema: Record<string, unknown> } = {
  name: "interview_document_generated_answer",
  strict: true,
  schema: {
    type: "object",
    properties: {
      shortAnswer: { type: "string" },
      detailedExplanation: { type: "string" },
      internalWorking: { type: "string" },
      realProjectExample: { type: "string" },
      advantages: { type: "array", items: { type: "string" } },
      limitations: { type: "array", items: { type: "string" } },
      followUpQuestions: { type: "array", items: { type: "string" } },
      bestPractices: { type: "array", items: { type: "string" } },
      commonMistakes: { type: "array", items: { type: "string" } },
      codeExample: { type: "string" },
      interviewTips: { type: "string" },
    },
    required: [
      "shortAnswer",
      "detailedExplanation",
      "internalWorking",
      "realProjectExample",
      "advantages",
      "limitations",
      "followUpQuestions",
      "bestPractices",
      "commonMistakes",
      "codeExample",
      "interviewTips",
    ],
    additionalProperties: false,
  },
};

function buildGenerationMessages(question: string, category: string, topic: string) {
  return [
    {
      role: "system" as const,
      content:
        "You are a senior technical interviewer writing enterprise-quality answers for a technical " +
        "interview question bank. Keep answers technically accurate and concise — do not pad with " +
        "unnecessary paragraphs. Only fill advantages/limitations/bestPractices/commonMistakes/" +
        "followUpQuestions with items that are genuinely relevant to this specific question; return an " +
        "empty array rather than inventing filler. Only fill codeExample when a code sample is natural " +
        "for this question (e.g. not for a behavioral or purely conceptual question) — return \"\" otherwise.",
    },
    {
      role: "user" as const,
      content: `Category: ${category}\nTopic: ${topic}\nQuestion: ${question}\n\nGenerate a complete interview answer.`,
    },
  ];
}

/** Generates one structured answer for a single question — exported standalone for the admin "Regenerate Answer" action, not just internal pipeline use. */
export async function generateDocumentAnswer(
  question: string,
  category: string,
  topic: string
): Promise<GeneratedAnswer> {
  const completion = await openai.chat.completions.create({
    model: GENERATION_MODEL,
    temperature: 0.3,
    messages: buildGenerationMessages(question, category, topic),
    response_format: { type: "json_schema", json_schema: GENERATED_ANSWER_JSON_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Interview document answer generation returned no content");
  }

  const parsed = generatedAnswerSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Generated answer failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

function renderList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/** Renders the 11-section structured answer into one markdown string for storage/display. */
export function formatGeneratedAnswer(generated: GeneratedAnswer): string {
  const sections: string[] = [
    `**Short Interview Answer**\n${generated.shortAnswer}`,
    `**Detailed Explanation**\n${generated.detailedExplanation}`,
  ];

  if (generated.internalWorking.trim()) sections.push(`**Internal Working**\n${generated.internalWorking}`);
  if (generated.realProjectExample.trim()) sections.push(`**Real Project Example**\n${generated.realProjectExample}`);
  if (generated.advantages.length) sections.push(`**Advantages**\n${renderList(generated.advantages)}`);
  if (generated.limitations.length) sections.push(`**Limitations**\n${renderList(generated.limitations)}`);
  if (generated.followUpQuestions.length)
    sections.push(`**Common Follow-up Questions**\n${renderList(generated.followUpQuestions)}`);
  if (generated.bestPractices.length) sections.push(`**Best Practices**\n${renderList(generated.bestPractices)}`);
  if (generated.commonMistakes.length) sections.push(`**Common Mistakes**\n${renderList(generated.commonMistakes)}`);
  if (generated.codeExample.trim()) sections.push(`**Code Example**\n\`\`\`\n${generated.codeExample}\n\`\`\``);
  if (generated.interviewTips.trim()) sections.push(`**Interview Tips**\n${generated.interviewTips}`);

  return sections.join("\n\n");
}

// Cap on simultaneous in-flight OpenAI requests — same pattern and limit
// as interview-ai/answer-service.ts.
const MAX_CONCURRENT_GENERATIONS = 3;

async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function lane(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  const lanes = Array.from({ length: Math.min(limit, items.length) }, () => lane());
  await Promise.all(lanes);

  return results;
}

/**
 * Builds the final per-question shape: resolves topic (nearest preceding
 * known heading) and category (reusing interview/category-detector.ts,
 * unchanged), then EITHER preserves the document's own answer verbatim
 * (answerSource: ORIGINAL, no LLM call at all) OR — only when the
 * document truly has no answer — generates one in the 11-section format
 * (answerSource: GENERATED). A generation failure never fails the whole
 * batch: that question is left with an empty answer, still marked
 * GENERATED, and the batch continues — same isolation principle as
 * interview-ai/answer-service.ts.
 */
export async function normalizeQuestions(
  questions: DetectedQuestion[],
  answers: DetectedAnswer[],
  topics: DetectedTopic[],
  documentName: string
): Promise<DocumentQuestion[]> {
  let preservedCount = 0;
  let generatedCount = 0;

  const results = await mapWithConcurrencyLimit(questions, MAX_CONCURRENT_GENERATIONS, async (question, index) => {
    const detectedAnswer = answers[index];
    const topic = findTopicForLine(topics, question.startLineIndex)?.topic ?? "General";
    const { category } = detectCategory(topic, `${question.question} ${detectedAnswer.answer}`);

    if (detectedAnswer.hasOriginalAnswer) {
      preservedCount++;

      return {
        question: question.question,
        category,
        topic,
        answer: detectedAnswer.answer,
        answerSource: "ORIGINAL" as const,
        confidence: question.confidence,
        order: question.order,
        documentName,
      };
    }

    let answer = "";

    try {
      const generated = await generateDocumentAnswer(question.question, category, topic);
      answer = formatGeneratedAnswer(generated);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Answer generation failed, leaving answer empty`, {
        question: question.question.slice(0, 60),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    generatedCount++;

    return {
      question: question.question,
      category,
      topic,
      answer,
      answerSource: "GENERATED" as const,
      confidence: question.confidence,
      order: question.order,
      documentName,
    };
  });

  console.log(`${LOG_PREFIX} Answers Preserved`, { count: preservedCount });
  console.log(`${LOG_PREFIX} Answers Generated`, { count: generatedCount });

  return results;
}
