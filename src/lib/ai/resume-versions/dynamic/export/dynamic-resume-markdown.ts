import { DynamicResumeDocument } from "../dynamic-resume-schema";
import { getEntryPresentation, prepareForRender } from "../dynamic-resume-render";

/**
 * Renders the ENTIRE dynamic document — every visible section in
 * persisted order, every visible/non-empty entry, every visible/
 * non-empty field, including arbitrary CUSTOM sections and custom
 * fields. Unlike the legacy jd-match export (which only ever renders
 * a fixed handful of sections), this is the renderer the milestone
 * asks for: it has no hard-coded knowledge of "Experience" or
 * "Education" — it just walks sections[] and each entry's fields.
 *
 * Takes no TemplateSettings, unlike the PDF/DOCX renderers — Markdown
 * has no color/font/spacing/layout concept, so a template/theme choice
 * has nothing to actually change here (section.settings' showTitle/
 * showDivider are part of the content model, not the template).
 */
export function renderDynamicResumeMarkdown(document: DynamicResumeDocument, versionName: string): string {
  const { personalInformation } = document;
  const sections = prepareForRender(document);

  const lines: string[] = [`# ${personalInformation.name ?? "Candidate"}`];

  const contactLine = [personalInformation.email, personalInformation.phone, personalInformation.location, personalInformation.linkedin, personalInformation.github, personalInformation.website]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" · ");

  if (contactLine) lines.push(contactLine);
  lines.push(`*${versionName}*`, "");

  for (const section of sections) {
    if (section.settings.showTitle) lines.push(`## ${section.title}`);
    if (section.settings.showDivider) lines.push("---");

    for (const entry of section.entries) {
      const { heading, lines: bodyLines } = getEntryPresentation(entry);

      if (heading) lines.push(`**${heading.value}**`);
      for (const line of bodyLines) lines.push(`**${line.label}:** ${line.value}`);

      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}
