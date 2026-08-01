// This Next.js version (16.2.1 — see AGENTS.md) silently drops the
// `description`/`og:description`/`twitter:description` meta tags entirely
// when the string contains emoji — verified by isolation: an em dash alone
// renders fine, but "☕🚀" (U+2615, U+1F680) makes the whole tag vanish from
// the rendered HTML with no error. Content shown on the page itself is
// unaffected (plain React text, not an HTML attribute) — only metadata
// needs this applied.
export function stripEmojiForMetadata(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "") // supplementary-plane emoji (rockets, faces, etc.)
    .replace(/[\u{2190}-\u{2BFF}]/gu, "") // BMP symbol blocks: arrows, misc symbols (☕), dingbats
    .replace(/\u{FE0F}/gu, "") // emoji variation selector
    .replace(/\s{2,}/g, " ")
    .trim();
}
