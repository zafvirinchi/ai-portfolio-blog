import {
  CoverLetterLength,
  CoverLetterStyle,
  CoverLetterVariant,
  EmailAudience,
  EmailVariant,
  KeywordCoverage,
  LinkedinMessage,
  Reasoning,
  VariantVersion,
} from "./cover-schema";

export interface CoverLetterGenerateInput {
  jdMatchId: string;
  /** Defaults from the parsed JD's companyName when omitted. */
  companyName?: string;
  hiringManager?: string;
  /** Defaults from the parsed JD's jobTitle when omitted. */
  role?: string;
  style: CoverLetterStyle;
  length: CoverLetterLength;
}

export interface CoverLetterRecord {
  coverLetterId: string;
  jdMatchId: string;
  companyName: string;
  hiringManager: string | null;
  role: string;
  style: CoverLetterStyle;
  length: CoverLetterLength;
  /** The latest generation's A/B/C set — replaced wholesale on regenerate. */
  letterVariants: CoverLetterVariant[];
  acceptedLetter: CoverLetterVariant | null;
  /** Prior accepted letters, oldest first — for the Variants/history tab. */
  letterHistory: CoverLetterVariant[];
  emails: Partial<Record<EmailAudience, EmailVariant>>;
  linkedinMessages: LinkedinMessage[] | null;
  keywordCoverage: KeywordCoverage | null;
  reasoning: Reasoning | null;
  createdAt: string;
  updatedAt: string;
}

export type { VariantVersion };
