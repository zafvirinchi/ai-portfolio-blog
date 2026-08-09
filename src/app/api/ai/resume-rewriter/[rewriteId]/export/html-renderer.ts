import type { RewriteExportSections } from "./build-rewrite-sections";

// New in this milestone — no prior route in this arc has produced HTML.
// A plain, inline-styled, fully self-contained string (no external
// stylesheet/script) — simplest correct approach for a one-off download.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderListSection(title: string, items: string[]): string {
  if (items.length === 0) return "";

  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n        ")}
      </ul>
    </section>`;
}

export function renderRewriteHtml(sections: RewriteExportSections): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(sections.candidateName)} — Rewritten Resume</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 780px; margin: 40px auto; padding: 0 24px; color: #1f2937; line-height: 1.6; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 32px; border-bottom: 2px solid #1d4ed8; padding-bottom: 4px; color: #1d4ed8; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  .summary { font-size: 15px; }
</style>
</head>
<body>
  <h1>${escapeHtml(sections.candidateName)}</h1>
  <p class="summary">${escapeHtml(sections.summary)}</p>
  ${renderListSection("Experience", sections.experience)}
  ${renderListSection("Projects", sections.projects)}
  ${renderListSection("Skills", sections.skills)}
  ${renderListSection("Achievements", sections.achievements)}
  ${renderListSection("Certifications", sections.certifications)}
</body>
</html>`;
}
