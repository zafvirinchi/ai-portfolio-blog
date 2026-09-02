/** Normalizes a string into a URL-safe slug: lowercase, hyphen-separated, no leading/trailing hyphens. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
