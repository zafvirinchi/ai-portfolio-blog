import type OpenAI from "openai";

// import type — see answer-types.ts for why this matters across the
// interview <-> interview-ai boundary.
import type { InterviewQuestion } from "../interview";
// Real runtime values here (.join() below), unlike answer-types.ts's
// type-only `typeof` usage — kept as a normal value import.
import { DIFFICULTY_LEVELS, EXPERIENCE_LEVELS } from "./answer-schema";

type AnswerMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// Categories where a code example is genuinely useful for an interview
// answer. Anything else (System Design, DevOps, Cloud, AI, Machine
// Learning, a behavioral question, etc.) should get codeExample: "".
const CODE_EXAMPLE_CATEGORIES = [
  "Java",
  "Spring Boot",
  "Hibernate",
  "JPA",
  "Angular",
  "React",
  "Node.js",
  "SQL",
  "MongoDB",
  "Kafka",
  "Docker",
];

function buildSystemPrompt(): string {
  return `You are a senior technical interviewer and enterprise engineering mentor
generating a reference answer for ONE interview question. You are given the
question's category, topic, and text — you must answer ONLY that question,
nothing else.

Rules:
1. Be technically correct. Never hallucinate a technology, API, method, or
   class that doesn't exist. If you are not certain a specific API exists,
   describe the concept instead of naming a fabricated API.
2. "answer" is a concise but complete, interview-ready explanation —
   enough to genuinely answer the question, not padded, not a lecture.
3. "shortAnswer" is a 1-2 sentence summary of "answer", suitable for a
   flashcard-style quick review.
4. "codeExample": only produce real, syntactically valid code if the
   category is one of: ${CODE_EXAMPLE_CATEGORIES.join(", ")} AND a code
   example genuinely clarifies the answer. Otherwise return "" — never
   force an irrelevant snippet.
5. "difficulty" must be exactly one of: ${DIFFICULTY_LEVELS.join(", ")} —
   judged by how conceptually deep the question is, not how long the
   answer is.
6. "experienceLevel" must be exactly one of: ${EXPERIENCE_LEVELS.join(", ")}
   — the seniority level a candidate would typically be expected to answer
   this well at.
7. "importantConcepts": exactly 5 key concepts a candidate must understand
   to really know this topic.
8. "commonMistakes": exactly 3 mistakes candidates commonly make when
   answering this specific question in an interview.
9. "followUpQuestions": exactly 3 realistic follow-up questions an
   interviewer would ask next.
10. "bestPractices": exactly 3 enterprise best practices related to this
    question.
11. "tags": short, lowercase-friendly labels for this question (e.g.
    "collections", "hashmap", "java", "core java", "spring", "angular",
    "rxjs", "docker", "kafka", "microservices") — reuse the given category
    and topic as tags too where relevant.
12. "confidence" (0 to 1): how confident you are that "answer" is
    technically accurate and complete.
13. "question": echo the exact question text you were given, unchanged.

Never answer a different question than the one given. Never invent
information not reasonably implied by the category/topic/question.`;
}

export function buildAnswerMessages(question: InterviewQuestion): AnswerMessage[] {
  return [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: `Category: ${question.category}\nTopic: ${question.topic}\nQuestion: ${question.question}`,
    },
  ];
}
