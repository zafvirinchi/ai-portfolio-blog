import { TECHNOLOGY_DICTIONARY } from "../ats";
import { ResumeCertification } from "../resume-schema";
import { normalizeDate } from "./date-normalizer";
import { NormalizedCertification } from "./parser-types";

// Phase 12 Milestone 5. `skillsCovered` reuses ATS's already-exported
// TECHNOLOGY_DICTIONARY (resume-enterprise/ats) as a read-only reference
// list — this doesn't modify or depend on ATS scoring behavior, just reads
// the same curated technology names to avoid a second duplicate list.

function inferSkillsCovered(certName: string | null): string[] {
  if (!certName) return [];
  const lower = certName.toLowerCase();

  return TECHNOLOGY_DICTIONARY.filter((entry) =>
    [entry.name, ...entry.aliases].some((term) => lower.includes(term.toLowerCase()))
  ).map((entry) => entry.name);
}

export function normalizeCertifications(entries: ResumeCertification[]): NormalizedCertification[] {
  return entries.map((entry) => ({
    name: entry.name,
    vendor: entry.issuer,
    issueDate: normalizeDate(entry.date),
    expiryDate: normalizeDate(entry.expiryDate),
    credentialId: entry.credentialId,
    credentialUrl: null,
    skillsCovered: inferSkillsCovered(entry.name),
  }));
}
