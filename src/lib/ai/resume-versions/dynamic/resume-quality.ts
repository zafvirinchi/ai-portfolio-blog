import { DynamicResumeDocument } from "./dynamic-resume-schema";
import { getEntryPresentation, prepareForRender } from "./dynamic-resume-render";
import { ResolvedTemplateStyles } from "../templates/template-styles";

// Phase 13 — Milestone 14, §25 "Resume Quality" — informational only,
// never a gate: nothing here ever blocks export (§25's explicit "do
// not block export unless there is an actual technical failure"). Kept
// as a pure function (document + resolved styles in, a report out) so
// it's independently testable and reusable from both the builder UI
// and, if ever wanted, a server-side check — no UI logic lives here.
//
// Deliberately does NOT check "consistent dates" the way the
// milestone's own example checklist mentions — a genuine date-format/
// chronology validator would need real date parsing this codebase
// doesn't have for free-text date fields (e.g. "Jan 2022"), and a
// fabricated pass/fail here would violate the "no fake data" rule
// this whole project has followed since Phase 13's first milestone.
// Every check below is something this function can actually verify.

export interface QualityCheck {
  label: string;
  passed: boolean;
}

export interface ResumeQualityReport {
  checks: QualityCheck[];
  warnings: string[];
  estimatedPageCount: number;
}

/** A rough, explicitly-approximate characters-per-page estimate for a standard resume page at standard font size/spacing — used only to warn, never to silently trim content (§24's explicit "do not aggressively delete content merely to fit one page"). */
const CHARS_PER_PAGE_ESTIMATE = 3200;

function entryCharacterCount(entry: ReturnType<typeof prepareForRender>[number]["entries"][number]): number {
  const { heading, lines } = getEntryPresentation(entry);
  return (heading?.value.length ?? 0) + lines.reduce((sum, line) => sum + line.label.length + line.value.length, 0);
}

export function checkResumeQuality(document: DynamicResumeDocument, styles: ResolvedTemplateStyles): ResumeQualityReport {
  const renderableSections = prepareForRender(document);
  const warnings: string[] = [];

  const hasEmail = Boolean(document.personalInformation.email?.trim());
  const hasPhone = Boolean(document.personalInformation.phone?.trim());
  const contactComplete = hasEmail && hasPhone;
  if (!contactComplete) warnings.push("Contact information incomplete — add an email and phone number.");

  const visibleSectionCount = document.sections.filter((section) => section.visible).length;
  const emptyVisibleSectionCount = visibleSectionCount - renderableSections.length;
  const noEmptySections = emptyVisibleSectionCount <= 0;
  if (!noEmptySections) {
    warnings.push(`${emptyVisibleSectionCount} visible section${emptyVisibleSectionCount > 1 ? "s have" : " has"} no visible content — hide ${emptyVisibleSectionCount > 1 ? "them" : "it"} or add content.`);
  }

  const thinSections = renderableSections.filter((section) => {
    const totalChars = section.entries.reduce((sum, entry) => sum + entryCharacterCount(entry), 0);
    return totalChars > 0 && totalChars < 20;
  });
  if (thinSections.length > 0) {
    warnings.push(`Some sections contain very little content: ${thinSections.map((section) => section.title).join(", ")}.`);
  }

  const totalCharacters = renderableSections.reduce((sum, section) => sum + section.entries.reduce((entrySum, entry) => entrySum + entryCharacterCount(entry), 0), 0);
  const estimatedPageCount = Math.max(1, Math.ceil(totalCharacters / CHARS_PER_PAGE_ESTIMATE));

  if (estimatedPageCount > 2) {
    warnings.push(`Resume content is long — estimated at ${estimatedPageCount} pages. Consider trimming less relevant content.`);
  }
  if (styles.pageLength === "one" && estimatedPageCount > 1) {
    warnings.push("Content likely exceeds one page even though Page Length is set to 'One Page'.");
  }

  const checks: QualityCheck[] = [
    { label: "No empty visible sections", passed: noEmptySections },
    { label: "No very thin sections", passed: thinSections.length === 0 },
    { label: "Contact information complete", passed: contactComplete },
    { label: "ATS-friendly structure", passed: styles.atsFriendliness === "high" },
    { label: "Fits within 2 pages", passed: estimatedPageCount <= 2 },
  ];

  return { checks, warnings, estimatedPageCount };
}
