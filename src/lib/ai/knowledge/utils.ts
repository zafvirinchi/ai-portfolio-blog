export function containsKeyword(
  question: string,
  keywords: string[]
) {

  const q =
    question.toLowerCase();

  return keywords.some((k) =>
    q.includes(k)
  );

}