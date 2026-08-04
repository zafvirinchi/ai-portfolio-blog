// Phase 12 Milestone 5. Generic, case-insensitive deduplication helpers
// applied across skills/technologies/tools/languages/certifications/
// projects/companies when the final SectionIntelligenceResult is
// assembled.

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(value.trim());
  }

  return result;
}

/** Dedupes by a derived key, case-insensitively. Items whose key is null are always kept (nothing to compare). */
export function dedupeBy<T>(items: T[], keyFn: (item: T) => string | null): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    const normalizedKey = key ? key.trim().toLowerCase() : null;

    if (normalizedKey === null) {
      result.push(item);
      continue;
    }

    if (seen.has(normalizedKey)) continue;

    seen.add(normalizedKey);
    result.push(item);
  }

  return result;
}
