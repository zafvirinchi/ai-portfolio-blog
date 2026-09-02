import { DynamicResumeDocument } from "../dynamic-resume-schema";
import { getEntryPresentation, prepareForRender } from "../dynamic-resume-render";

/**
 * Plain-text export — the same canonical pipeline as every other
 * format (prepareForRender()), with no markup at all (no `#`/`**`),
 * for maximum compatibility with the crudest ATS text parsers and
 * plain-text paste targets. Genuinely new content, not a re-labelled
 * copy of the Markdown output, so this is a real, functioning format
 * rather than a "fake button" (§30). No TemplateSettings parameter for
 * the same reason as the Markdown renderer — plain text has no
 * color/font/spacing/layout concept for a template to change.
 */
export function renderDynamicResumeTxt(document: DynamicResumeDocument, versionName: string): string {
  const { personalInformation } = document;
  const sections = prepareForRender(document);

  const lines: string[] = [(personalInformation.name ?? "Candidate").toUpperCase()];

  if (personalInformation.headline && personalInformation.headline.trim()) {
    lines.push(personalInformation.headline);
  }

  const contactLine = [personalInformation.email, personalInformation.phone, personalInformation.location, personalInformation.linkedin, personalInformation.github, personalInformation.website]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" | ");

  if (contactLine) lines.push(contactLine);
  lines.push(versionName, "");

  for (const section of sections) {
    if (section.settings.showTitle) lines.push(section.title.toUpperCase());
    if (section.settings.showDivider) lines.push("-".repeat(Math.min(60, Math.max(section.title.length, 10))));

    for (const entry of section.entries) {
      const { heading, lines: bodyLines } = getEntryPresentation(entry);

      if (heading) lines.push(heading.value);
      for (const line of bodyLines) lines.push(`${line.label}: ${line.value}`);

      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}
