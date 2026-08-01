import { randomUUID } from "crypto";
import { uploadInterviewDiagram } from "../../supabase/storage";
import { LayoutLine } from "./layout-parser";
import { DetectedQuestion } from "./question-detector";
import { ExtractedPdfImage } from "./pdf-image-extractor";

const LOG_PREFIX = "[interview-document]";

/** Page range a question's answer spans — same line-range logic answer-detector.ts uses (up to the next question, or end of document). */
function computeQuestionPageRange(
  lines: LayoutLine[],
  question: DetectedQuestion,
  rangeEndLineIndex: number
): { startPage: number; endPage: number } {
  const startPage = lines.find((line) => line.lineIndex === question.startLineIndex)?.pageNumber ?? 1;
  let endPage = startPage;

  for (const line of lines) {
    if (line.lineIndex <= question.endLineIndex) continue;
    if (line.lineIndex >= rangeEndLineIndex) break;
    endPage = Math.max(endPage, line.pageNumber);
  }

  return { startPage, endPage };
}

/**
 * Associates extracted PDF images with the question(s) whose answer page
 * range they fall in, and uploads each claimed image to Supabase Storage.
 * Heuristic, not exact: a diagram is assumed to belong to whichever question
 * spans the page it's on. Each image is claimed by at most one question (the
 * largest match wins ties), so the same diagram is never attached twice.
 * Images outside every question's page range (cover pages, logos) are never
 * uploaded at all. Returns questionIndex -> public diagram URL.
 */
export async function attachDiagrams(
  lines: LayoutLine[],
  questions: DetectedQuestion[],
  images: ExtractedPdfImage[],
  documentSlug: string
): Promise<Map<number, string>> {
  const diagramUrls = new Map<number, string>();

  if (images.length === 0 || questions.length === 0) {
    return diagramUrls;
  }

  const usedImageIndexes = new Set<number>();
  const claims = new Map<number, number>();

  questions.forEach((question, questionIndex) => {
    const nextQuestion = questions[questionIndex + 1];
    const rangeEndLineIndex = nextQuestion ? nextQuestion.startLineIndex : Number.POSITIVE_INFINITY;
    const { startPage, endPage } = computeQuestionPageRange(lines, question, rangeEndLineIndex);

    let claimedImageIndex = -1;
    let claimedArea = 0;

    images.forEach((image, imageIndex) => {
      if (usedImageIndexes.has(imageIndex)) return;
      if (image.pageNumber < startPage || image.pageNumber > endPage) return;

      const area = image.width * image.height;

      if (area > claimedArea) {
        claimedArea = area;
        claimedImageIndex = imageIndex;
      }
    });

    if (claimedImageIndex >= 0) {
      usedImageIndexes.add(claimedImageIndex);
      claims.set(questionIndex, claimedImageIndex);
    }
  });

  for (const [questionIndex, imageIndex] of claims) {
    const image = images[imageIndex];
    const key = `${documentSlug}/q${questionIndex}-${randomUUID()}.png`;

    try {
      diagramUrls.set(questionIndex, await uploadInterviewDiagram(image.buffer, key));
    } catch (error) {
      console.warn(`${LOG_PREFIX} Diagram upload failed`, { questionIndex, error });
    }
  }

  return diagramUrls;
}
